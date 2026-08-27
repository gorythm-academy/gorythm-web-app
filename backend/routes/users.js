const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const ParentStudentLink = require('../models/ParentStudentLink');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const { logAudit } = require('../utils/audit');
const { validate, rules } = require('../middleware/validate');
const { activeUserFilter, trashedUserFilter } = require('../utils/userQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const {
    applyInstructorsToCourse,
    teacherIdsOnCourse,
} = require('../utils/courseInstructors');
const { softTrashUser, restoreTrashedUser } = require('../services/softTrashUser');
const { cleanupTeacherOnTrash } = require('../services/cleanupTeacherOnTrash');
const { userHasFinancialRecords } = require('../services/financialGuards');
const { parseObjectIdList } = require('../utils/validateObjectIds');
const {
    getCanonicalSuperAdminEmail,
    isProtectedSuperAdmin,
    isSuperAdminRole,
} = require('../utils/protectedSuperAdmin');
const { getUserDeleteBlockReason } = require('../utils/userDeleteAccess');
// NOTE: studentId auto-generated as GRT-YYYY-### when omitted; still editable later.

router.use(authMiddleware);
router.use(validateSessionUser);
router.use(allowRoles('super-admin', 'manager'));

/** Treat missing isActive as true (legacy documents). */
const isUserActive = (u) => u.isActive !== false;
const {
    normalizeEnrollmentStatus,
    normalizeUserStatus,
    USER_STATUS_OPTIONS,
    isUserLoginAllowedFromStatus,
} = require('../utils/enrollmentStatus');

const { generateNextStudentId } = require('../utils/studentIdGenerator');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');

const ensureStudentPlaceholderEnrollment = async (userId, statusOverride) => {
    const normalizedStatus = normalizeUserStatus(statusOverride, false);

    const existingEnrollment = await Enrollment.findOne({
        student: userId,
        ...activeEnrollmentFilter(),
    });
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

    const normalizedIds = userIds
        .map((id) => {
            const str = String(id);
            return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
        })
        .filter(Boolean);

    if (!normalizedIds.length) return;

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

const USER_LIST_SORT_FIELDS = {
    user: 'name',
    name: 'name',
    role: 'role',
    status: 'status',
    phone: 'phone',
    email: 'email',
    personalEmail: 'personalEmail',
    joined: 'createdAt',
    lastLogin: 'lastLogin',
    studentId: 'studentId',
};

function buildUserListSort(sortBy, sortOrder) {
    const field = USER_LIST_SORT_FIELDS[String(sortBy || '').trim()] || 'createdAt';
    const dir = String(sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    return { [field]: dir };
}

function segmentTrashCountFilter(segment, filterRole) {
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
    } else if (filterRole && filterRole !== 'all') {
        trashCountFilter.role = filterRole;
    }
    return trashCountFilter;
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mapUserListRow(user) {
    return {
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
    };
}

async function bulkUpsertParentChildLinks(parentId, studentIds, relation = 'guardian') {
    const parsed = parseObjectIdList(studentIds);
    if (!parsed.ok) {
        const err = new Error(parsed.error || 'Invalid student ids');
        err.status = 400;
        throw err;
    }
    if (!parsed.ids.length) return [];

    const students = await User.find({
        _id: { $in: parsed.ids },
        role: 'student',
        ...activeUserFilter(),
    }).select('_id');
    if (students.length !== parsed.ids.length) {
        const err = new Error('One or more students not found or removed');
        err.status = 400;
        throw err;
    }

    await Promise.all(
        parsed.ids.map((studentId) =>
            ParentStudentLink.findOneAndUpdate(
                { parent: parentId, student: studentId },
                { relation },
                { upsert: true, setDefaultsOnInsert: true }
            )
        )
    );

    return ParentStudentLink.find({ parent: parentId, student: { $in: parsed.ids } })
        .populate('student', 'name email studentId')
        .populate('parent', 'name email')
        .sort({ createdAt: -1 })
        .lean();
}

// Get all users (with pagination)
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const skip = (page - 1) * limit;
        const { role, roles, search, segment } = req.query;
        const sortBy = String(req.query.sortBy || 'joined').trim();
        const sortOrder = String(req.query.sortOrder || 'desc').trim().toLowerCase() === 'asc'
            ? 'asc'
            : 'desc';
        const includeCounts = req.query.includeCounts === 'true' || req.query.includeCounts === '1';
        const includeStats = req.query.includeStats === 'true' || req.query.includeStats === '1';
        
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
        const searchTerm = String(search || '').trim();
        if (searchTerm) {
            const regex = { $regex: escapeRegex(searchTerm), $options: 'i' };
            const searchOr = [
                { name: regex },
                { email: regex },
                { personalEmail: regex },
                { phone: regex },
            ];
            if (segment !== 'parents') {
                searchOr.push({ studentId: regex });
            }
            if (segment === 'parents') {
                const matchingStudents = await User.find({
                    role: 'student',
                    $or: [
                        { name: regex },
                        { email: regex },
                        { personalEmail: regex },
                        { studentId: regex },
                        { phone: regex },
                    ],
                }).select('_id').lean();
                if (matchingStudents.length) {
                    const studentIds = matchingStudents.map((s) => s._id);
                    const parentIds = await ParentStudentLink.find({
                        student: { $in: studentIds },
                    }).distinct('parent');
                    if (parentIds.length) {
                        searchOr.push({ _id: { $in: parentIds } });
                    }
                }
            }
            filter.$or = searchOr;
        }

        const trash = req.query.trash === 'true' || req.query.trash === '1';
        Object.assign(filter, trash ? trashedUserFilter() : activeUserFilter());

        const [users, total] = await Promise.all([
            User.find(filter)
                .select('-password')
                .sort(buildUserListSort(sortBy, sortOrder))
                .skip(skip)
                .limit(limit)
                .lean(),
            User.countDocuments(filter),
        ]);

        let trashCount;
        if (includeCounts) {
            trashCount = await User.countDocuments(segmentTrashCountFilter(segment, filter.role));
        }

        let stats;
        if (includeStats && !trash) {
            const statsFilter = { ...activeUserFilter() };
            if (segment === 'teachers') statsFilter.role = 'teacher';
            else if (segment === 'parents') statsFilter.role = 'parent';
            else if (segment === 'staff') statsFilter.role = { $in: STAFF_ROLES };
            else if (segment === 'students') statsFilter.role = 'student';
            else if (filter.role) statsFilter.role = filter.role;

            const roleRows = await User.aggregate([
                { $match: statsFilter },
                { $group: { _id: '$role', count: { $sum: 1 } } },
            ]);
            const byRole = {};
            for (const row of roleRows) {
                if (row._id) byRole[row._id] = row.count;
            }
            stats = {
                total: roleRows.reduce((sum, row) => sum + row.count, 0),
                byRole,
            };
        }

        res.json({
            success: true,
            users: users.map(mapUserListRow),
            total,
            ...(includeCounts ? { trashCount } : {}),
            ...(includeStats && stats ? { stats } : {}),
            page,
            pages: Math.max(1, Math.ceil(total / limit)),
            limit,
            sortBy,
            sortOrder,
        });
    } catch (error) {
        req.log.error('Error fetching users', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

/**
 * One-shot Teachers-tab payload: published assignable courses + map of teacherId → assigned courses.
 * Avoids N+1 GET /assigned-courses per teacher row.
 */
router.get('/teachers/course-assignments', async (req, res) => {
    try {
        const courses = await Course.find({
            isPublished: true,
            $and: [activeCourseFilter()],
        })
            .select('title category instructors instructor')
            .sort({ title: 1 })
            .lean();

        const assignableCourses = courses.map((c) => ({
            _id: c._id,
            title: c.title,
            category: c.category,
        }));

        const assignmentsByTeacherId = {};
        for (const c of courses) {
            const row = { _id: c._id, title: c.title, category: c.category };
            for (const tid of teacherIdsOnCourse(c)) {
                if (!assignmentsByTeacherId[tid]) assignmentsByTeacherId[tid] = [];
                assignmentsByTeacherId[tid].push(row);
            }
        }

        res.json({
            success: true,
            courses: assignableCourses,
            assignmentsByTeacherId,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teacher course assignments' });
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
        rules.requiredString('password', 'Password', 8),
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
        if (isSuperAdminRole(nextRole)) {
            return res.status(403).json({
                success: false,
                error: 'Super-admin accounts cannot be created. Only one system super-admin exists.',
            });
        }
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
            isActive: isUserLoginAllowedFromStatus(normalizedStatus),
            canLogin: isUserLoginAllowedFromStatus(normalizedStatus),
            mustChangePassword: mustChangePassword !== false,
            isSystemAccount: false,
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
            } else {
                userFields.studentId = await generateNextStudentId();
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

        if (nextRole === 'parent' && Array.isArray(req.body.studentIds) && req.body.studentIds.length) {
            const parsed = parseObjectIdList(req.body.studentIds);
            if (!parsed.ok) {
                return res.status(400).json({ success: false, error: parsed.error || 'Invalid student ids' });
            }
        }

        const user = new User(userFields);
        await user.save();

        // Auto-create a placeholder enrollment so students appear on the Enrollment tab immediately.
        // The placeholder has course = null; it gets filled when admin assigns a course.
        // Status mirrors the People status admin chose at creation time.
        if (nextRole === 'student') {
            await ensureStudentPlaceholderEnrollment(user._id, user.status);
        }

        let parentLinks = [];
        if (nextRole === 'parent' && Array.isArray(req.body.studentIds) && req.body.studentIds.length) {
            parentLinks = await bulkUpsertParentChildLinks(user._id, req.body.studentIds);
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
            },
            ...(parentLinks.length ? { parentLinks } : {}),
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
        const { name, email, role, phone, isActive, personalEmail, studentId, status, password, mustChangePassword } = req.body;
        const actorRole = req.user?.role;
        let nextRole = role;
        if (nextRole === 'admin') nextRole = 'manager';

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (isManagerActor(actorRole) && isSuperAdminRole(user.role)) {
            return res.status(403).json({ success: false, error: 'You cannot modify super-admin accounts' });
        }
        if (isProtectedSuperAdmin(user) && nextRole && !isSuperAdminRole(nextRole)) {
            return res.status(403).json({ success: false, error: 'The primary super-admin role cannot be changed' });
        }
        if (nextRole && isSuperAdminRole(nextRole) && !isSuperAdminRole(user.role)) {
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
            const loginAllowed = isUserLoginAllowedFromStatus(normalizedStatus);
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

        if (password !== undefined && String(password).trim() !== '') {
            const trimmedPassword = String(password).trim();
            if (trimmedPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 8 characters',
                });
            }
            if (isManagerActor(actorRole) && isSuperAdminRole(user.role)) {
                return res.status(403).json({
                    success: false,
                    error: 'You cannot change this account password',
                });
            }
            user.password = trimmedPassword;
            if (mustChangePassword !== undefined) {
                user.mustChangePassword = !!mustChangePassword;
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
    validate([rules.requiredString('password', 'Password', 8)]),
    async (req, res) => {
    try {
        const { password, mustChangePassword } = req.body;
        const actorRole = req.user?.role;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (isManagerActor(actorRole) && isSuperAdminRole(user.role)) {
            return res.status(403).json({ success: false, error: 'You cannot change this account password' });
        }

        user.password = password;
        if (mustChangePassword !== undefined) {
            user.mustChangePassword = !!mustChangePassword;
        }
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
        if (isManagerActor(actorRole) && isSuperAdminRole(user.role)) {
            return res.status(403).json({ success: false, error: 'You cannot change super-admin account status' });
        }
        if (isProtectedSuperAdmin(user)) {
            return res.status(403).json({ success: false, error: 'The primary super-admin status cannot be changed' });
        }

        const normalizedStatus = normalizeUserStatus(status, isUserActive(user));
        user.status = normalizedStatus;
        user.isActive = isUserLoginAllowedFromStatus(normalizedStatus);
        user.canLogin = isUserLoginAllowedFromStatus(normalizedStatus);
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
        const deleteBlock = getUserDeleteBlockReason(req.user?.role, existing);
        if (deleteBlock) {
            return res.status(403).json({ success: false, error: deleteBlock });
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
        const deleteBlock = getUserDeleteBlockReason(req.user?.role, existing);
        if (deleteBlock) {
            return res.status(403).json({ success: false, error: deleteBlock });
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

        if (existing.role === 'student') {
            const Enrollment = require('../models/Enrollment');
            await Enrollment.deleteMany({ student: req.params.id });
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

/** Published, non-quarantine courses where this teacher is assigned (shared instructors list). */
router.get('/:id/assigned-courses', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('role name');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if (user.role !== 'teacher') {
            return res.status(400).json({ success: false, error: 'User is not a teacher' });
        }
        const courses = await Course.find({
            isPublished: true,
            $and: [
                activeCourseFilter(),
                { $or: [{ instructor: user._id }, { instructors: user._id }] },
            ],
        })
            .select('title category instructors instructor')
            .sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assigned courses' });
    }
});

router.put('/:id/assigned-courses', async (req, res) => {
    try {
        const { courseIds = [] } = req.body;
        const teacher = await User.findById(req.params.id);
        if (!teacher) return res.status(404).json({ success: false, error: 'User not found' });
        if (teacher.role !== 'teacher') {
            return res.status(400).json({ success: false, error: 'User is not a teacher' });
        }
        if (teacher.deletedAt) {
            return res.status(400).json({
                success: false,
                error: 'Cannot assign courses to a quarantined teacher',
            });
        }

        const desiredIds = [
            ...new Set((Array.isArray(courseIds) ? courseIds : []).map(String).filter(Boolean)),
        ];

        // Desired courses must be published + not quarantined
        const desiredCourses = desiredIds.length
            ? await Course.find({
                  _id: { $in: desiredIds },
                  isPublished: true,
                  $and: [activeCourseFilter()],
              }).select('_id')
            : [];
        const allowedDesired = new Set(desiredCourses.map((c) => String(c._id)));
        const rejected = desiredIds.filter((id) => !allowedDesired.has(id));
        if (rejected.length) {
            return res.status(400).json({
                success: false,
                error: 'Only published (non-quarantine) courses can be assigned to teachers',
            });
        }

        // Include quarantine/draft links so saving detaches the teacher from them
        const currentlyAssigned = await Course.find({
            $or: [{ instructor: teacher._id }, { instructors: teacher._id }],
        });

        const currentIds = new Set(currentlyAssigned.map((c) => String(c._id)));
        const desiredSet = allowedDesired;

        const toAdd = [...desiredSet].filter((id) => !currentIds.has(id));
        const toRemove = currentlyAssigned.filter((c) => !desiredSet.has(String(c._id)));

        for (const cid of toAdd) {
            const course = await Course.findById(cid);
            if (!course || course.deletedAt || !course.isPublished) continue;
            const next = [...teacherIdsOnCourse(course), String(teacher._id)];
            // Prune stale/missing co-teachers instead of failing the whole save
            await applyInstructorsToCourse(course, next, { requireAll: false });
            await course.save();
        }

        for (const course of toRemove) {
            const next = teacherIdsOnCourse(course).filter((id) => id !== String(teacher._id));
            await applyInstructorsToCourse(course, next, { requireAll: false });
            await course.save();
        }

        const assigned = await Course.find({
            isPublished: true,
            $and: [
                activeCourseFilter(),
                { $or: [{ instructor: teacher._id }, { instructors: teacher._id }] },
            ],
        })
            .select('title category')
            .sort({ title: 1 });
        res.json({ success: true, courses: assigned });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({ success: false, error: error.message });
        }
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
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, links });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load child links' });
    }
});

router.post('/:id/child-links/bulk', async (req, res) => {
    try {
        const { studentIds, relation = 'guardian' } = req.body;
        const parent = await User.findById(req.params.id);
        if (!parent || parent.role !== 'parent') {
            return res.status(400).json({ success: false, error: 'Invalid parent' });
        }
        if (!Array.isArray(studentIds) || !studentIds.length) {
            return res.status(400).json({ success: false, error: 'studentIds array is required' });
        }
        const links = await bulkUpsertParentChildLinks(parent._id, studentIds, relation);
        res.json({ success: true, links, linkedCount: links.length });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to link children',
        });
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

        const parsed = parseObjectIdList(ids);
        if (!parsed.ok) {
            return res.status(400).json({ success: false, error: parsed.error });
        }

        const protectedCount = await User.countDocuments({
            _id: { $in: parsed.ids },
            email: getCanonicalSuperAdminEmail(),
        });
        if (protectedCount > 0) {
            return res.status(403).json({ success: false, error: 'Selection contains the primary super-admin account' });
        }

        const usersToTrash = await User.find({ _id: { $in: parsed.ids }, ...activeUserFilter() });
        let trashed = 0;
        for (const user of usersToTrash) {
            if (getUserDeleteBlockReason(req.user?.role, user)) continue;
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

        const parsed = parseObjectIdList(ids);
        if (!parsed.ok) {
            return res.status(400).json({ success: false, error: parsed.error });
        }

        if (!USER_STATUS_OPTIONS.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const protectedCount = await User.countDocuments({
            _id: { $in: parsed.ids },
            email: getCanonicalSuperAdminEmail(),
        });
        if (protectedCount > 0) {
            return res.status(403).json({ success: false, error: 'Selection contains the primary super-admin account' });
        }
        if (isManagerActor(req.user?.role)) {
            const superCount = await User.countDocuments({
                _id: { $in: parsed.ids },
                role: 'super-admin',
            });
            if (superCount > 0) {
                return res.status(403).json({ success: false, error: 'Admins cannot change super-admin account status' });
            }
        }

        await User.updateMany(
            { _id: { $in: parsed.ids } },
            {
                status,
                isActive: isUserLoginAllowedFromStatus(status),
                canLogin: isUserLoginAllowedFromStatus(status),
                updatedAt: Date.now()
            }
        );

        // Mirror onto placeholder enrollments for affected students.
        const studentIds = await User.find({ _id: { $in: parsed.ids }, role: 'student' }).distinct('_id');
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
            message: `${parsed.ids.length} user(s) set to ${status}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update users' });
    }
});

module.exports = router;