const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { logAudit } = require('../utils/audit');
// NOTE: studentId is now manual-entry only (no auto-generation).

router.use(authMiddleware);
router.use(allowRoles('super-admin', 'admin'));

/** Treat missing isActive as true (legacy documents). */
const isUserActive = (u) => u.isActive !== false;
const USER_STATUS_OPTIONS = ['active', 'pending', 'inactive', 'completed'];
const normalizeUserStatus = (status, fallbackIsActive = true) => {
    if (USER_STATUS_OPTIONS.includes(status)) return status;
    return fallbackIsActive ? 'active' : 'inactive';
};
const isLoginAllowedFromStatus = (status) => status === 'active';

const ensureStudentPlaceholderEnrollment = async (userId) => {
    const existingEnrollment = await Enrollment.findOne({ student: userId });
    if (existingEnrollment) return existingEnrollment;

    return Enrollment.create({
        student: userId,
        course: null,
        status: 'pending',
        progress: 0,
        grade: null,
        enrollmentDate: new Date(),
        lastAccessed: new Date(),
        paymentStatus: 'pending',
    });
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
const STAFF_ROLES = ['admin', 'super-admin', 'accountant'];
const ALL_MANAGED_ROLES = [...PEOPLE_ROLES, ...STAFF_ROLES];

// Get all users (with pagination)
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 20, role, roles, search, segment } = req.query;
        
        // Build filter
        const filter = {};
        // Prefer explicit segment (People vs Users tabs) — avoids query-string comma issues
        if (segment === 'people') {
            filter.role = { $in: PEOPLE_ROLES };
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

        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(filter);

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
                updatedAt: user.updatedAt
            })),
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching users:', error);
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

// Create new user (super-admin: any role; admin: student / teacher / parent only)
router.post('/', async (req, res) => {
    try {
        const { name, email, password, role, phone, mustChangePassword, personalEmail, studentId, status } = req.body;

        const actorRole = req.user?.role;
        const isSuper = actorRole === 'super-admin';
        const isAdmin = actorRole === 'admin';
        if (!isSuper && !isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden'
            });
        }

        const nextRole = role || 'student';
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
        }

        const user = new User(userFields);
        await user.save();

        // Auto-create a placeholder enrollment so students appear on the Enrollment tab immediately.
        // The placeholder has course = null; it gets filled when admin assigns a course.
        if (nextRole === 'student') {
            await ensureStudentPlaceholderEnrollment(user._id);
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
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, error: 'Failed to create user' });
    }
});

// Update user
router.put('/:id', async (req, res) => {
    try {
        const { name, email, role, phone, isActive, personalEmail, studentId, status } = req.body;
        const actorRole = req.user?.role;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (actorRole === 'admin' && (user.role === 'super-admin' || user.isSystemAccount)) {
            return res.status(403).json({ success: false, error: 'You cannot modify super-admin accounts' });
        }
        if (actorRole === 'admin' && role === 'super-admin') {
            return res.status(403).json({ success: false, error: 'Cannot assign super-admin role' });
        }
        if (actorRole === 'admin' && role && PEOPLE_ROLES.includes(user.role) && !PEOPLE_ROLES.includes(role)) {
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
        if (role) user.role = role;
        if (phone !== undefined) user.phone = phone;
        if (status !== undefined) {
            const normalizedStatus = normalizeUserStatus(status, isUserActive(user));
            user.status = normalizedStatus;
            user.isActive = isLoginAllowedFromStatus(normalizedStatus);
        } else if (isActive !== undefined) {
            user.isActive = isActive;
            user.status = isActive ? 'active' : 'inactive';
        }

        if (personalEmail !== undefined && user.role === 'student') {
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
            await ensureStudentPlaceholderEnrollment(user._id);
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
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, error: 'Failed to update user' });
    }
});

// Update user password
router.patch('/:id/password', async (req, res) => {
    try {
        const { password } = req.body;
        const actorRole = req.user?.role;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (actorRole === 'admin' && (user.role === 'super-admin' || user.isSystemAccount)) {
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
        if (actorRole === 'admin' && (user.role === 'super-admin' || user.isSystemAccount)) {
            return res.status(403).json({ success: false, error: 'You cannot change super-admin account status' });
        }

        const normalizedStatus = normalizeUserStatus(status, isUserActive(user));
        user.status = normalizedStatus;
        user.isActive = isLoginAllowedFromStatus(normalizedStatus);
        user.updatedAt = Date.now();
        await user.save();
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

// Delete user
router.delete('/:id', async (req, res) => {
    try {
        const existing = await User.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        if (existing.isSystemAccount) {
            return res.status(403).json({ success: false, error: 'System account cannot be deleted' });
        }
        if (existing.role === 'super-admin' && req.user?.role !== 'super-admin') {
            return res.status(403).json({ success: false, error: 'Only super-admin can delete super-admin accounts' });
        }
        const user = await User.findByIdAndDelete(req.params.id);
        await logAudit({
            actor: req.user.userId || req.user.id,
            action: 'user.delete',
            targetType: 'User',
            targetId: req.params.id,
            details: {}
        });
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await cleanupStudentDataForUserIds([req.params.id]);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete user' });
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
        if (req.user?.role === 'admin') {
            const superCount = await User.countDocuments({
                _id: { $in: ids },
                role: 'super-admin',
            });
            if (superCount > 0) {
                return res.status(403).json({ success: false, error: 'Admins cannot delete super-admin accounts' });
            }
        }

        const usersToDelete = await User.find({ _id: { $in: ids } }).select('_id');
        const userIdsToDelete = usersToDelete.map((u) => String(u._id));

        const result = await User.deleteMany({ _id: { $in: ids } });
        await cleanupStudentDataForUserIds(userIdsToDelete);

        res.json({
            success: true,
            message: `${result.deletedCount} user(s) deleted successfully`
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
        if (req.user?.role === 'admin') {
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

        res.json({
            success: true,
            message: `${ids.length} user(s) set to ${status}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update users' });
    }
});

module.exports = router;