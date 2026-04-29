const logger = require('../utils/logger');

function notFound(req, res, next) {
    if (res.headersSent) return next();
    return res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.originalUrl}`,
    });
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    const status = err.statusCode || err.status || 500;
    const message = status >= 500 ? 'Internal server error' : (err.message || 'Request failed');
    (req?.log || logger).error('Unhandled error', { err, status });
    return res.status(status).json({ success: false, error: message });
}

module.exports = { notFound, errorHandler };

