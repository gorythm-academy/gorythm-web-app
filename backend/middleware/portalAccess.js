/**
 * Portal route access: role owners only (no admin preview bypass).
 */
const allowPortalRoles = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (roles.includes(req.user.role)) {
        return next();
    }

    return res.status(403).json({
        success: false,
        error: `Forbidden: requires one of roles: ${roles.join(', ')}`,
    });
};

function getPortalActorId(req) {
    return req.user?.userId || req.user?.id || null;
}

module.exports = { allowPortalRoles, getPortalActorId };
