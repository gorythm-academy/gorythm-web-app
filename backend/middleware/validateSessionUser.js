const User = require('../models/User');

/** Re-validate JWT against live user record (trash, login lock, role). */
async function validateSessionUser(req, res, next) {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Unauthorized',
        });
    }

    try {
        const user = await User.findById(userId).select('role deletedAt canLogin isActive');
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found',
                message: 'User not found',
            });
        }

        if (user.deletedAt) {
            return res.status(403).json({
                success: false,
                error: 'Account has been removed',
                message: 'Account has been removed',
            });
        }

        if (user.canLogin === false) {
            return res.status(403).json({
                success: false,
                error: 'Login access is disabled for this account',
                message: 'Login access is disabled for this account',
            });
        }

        if (user.isActive === false) {
            return res.status(403).json({
                success: false,
                error: 'Account is deactivated',
                message: 'Account is deactivated',
            });
        }

        if (req.user.role && user.role !== req.user.role) {
            return res.status(403).json({
                success: false,
                error: 'Session is out of date. Please sign in again.',
                message: 'Session is out of date. Please sign in again.',
            });
        }

        req.sessionUser = user;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Failed to validate session',
            message: 'Failed to validate session',
        });
    }
}

module.exports = { validateSessionUser };
