const { hasPermission } = require('../config/rolePermissions');

const allowRoles = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: insufficient role',
        });
    }
    return next();
};

const allowPermission = (permission) => (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: insufficient permission',
            permission,
        });
    }
    return next();
};

module.exports = { allowRoles, allowPermission };
