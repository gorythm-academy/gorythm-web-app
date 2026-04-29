const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Adds X-Request-Id (or uses incoming x-request-id) and req.log for request-scoped fields.
 */
function requestContext(req, res, next) {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const base = () => ({
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
    });

    req.log = {
        info: (msg, meta) => logger.info(msg, { ...base(), ...meta }),
        warn: (msg, meta) => logger.warn(msg, { ...base(), ...meta }),
        error: (msg, meta) => logger.error(msg, { ...base(), ...meta }),
        debug: (msg, meta) => logger.debug(msg, { ...base(), ...meta }),
    };

    next();
}

module.exports = requestContext;
