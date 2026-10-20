const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function normalizeOrigin(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        return new URL(raw).origin;
    } catch {
        return raw.replace(/\/$/, '');
    }
}

/** Browser origins allowed to call this API. Matches the CORS list in server.js. */
function allowedOriginList() {
    const values = [
        'http://localhost:3000',
        'https://gorythmacademy.com',
        'https://www.gorythmacademy.com',
        process.env.FRONTEND_URL,
    ];
    return [...new Set(values.map(normalizeOrigin).filter(Boolean))];
}

function isAllowedBrowserOrigin(origin) {
    const normalized = normalizeOrigin(origin);
    if (!normalized || normalized === 'null') return false;
    return allowedOriginList().includes(normalized);
}

function requestPath(req) {
    return String(req.originalUrl || req.path || '').split('?')[0];
}

/**
 * True when a state-changing request carries an Origin that is not this site.
 * Missing Origin is allowed: Stripe, curl, and other server calls do not send one.
 * Browsers always send Origin on POST/PUT/PATCH/DELETE.
 */
function writeOriginIsForeign(req) {
    const method = String(req.method || 'GET').toUpperCase();
    if (SAFE_METHODS.has(method)) return false;
    if (requestPath(req) === '/api/payments/webhook') return false;
    const origin = req.header ? req.header('origin') : (req.headers && (req.headers.origin || req.headers.Origin));
    if (!origin) return false;
    return !isAllowedBrowserOrigin(origin);
}

function rejectForeignWriteOrigin(req, res, next) {
    if (!writeOriginIsForeign(req)) return next();
    return res.status(403).json({
        success: false,
        error: 'Request was blocked. Reload the page and try again.',
        message: 'Request was blocked. Reload the page and try again.',
    });
}

module.exports = {
    allowedOriginList,
    isAllowedBrowserOrigin,
    writeOriginIsForeign,
    rejectForeignWriteOrigin,
};
