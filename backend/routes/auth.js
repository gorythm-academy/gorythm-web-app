const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

const createToken = (user, rememberMe = false) => {
    const expiresIn = rememberMe
        ? (process.env.JWT_EXPIRES_REMEMBER || '90d')
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
router.post('/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const emailNorm = normalizeEmail(email);
        
        // Find user
        const user = await User.findOne({ email: emailNorm });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
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
        console.error('POST /login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin-only login route for admin dashboard
router.post('/admin-login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        const emailNorm = normalizeEmail(email);
        const user = await User.findOne({ email: emailNorm });

        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        if (user.isActive === false || user.canLogin === false) {
            return res.status(403).json({ error: 'Account cannot access admin login' });
        }

        if (!['super-admin', 'admin'].includes(user.role)) {
            return res.status(403).json({ error: 'Only admin or super-admin can access admin dashboard' });
        }

        user.lastLogin = new Date();
        await user.save();

        const token = createToken(user);
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
        console.error('POST /admin-login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/change-initial-password', authMiddleware, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || String(newPassword).length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
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