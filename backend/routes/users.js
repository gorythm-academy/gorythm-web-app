const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const { logAudit } = require('../utils/audit');
const { validate, rules } = require('../middleware/validate');
const { activeUserFilter, trashedUserFilter } = require('../utils/userQuery');
const { softTrashUser, restoreTrashedUser } = require('../services/softTrashUser');
const { cleanupTeacherOnTrash } = require('../services/cleanupTeacherOnTrash');
const { userHasFinancialRecords } = require('../services/financialGuards');
// NOTE: studentId is now manual-entry only (no auto-generation).

router.use(authMiddleware);
router.use(validateSessionUser);
router.use(allowRoles('super-admin', 'manager'));

/** Treat missing isActive as true (legacy documents). */
const isUserActive = (u) => u.isActive !== false;
const USER_STATUS_OPTIONS = ['active', 'pending', 'inactive', 'completed'];
const normalizeUserStatus = (status, fallbackIsActive = true) => {
    if (USER_STATUS_OPTIONS.includes(status)) return status;
    return fallbackIsActive ? 'active' : 'inactive';
};
const isLoginAllowedFromStatus = (status) => status === 'active';

const ensureStudentPlaceholderEnrollment = async (userId, statusOverride) => {
    const normalizedStatus = USER_STATUS_OPTIONS.includes(statusOverride)
        ? statusOverride
        : 'pending';

    const existingEnrollment = await Enrollment.findOne({ student: userId });
    if (existingEnrollment) return existingEnrollment;

    return Enrollment.create({
        student: userId,
        course: null,
        status: normalizedStatus,
        progress: 0,
        grade: null,
        enrollmentDate: new Date(),
        lastAccessed: new Date(),
        paymentStatus: 'pending',
    });
};

/** Mirror People status onto the student's placeholder enrollment(s) (course = null only). */
const syncPlaceholderEnrollmentStatus = async (userId, status) => {
    if (!USER_STATUS_OPTIONS.includes(status)) return;
    const update = { status };
    if (status === 'completed') update.completionDate = new Date();
    await Enrollment.updateMany(
        {
            student: userId,
            $or: [{ course: null }, { course: { $exists: false } }],
        },
        update,
    );
};

const cleanupStudentDataForUserIds = async (userIds = []) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return;

    const normalizedIds = userIds.map((id) => String(id));

    // Remove enrollments that belong to deleted people records.
    await Enrollment.deleteMany({ student: { $in: normalizedIds } });

    // Remove deleted student references from all course rosters.
    await Course.updateMany(
        { students: { $in: normalizedIds } },
        { $pull: { students: { $in: normalizedIds } } }
    );
};

const PEOPLE_ROLES = ['student', 'teacher', 'parent'];
const STAFF_ROLES = ['manager', 'super-admin', 'accountant'];
const isManagerActor = (role) => role === 'manager';
const ALL_MANAGED_ROLES = [...PEOPLE_ROLES, ...STAFF_ROLES];

// Get all users (with pagination)
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, role, roles, search, segment } = req.query;
        
        // Build filter
        const filter = {};
        // Prefer explicit segment (role tabs) — avoids query-string comma issues
        if (segment === 'people') {
            filter.role = { $in: PEOPLE_ROLES };
        } else if (segment === 'students') {
            filter.role = 'student';
        } else if (segment === 'teachers') {
            filter.role = 'teacher';
        } else if (segment === 'parents') {
            filter.role = 'parent';
        } else if (segment === 'staff') {
            filter.role = { $in: STAFF_ROLES };
        } else if (roles) {
            const list = String(roles)
                .split(',')
                .map((r) => r.trim())
                .filter((r) => ALL_MANAGED_ROLES.includes(r));
            if (list.length) {
                filter.role = { $in: list };
            } else {
                // Invalid roles value: return empty set instead of all users
                filter._id = { $in: [] };
            }
        } else if (role && role !== 'all') {
            filter.role = role;
        }
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const trash = req.query.trash === 'true' || req.query.trash === '1';
        Object.assign(filter, trash ? trashedUserFilter() : activeUserFilter());

        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(filter);
        const trashCountFilter = { ...trashedUserFilter() };
        if (segment === 'people') {
            trashCountFilter.role = { $in: PEOPLE_ROLES };
        } else if (segment === 'students') {
            trashCountFilter.role = 'student';
        } else if (segment === 'teachers') {
            trashCountFilter.role = 'teacher';
        } else if (segment === 'parents') {
            trashCountFilter.role = 'parent';
        } else if (segment === 'staff') {
            trashCountFilter.role = { $in: STAFF_ROLES };
        } else if (filter.role) {
            trashCountFilter.role = filter.role;
        }
        const trashCount = await User.countDocuments(trashCountFilter);

        res.json({
            success: true,
            users: users.map(user => ({
                _id: user._id,
                studentId: user.studentId || null,
                name: user.name,
                email: user.email,
                personalEmail: user.personalEmail || '',
                role: user.role,
                phone: user.phone || '',
                avatar: user.avatar,
                isActive: isUserActive(user),
                mustChangePassword: user.mustChangePassword,
                isSystemAccount: !!user.isSystemAccount,
                status: normalizeUserStatus(user.status, isUserActive(user)),
                enrolledCourses: user.enrolledCourses?.length || 0,
                joinDate: user.createdAt,
                lastLogin: user.lastLogin || null,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                deletedAt: user.deletedAt || null,
            })),
            total,
            trashCount,
            page: parseInt(page),
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        req.log.error('Error fetching users', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

// Get single user
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                _id: user._id,
                studentId: user.studentId || null,
                name: user.name,
                email: user.email,
                personalEmail: user.personalEmail || '',
                role: user.role,
                phone: user.phone || '',
                avatar: user.avatar,
                isActive: isUserActive(user),
                mustChangePassword: user.mustChangePassword,
                isSystemAccount: !!user.isSystemAccount,
                status: normalizeUserStatus(user.status, isUserActive(user)),
                enrolledCourses: user.enrolledCourses?.length || 0,
                joinDate: user.createdAt,
                lastLogin: user.lastLogin || null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
});

// Create new user (super-admin: any role; manager: student / teacher / parent only)
router.post(
    '/',
    validate([
        rules.requiredString('name', 'Name'),
        rules.requiredString('email', 'Email'),
        rules.email('email', 'Email'),
        rules.requiredString('password', 'Password', 6),
    ]),
    async (req, res) => {
    try {
        const { name, email, password, role, phone, mustChangePassword, personalEmail, studentId, status } = req.body;

        const actorRole = req.user?.role;
        const isSuper = actorRole === 'super-admin';
        const isAdmin = isManagerActor(actorRole);
        if (!isSuper && !isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden'
            });
        }

        let nextRole = role || 'student';
        if (nextRole === 'admin') nextRole = 'manager';
        if (isAdmin && !isSuper && !PEOPLE_ROLES.includes(nextRole)) {
            return res.status(403).json({
                success: false,
                error: 'Admins can only create student, teacher, or parent accounts'
            });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'User with this email already exists' 
            });
        }

        const normalizedStatus = normalizeUserStatus(status, true);
        const userFields = {
            name,
            email: email.toLowerCase(),
            password,
            role: nextRole,
            phone: phone || '',
            status: normalizedStatus,
            isActive: isLoginAllowedFromStatus(normalizedStatus),
            mustChangePassword: mustChangePassword !== false,
            isSystemAccount: role === 'super-admin'
        };

        if (nextRole === 'student') {
            const sid = String(studentId || '').trim();
            if (sid) {
                if (!/^GRT-\d{4}-\d{3}$/.test(sid)) {
                    return res.status(400).json({ success: false, error: 'Invalid student ID format' });
                }
                const existingSid = await User.findOne({ studentId: sid });
                if (existingSid) {
                    return res.status(400).json({ success: false, error: 'Student ID already in use' });
                }
                userFields.studentId = sid;
            }
        }

        if (personalEmail !== undefined && personalEmail !== null) {
            const pe = String(personalEmail).trim();
            if (pe && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pe)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid personal email format',
                });
            }
            userFields.personalEmail = pe;
        }

        const user = new User(userFields);
        await user.save();

        // Auto-create a placeholder enrollment so students appear on the Enrollment tab immediately.
        // The placeholder has course = null; it gets filled when admin assigns a course.
        // Status mirrors the People status admin chose at creation time.
        if (nextRole === 'student') {
            await ensureStudentPlaceholderEnrollment(user._id, user.status);
        }

        await logAudit({
            actor: req.user.userId || req.user.id,
            action: 'user.create',
            targetType: 'User',
            targetId: user._id.toString(),
            details: { role: user.role, email: user.email }
        });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: {
                _id: user._id,
                studentId: user.studentId || null,
                name: user.name,
                email: user.email,
                personalEmail: user.personalEmail || '',
                role: user.role,
                phone: user.phone,
                isActive: isUserActive(user),
                mustChangePassword: user.mustChangePassword,
                isSystemAccount: !!user.isSystemAccount,
                status: normalizeUserStatus(user.status, isUserActive(user)),
                enrolledCourses: 0,
                joinDate: user.createdAt,
                lastLogin: null
            }
        });
    } catch (error) {
        req.log.error('Error creating user', { err: error });
        res.status(500).json({ success: false, error: 'Failed to create user' });
    }
});

// Update user
router.put(
    '/:id',
    validate([
        rules.requiredString('name', 'Name'),
        rules.requiredString('email', 'Email'),
        rules.email('email', 'Email'),
    ]),
    async (req, res) => {
    try {
        const { name, email, role, phone, isActive, personalEmail, studentId, status } = req.body;
        const actorRole = req.user?.role;
        let nextRole = role;
        if (nextRole === 'admin') nextRole = 'manager';

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (isManagerActor(actorRole) && (user.role === 'super-admin' || user.isSystemAccount)) {
            return res.status(403).json({ success: false, error: 'You cannot modify super-admin accounts' });
        }
        if (isManagerActor(actorRole) && nextRole === 'super-admin') {
            return res.status(403).json({ success: false, error: 'Cannot assign super-admin role' });
        }
        if (isManagerActor(actorRole) && nextRole && PEOPLE_ROLES.includes(user.role) && !PEOPLE_ROLES.includes(nextRole)) {
            return res.status(403).json({
                success: false,
                error: 'Admins cannot change learner accounts into staff roles',
            });
        }

        // Check if email is being changed and if it already exists
        if (email && email.toLowerCase() !== user.email) {
            const existingUser = await User.findOne({ 
                email: email.toLowerCase(),
                _id: { $ne: req.params.id }
            });
            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Email already in use by another user' 
                });
            }
            user.email = email.toLowerCase();
        }

        const wasStudent = user.role === 'student';

        // Update fields
        if (name) user.name = name;
        if (role) user.role = nextRole;
        if (phone !== undefined) user.phone = phone;
        if (status !== undefined) {
            const normalizedStatus = normalizeUserStatus(status, isUserActive(user));
            user.status = normalizedStatus;
            const loginAllowed = isLoginAllowedFromStatus(normalizedStatus);
            user.isActive = loginAllowed;
            user.canLogin = loginAllowed;
        } else if (isActive !== undefined) {
            user.isActive = isActive;
            user.canLogin = !!isActive;
            user.status = isActive ? 'active' : 'inactive';
        }

        if (personalEmail !== undefined) {
            const pe = String(personalEmail).trim();
            if (pe && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pe)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid personal email format',
                });
            }
            user.personalEmail = pe;
        }

        if (studentId !== undefined && user.role === 'student') {
            const sid = String(studentId || '').trim();
            if (sid && !/^GRT-\d{4}-\d{3}$/.test(sid)) {
                return res.status(400).json({ success: false, error: 'Invalid student ID format' });
            }
            if (sid) {
                const existingSid = await User.findOne({ studentId: sid, _id: { $ne: user._id } });
                if (existingSid) {
                    return res.status(400).json({ success: false, error: 'Student ID already in use' });
                }
                user.studentId = sid;
            }
        }

        // No auto-generation: studentId is set only when explicitly provided.
        
        user.updatedAt = Date.now();
        await user.save();

        if (!wasStudent && user.role === 'student') {
            await ensureStudentPlaceholderEnrollment(user._id, user.status);
        }

        // Keep the placeholder enrollment status in sync with People status
        // (only affects rows where course is still unassigned).
        if (user.role === 'student' && status !== undefined) {
            await syncPlaceholderEnrollmentStatus(user._id, user.status);
        }

        await logAudit({
            actor: req.user.userId || req.user.id,
            action: 'user.update',
            targetType: 'User',
            targetId: user._id.toString(),
            details: { role: user.role, isActive: user.isActive }
        });

        res.json({
            success: true,
            message: 'User updated successfully',
            user: {
                _id: user._id,
                studentId: user.studentId || null,
                name: user.name,
                email: user.email,
                personalEmail: user.personalEmail || '',
                role: user.role,
                phone: user.phone,
                isActive: isUserActive(user),
                mustChangePassword: user.mustChangePassword,
                isSystemAccount: !!user.isSystemAccount,
                status: normalizeUserStatus(user.status, isUserActive(user)),
                enrolledCourses: user.enrolledCourses?.length || 0,
                joinDate: user.createdAt,
                lastLogin: user.lastLogin || null
            }
        });
    } catch (error) {
        req.log.error('Error updating user', { err: error });
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

// Update user password
router.patch(
    '/:id/password',
    validate([rules.requiredString('password', 'Password', 6)]),
    async (req, res) => {
    try {
        const { password } = req.body;
        const actorRole = req.user?.role;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (isManagerActor(actorRole) && (user.role === 'super-admin' || user.isSystemAccount)) {
            return res.status(403).json({ success: false, error: 'You cannot change this account password' });
        }

        user.password = password;
        user.updatedAt = Date.now();
        await user.save();
        await logAudit({
            actor: req.user.userId || req.user.id,
            action: 'user.password.reset',
            targetType: 'User',
            targetId: user._id.toString(),
            details: {}
        });

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update password' });
    }
});

// Update user status
router.patch('/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const actorRole = req.user?.role;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (isManagerActor(actorRole) && (user.role === 'super-admin' || user.isSystemAccount)) {
            return res.status(403).json({ success: false, error: 'You cannot change super-admin account status' });
        }

        const normalizedStatus = normalizeUserStatus(status, isUserActive(user));
        user.status = normalizedStatus;
        user.isActive = isLoginAllowedFromStatus(normalizedStatus);
        user.updatedAt = Date.now();
        await user.save();

        // Mirror onto placeholder enrollment(s) so Students data shows the same status.
        if (user.role === 'student') {
            await syncPlaceholderEnrollmentStatus(user._id, user.status);
        }

        await logAudit({
            actor: req.user.userId || req.user.id,
            action: 'user.status.update',
            targetType: 'User',
            targetId: user._id.toString(),
            details: { status }
        });

        res.json({
            success: true,
            message: `User status updated to ${user.status}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update user status' });
    }
});

// Soft-delete user (move to trash)
router.delete('/:id', async (req, res) => {
    try {
        const existing = await User.findOne({ _id: req.params.id, ...activeUserFilter() });
        if (!existing) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (existing.isSystemAccount) {
            return res.status(403).json({ success: false, error: 'System account cannot be deleted' });
        }
        if (existing.role === 'super-admin' && req.user?.role !== 'super-admin') {
            return res.status(403).json({ success: false, error: 'Only super-admin can delete super-admin accounts' });
        }

        await softTrashUser(existing);
        await logAudit({
            actor: req.user.userId || req.user.id,
            action: 'user.trash',
            targetType: 'User',
            targetId: req.params.id,
            details: { role: existing.role },
        });

        res.json({
            success: true,
            message: 'User moved to trash',
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to move user to trash' });
    }
});

// Restore user from trash
router.patch('/:id/restore', async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.params.id, ...trashedUserFilter() });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found in trash' });
        }
        await restoreTrashedUser(user);
        res.json({ success: true, message: 'User restored' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore user' });
    }
});

// Permanently delete user (must be in trash)
router.delete('/:id/permanent', async (req, res) => {
    try {
        const existing = await User.findOne({ _id: req.params.id, ...trashedUserFilter() });
        if (!existing) {
            return res.status(404).json({ success: false, error: 'User must be in trash before permanent delete' });
        }
        if (existing.isSystemAccount) {
            return res.status(403).json({ success: false, error: 'System account cannot be deleted' });
        }
        if (existing.role === 'super-admin' && req.user?.role !== 'super-admin') {
            return res.status(403).json({ success: false, error: 'Only super-admin can delete super-admin accounts' });
        }

        if (await userHasFinancialRecords(existing._id)) {
            return res.status(400).json({
                success: false,
                error: 'Cannot permanently delete: this account has payment or payroll records. Keep in trash for archive.',
            });
        }

        if (existing.role === 'teacher') {
            await cleanupTeacherOnTrash(existing._id);
        }

        const ParentStudentLink = require('../models/ParentStudentLink');
        await ParentStudentLink.deleteMany({
            $or: [{ parent: req.params.id }, { student: req.params.id }],
        });

        const user = await User.findByIdAndDelete(req.params.id);
        await logAudit({
            actor: req.user.userId || req.user.id,
            action: 'user.delete',
            targetType: 'User',
            targetId: req.params.id,
            details: {},
        });

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await cleanupStudentDataForUserIds([req.params.id]);

        res.json({
            success: true,
            message: 'User permanently deleted',
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete user' });
    }
});

/** Courses where this user is instructor (syncs with Courses tab). */
router.get('/:id/assigned-courses', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('role name');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if (user.role !== 'teacher') {
            return res.status(400).json({ success: false, error: 'User is not a teacher' });
        }
        const courses = await Course.find({ instructor: user._id }).select('title category').sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assigned courses' });
    }
});

router.put('/:id/assigned-courses', async (req, res) => {
    try {
        const { courseIds = [], releaseToTeacherId } = req.body;
        const teacher = await User.findById(req.params.id);
        if (!teacher) return res.status(404).json({ success: false, error: 'User not found' });
        if (teacher.role !== 'teacher') {
            return res.status(400).json({ success: false, error: 'User is not a teacher' });
        }
        const ids = (Array.isArray(courseIds) ? courseIds : []).map(String).filter(Boolean);
        const toRelease = await Course.find({
            instructor: teacher._id,
            _id: { $nin: ids },
        });
        if (toRelease.length > 0) {
            if (!releaseToTeacherId) {
                return res.status(400).json({
                    success: false,
                    error: 'Choose a teacher to take over courses you remove from this teacher',
                    coursesToReassign: toRelease.map((c) => ({ _id: c._id, title: c.title })),
                });
            }
            const replacement = await User.findById(releaseToTeacherId);
            if (!replacement || replacement.role !== 'teacher') {
                return res.status(400).json({ success: false, error: 'Invalid replacement teacher' });
            }
            await Course.updateMany(
                { _id: { $in: toRelease.map((c) => c._id) } },
                { $set: { instructor: replacement._id, instructorName: replacement.name } }
            );
        }
        for (const cid of ids) {
            const course = await Course.findById(cid);
            if (!course) continue;
            await Course.findByIdAndUpdate(cid, {
                instructor: teacher._id,
                instructorName: teacher.name,
            });
        }
        const assigned = await Course.find({ instructor: teacher._id }).select('title category').sort({ title: 1 });
        res.json({ success: true, courses: assigned });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update assigned courses' });
    }
});

/** Parent ↔ student links for Parents tab (same data as LMS). */
router.get('/:id/child-links', async (req, res) => {
    try {
        const ParentStudentLink = require('../models/ParentStudentLink');
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if (user.role !== 'parent') {
            return res.status(400).json({ success: false, error: 'User is not a parent' });
        }
        const links = await ParentStudentLink.find({ parent: user._id })
            .populate('student', 'name email studentId')
            .sort({ createdAt: -1 });
        const students = await User.find({ role: 'student', ...activeUserFilter() })
            .select('name email studentId')
            .sort({ name: 1 });
        res.json({ success: true, links, students });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load child links' });
    }
});

router.post('/:id/child-links', async (req, res) => {
    try {
        const ParentStudentLink = require('../models/ParentStudentLink');
        const { studentId, relation = 'guardian' } = req.body;
        const parent = await User.findById(req.params.id);
        if (!parent || parent.role !== 'parent') {
            return res.status(400).json({ success: false, error: 'Invalid parent' });
        }
        if (!studentId) {
            return res.status(400).json({ success: false, error: 'studentId is required' });
        }
        const student = await User.findOne({ _id: studentId, role: 'student', ...activeUserFilter() });
        if (!student) {
            return res.status(400).json({ success: false, error: 'Student not found or removed' });
        }
        const link = await ParentStudentLink.findOneAndUpdate(
            { parent: parent._id, student: studentId },
            { relation },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        )
            .populate('parent', 'name email')
            .populate('student', 'name email studentId');
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to link child' });
    }
});

router.delete('/:id/child-links/:linkId', async (req, res) => {
    try {
        const ParentStudentLink = require('../models/ParentStudentLink');
        const parent = await User.findById(req.params.id);
        if (!parent || parent.role !== 'parent') {
            return res.status(400).json({ success: false, error: 'Invalid parent' });
        }
        const link = await ParentStudentLink.findOne({ _id: req.params.linkId, parent: parent._id });
        if (!link) return res.status(404).json({ success: false, error: 'Link not found' });
        await ParentStudentLink.findByIdAndDelete(link._id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to remove link' });
    }
});

// Bulk delete users
router.post('/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No user IDs provided' });
        }

        const systemCount = await User.countDocuments({
            _id: { $in: ids },
            isSystemAccount: true,
        });
        if (systemCount > 0) {
            return res.status(403).json({ success: false, error: 'Selection contains protected system account(s)' });
        }
        if (isManagerActor(req.user?.role)) {
            const superCount = await User.countDocuments({
                _id: { $in: ids },
                role: 'super-admin',
            });
            if (superCount > 0) {
                return res.status(403).json({ success: false, error: 'Admins cannot delete super-admin accounts' });
            }
        }

        const usersToTrash = await User.find({ _id: { $in: ids }, ...activeUserFilter() });
        let trashed = 0;
        for (const user of usersToTrash) {
            if (user.isSystemAccount) continue;
            if (user.role === 'super-admin' && req.user?.role !== 'super-admin') continue;
            await softTrashUser(user);
            trashed += 1;
        }

        res.json({
            success: true,
            message: `${trashed} user(s) moved to trash`,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete users' });
    }
});

// Bulk update status
router.patch('/bulk-status', async (req, res) => {
    try {
        const { ids, status } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No user IDs provided' });
        }

        if (!USER_STATUS_OPTIONS.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const systemCount = await User.countDocuments({
            _id: { $in: ids },
            isSystemAccount: true,
        });
        if (systemCount > 0) {
            return res.status(403).json({ success: false, error: 'Selection contains protected system account(s)' });
        }
        if (isManagerActor(req.user?.role)) {
            const superCount = await User.countDocuments({
                _id: { $in: ids },
                role: 'super-admin',
            });
            if (superCount > 0) {
                return res.status(403).json({ success: false, error: 'Admins cannot change super-admin account status' });
            }
        }

        await User.updateMany(
            { _id: { $in: ids } },
            {
                status,
                isActive: isLoginAllowedFromStatus(status),
                updatedAt: Date.now()
            }
        );

        // Mirror onto placeholder enrollments for affected students.
        const studentIds = await User.find({ _id: { $in: ids }, role: 'student' }).distinct('_id');
        if (studentIds.length > 0) {
            const update = { status };
            if (status === 'completed') update.completionDate = new Date();
            await Enrollment.updateMany(
                {
                    student: { $in: studentIds },
                    $or: [{ course: null }, { course: { $exists: false } }],
                },
                update,
            );
        }

        res.json({
            success: true,
            message: `${ids.length} user(s) set to ${status}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update users' });
    }
});

module.exports = router;