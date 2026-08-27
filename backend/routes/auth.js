const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const { validate, rules } = require('../middleware/validate');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { isDashboardLoginRole } = require('../constants/dashboardRoles');

const createToken = (user, rememberMe = false) => {
    const expiresIn = rememberMe
        ? (process.env.JWT_EXPIRES_REMEMBER || '30d')
        : (process.env.JWT_EXPIRES_SESSION || '12h');
    return jwt.sign(
        { userId: String(user._id), role: user.role, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const touchLastLogin = async (userId) => {
    await User.findByIdAndUpdate(userId, {
        $set: { lastLogin: new Date(), updatedAt: new Date() },
    });
};

// Login route
router.post(
    '/login',
    validate([
        rules.requiredString('email', 'Email'),
        rules.email('email', 'Email'),
        rules.requiredString('password', 'Password', 6),
    ]),
    async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const emailNorm = normalizeEmail(email);
        
        // Find user
        const user = await User.findOne({ email: emailNorm });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check if user is active (missing field treated as active for legacy documents)
        if (user.isActive === false) {
            return res.status(400).json({ error: 'Account is deactivated' });
        }

        if (user.canLogin === false) {
            return res.status(403).json({ error: 'Login access is disabled for this account' });
        }

        if (user.deletedAt) {
            return res.status(403).json({ error: 'Account has been removed' });
        }

        await touchLastLogin(user._id);
        
        const token = createToken(user, !!rememberMe);
        
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                mustChangePassword: !!user.mustChangePassword
            }
        });
        
    } catch (error) {
        req.log.error('POST /login error', { err: error });
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin-only login route for admin dashboard
router.post(
    '/admin-login',
    validate([
        rules.requiredString('email', 'Email'),
        rules.email('email', 'Email'),
        rules.requiredString('password', 'Password', 6),
    ]),
    async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const emailNorm = normalizeEmail(email);
        const user = await User.findOne({ email: emailNorm });

        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        if (user.isActive === false || user.canLogin === false) {
            return res.status(403).json({ error: 'Account cannot access admin login' });
        }

        if (user.deletedAt) {
            return res.status(403).json({ error: 'Account has been removed' });
        }

        if (!isDashboardLoginRole(user.role)) {
            return res.status(403).json({ error: 'Only manager or super-admin can access admin dashboard' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = createToken(user, !!rememberMe);
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                mustChangePassword: !!user.mustChangePassword,
            },
        });
    } catch (error) {
        req.log.error('POST /admin-login error', { err: error });
        res.status(500).json({ error: 'Server error' });
    }
});

router.post(
    '/change-password',
    authMiddleware,
    validateSessionUser,
    validate([
        rules.requiredString('currentPassword', 'Current password'),
        rules.requiredString('newPassword', 'New password', 8),
    ]),
    async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body;
            const user = await User.findById(req.user.userId);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const isMatch = await user.comparePassword(String(currentPassword));
            if (!isMatch) {
                return res.status(400).json({ error: 'Current password is incorrect' });
            }

            if (String(currentPassword) === String(newPassword)) {
                return res.status(400).json({ error: 'New password must differ from current password' });
            }

            user.password = String(newPassword);
            user.mustChangePassword = false;
            user.updatedAt = Date.now();
            await user.save();

            return res.json({
                success: true,
                message: 'Password changed successfully',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar,
                    mustChangePassword: false,
                },
            });
        } catch (error) {
            req.log.error('POST /change-password error', { err: error });
            return res.status(500).json({ error: 'Failed to change password' });
        }
    }
);

router.post('/change-initial-password', authMiddleware, validateSessionUser, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || String(newPassword).length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.password = String(newPassword);
        user.mustChangePassword = false;
        user.updatedAt = Date.now();
        await user.save();
        await touchLastLogin(user._id);

        return res.json({
            success: true,
            message: 'Password changed successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                mustChangePassword: false
            }
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to change password' });
    }
});

module.exports = router;