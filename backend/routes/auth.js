const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const { validate, rules } = require('../middleware/validate');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { isDashboardLoginRole } = require('../constants/dashboardRoles');
const { passwordResetRateLimiter } = require('../middleware/publicWriteRateLimit');
const { authRateLimiter } = require('../middleware/security');
const {
    GENERIC_MESSAGE,
    hashToken,
    createRawToken,
    escapeRegex,
    canReceiveReset,
    canApplyPasswordReset,
    resetExpiresAt,
} = require('../services/passwordReset');
const { sendPasswordResetEmail } = require('../services/passwordResetEmail');
const { setAuthCookie, clearAuthCookie } = require('../utils/authCookies');
const { currentAuthEpoch } = require('../utils/tokenEpoch');
const {
    isLoginLocked,
    registerFailedLogin,
} = require('../utils/loginLockout');

/**
 * @param {object} user
 * @param {boolean} rememberMe
 * @param {{ adminSession?: boolean }} [options]
 *
 * Cookie lifetime is the real logout signal:
 * - rememberMe=false → browser session cookie (no maxAge); JWT uses a long
 *   browser-session TTL so a tab open past 12h does not fail while the cookie remains.
 * - rememberMe=true + admin → short durable cookie/JWT (default 12h)
 * - rememberMe=true + portal → long durable cookie/JWT (default 30d)
 */
const createToken = (user, rememberMe = false, options = {}) => {
    const sessionTtl = process.env.JWT_EXPIRES_SESSION || '12h';
    const browserSessionTtl = process.env.JWT_EXPIRES_BROWSER_SESSION || '7d';
    const rememberTtl = options.adminSession
        ? (process.env.JWT_EXPIRES_ADMIN_REMEMBER || sessionTtl)
        : (process.env.JWT_EXPIRES_REMEMBER || '30d');
    const expiresIn = rememberMe ? rememberTtl : browserSessionTtl;
    return jwt.sign(
        {
            userId: String(user._id),
            role: user.role,
            email: user.email,
            sessionVersion: Number(user.sessionVersion || 0),
            authEpoch: currentAuthEpoch(),
        },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

const normalizeEmail = (email) => String(email || '').toLowerCase().trim();

const touchLastLogin = async (userId) => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            lastLogin: new Date(),
            updatedAt: new Date(),
            failedLoginAttempts: 0,
            loginLockedUntil: null,
        },
    });
};

const INVALID = { error: 'Invalid credentials' };

// Login route
// Password min 6 here only so legacy short hashes can still authenticate;
// creating/changing passwords requires min 8 elsewhere.
router.post(
    '/login',
    authRateLimiter,
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
            return res.status(400).json(INVALID);
        }

        if (isLoginLocked(user)) {
            return res.status(400).json(INVALID);
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            await registerFailedLogin(user);
            return res.status(400).json(INVALID);
        }

        if (user.isActive === false || user.canLogin === false || user.deletedAt) {
            return res.status(400).json(INVALID);
        }

        if (isDashboardLoginRole(user.role)) {
            return res.status(403).json({
                error: 'Admin accounts must use the admin login page at /admin/login.',
            });
        }

        await touchLastLogin(user._id);

        const token = createToken(user, !!rememberMe);
        setAuthCookie(res, 'portal', token, !!rememberMe);

        res.json({
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
    authRateLimiter,
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
            return res.status(400).json(INVALID);
        }

        if (isLoginLocked(user)) {
            return res.status(400).json(INVALID);
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            await registerFailedLogin(user);
            return res.status(400).json(INVALID);
        }

        if (user.isActive === false || user.canLogin === false || user.deletedAt) {
            return res.status(400).json(INVALID);
        }

        if (!isDashboardLoginRole(user.role)) {
            return res.status(403).json({ error: 'Only manager or super-admin can access admin dashboard' });
        }

        await touchLastLogin(user._id);

        const token = createToken(user, !!rememberMe, { adminSession: true });
        setAuthCookie(res, 'admin', token, !!rememberMe);
        res.json({
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

            if (String(newPassword).length > 200) {
                return res.status(400).json({ error: 'New password is too long' });
            }

            if (String(currentPassword) === String(newPassword)) {
                return res.status(400).json({ error: 'New password must differ from current password' });
            }

            user.password = String(newPassword);
            user.mustChangePassword = false;
            user.updatedAt = Date.now();
            await user.save();

            const rememberMe = !!req.body?.rememberMe;
            const isAdmin = isDashboardLoginRole(user.role);
            const tokenOpts = isAdmin ? { adminSession: true } : {};
            const token = createToken(user, rememberMe, tokenOpts);
            setAuthCookie(res, isAdmin ? 'admin' : 'portal', token, rememberMe);

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

// Lightweight session probe for client boot / login auto-redirect
router.get('/me', authMiddleware, validateSessionUser, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select(
            'name email role avatar mustChangePassword'
        );
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.json({
            success: true,
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
        req.log.error('GET /me error', { err: error });
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/file-link', authMiddleware, validateSessionUser, async (req, res) => {
    try {
        const { issueFileLink } = require('../middleware/protectedUploads');
        const link = await issueFileLink(req, req.body?.path);
        return res.json({ success: true, ...link });
    } catch (error) {
        const code = error.status || 500;
        return res.status(code).json({ success: false, error: error.message || 'Failed to open file' });
    }
});

router.post('/change-initial-password', authMiddleware, validateSessionUser, async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || String(newPassword).length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }
        if (String(newPassword).length > 200) {
            return res.status(400).json({ error: 'New password is too long' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Only for forced first-login / admin-set temporary passwords.
        // Ongoing changes must use /change-password (requires current password).
        if (!user.mustChangePassword) {
            return res.status(403).json({
                error: 'Use account settings to change your password.',
            });
        }

        const sameAsCurrent = await user.comparePassword(String(newPassword));
        if (sameAsCurrent) {
            return res.status(400).json({ error: 'New password must differ from the current password' });
        }

        user.password = String(newPassword);
        user.mustChangePassword = false;
        user.updatedAt = Date.now();
        await user.save();
        await touchLastLogin(user._id);

        const rememberMe = !!req.body?.rememberMe;
        const isAdmin = isDashboardLoginRole(user.role);
        const tokenOpts = isAdmin ? { adminSession: true } : {};
        const token = createToken(user, rememberMe, tokenOpts);
        setAuthCookie(res, isAdmin ? 'admin' : 'portal', token, rememberMe);

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
        req.log.error('POST /change-initial-password error', { err: error });
        return res.status(500).json({ error: 'Failed to change password' });
    }
});

router.post('/logout', (req, res) => {
    const realm = String(req.body?.realm || '').toLowerCase();
    if (realm === 'admin' || realm === 'portal') {
        clearAuthCookie(res, realm);
    } else {
        clearAuthCookie(res, 'admin');
        clearAuthCookie(res, 'portal');
    }
    return res.json({ success: true });
});

router.post(
    '/forgot-password',
    authRateLimiter,
    passwordResetRateLimiter,
    validate([
        rules.requiredString('email', 'Email'),
        rules.email('email', 'Email'),
    ]),
    async (req, res) => {
        try {
            const emailNorm = normalizeEmail(req.body.email);
            const resetSelect = '+passwordResetTokenHash +passwordResetExpires';
            let user = await User.findOne({ email: emailNorm, deletedAt: null }).select(resetSelect);
            if (!user) {
                const matches = await User.find({
                    personalEmail: { $regex: new RegExp(`^${escapeRegex(emailNorm)}$`, 'i') },
                    deletedAt: null,
                }).select(resetSelect).limit(2);
                user = matches.length === 1 ? matches[0] : null;
            }
            if (user && canReceiveReset(user)) {
                const previousHash = user.passwordResetTokenHash || '';
                const previousExpires = user.passwordResetExpires || null;
                const token = createRawToken();
                user.passwordResetTokenHash = hashToken(token);
                user.passwordResetExpires = resetExpiresAt();
                await user.save();
                const mailed = await sendPasswordResetEmail(user, token);
                if (!mailed.sent) {
                    user.passwordResetTokenHash = previousHash;
                    user.passwordResetExpires = previousExpires;
                    await user.save();
                }
            }
            return res.json({ success: true, message: GENERIC_MESSAGE });
        } catch (error) {
            req.log.error('POST /forgot-password error', { err: error });
            return res.status(500).json({ success: false, error: 'Please try again later.' });
        }
    }
);

router.post(
    '/reset-password',
    authRateLimiter,
    passwordResetRateLimiter,
    async (req, res) => {
        try {
            const token = String(req.body?.token || '').trim();
            const newPassword = String(req.body?.newPassword || '');
            if (!token || token.length > 200) {
                return res.status(400).json({ error: 'This reset link is not valid or has expired.' });
            }
            if (newPassword.length < 8 || newPassword.length > 200) {
                return res.status(400).json({ error: 'New password must be at least 8 characters' });
            }

            const user = await User.findOne({
                passwordResetTokenHash: hashToken(token),
                passwordResetExpires: { $gt: new Date() },
                deletedAt: null,
            }).select('+passwordResetTokenHash +passwordResetExpires');

            if (!user || !canApplyPasswordReset(user)) {
                if (user) {
                    user.passwordResetTokenHash = '';
                    user.passwordResetExpires = null;
                    await user.save();
                }
                return res.status(400).json({ error: 'This reset link is not valid or has expired.' });
            }

            const same = await user.comparePassword(newPassword);
            if (same) {
                return res.status(400).json({ error: 'New password must differ from the current password' });
            }

            user.password = newPassword;
            user.mustChangePassword = false;
            user.updatedAt = Date.now();
            await user.save();

            const loginReady = user.canLogin !== false && user.isActive !== false;
            return res.json({
                success: true,
                message: loginReady
                    ? 'Password updated. Sign in with your portal username.'
                    : 'Password updated. You can sign in once the academy sets this account to Active.',
            });
        } catch (error) {
            req.log.error('POST /reset-password error', { err: error });
            return res.status(500).json({ error: 'Failed to reset password' });
        }
    }
);

module.exports = router;