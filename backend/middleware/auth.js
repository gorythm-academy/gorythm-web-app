const jwt = require('jsonwebtoken');
const { readAuthTokenFromRequest } = require('../utils/authCookies');
const { assertTokenEpoch } = require('../utils/tokenEpoch');

const DASHBOARD_ROLES = new Set(['manager', 'super-admin']);

const authMiddleware = (req, res, next) => {
    const token = readAuthTokenFromRequest(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'No token, authorization denied',
            message: 'No token, authorization denied',
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!assertTokenEpoch(decoded)) {
            return res.status(401).json({
                success: false,
                error: 'Session is out of date. Please sign in again.',
                message: 'Session is out of date. Please sign in again.',
            });
        }

        // Reject cross-realm use of a valid JWT (e.g. admin token with portal realm).
        const realmHint = String(req.header('X-Auth-Realm') || '').toLowerCase();
        const role = decoded?.role;
        if (realmHint === 'admin' && role && !DASHBOARD_ROLES.has(role)) {
            return res.status(401).json({
                success: false,
                error: 'No token, authorization denied',
                message: 'No token, authorization denied',
            });
        }
        if (realmHint === 'portal' && role && DASHBOARD_ROLES.has(role)) {
            return res.status(401).json({
                success: false,
                error: 'No token, authorization denied',
                message: 'No token, authorization denied',
            });
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Token is not valid',
            message: 'Token is not valid',
        });
    }
};

module.exports = authMiddleware;
