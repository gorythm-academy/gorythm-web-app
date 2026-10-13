const ADMIN_COOKIE = 'gorythm_admin_auth';
const PORTAL_COOKIE = 'gorythm_portal_auth';

function isProduction() {
    return process.env.NODE_ENV === 'production';
}

function parseDurationMs(raw, fallbackMs) {
    const value = String(raw || '').trim();
    if (!value) return fallbackMs;
    const match = /^(\d+)([smhd])$/i.exec(value);
    if (!match) return fallbackMs;
    const n = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
}

function cookieNameForRealm(realm) {
    return realm === 'admin' ? ADMIN_COOKIE : PORTAL_COOKIE;
}

function cookieOptions(rememberMe, { adminSession = false } = {}) {
    const opts = {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'lax',
        path: '/',
    };
    if (rememberMe) {
        const raw = adminSession
            ? (process.env.JWT_EXPIRES_ADMIN_REMEMBER || process.env.JWT_EXPIRES_SESSION || '12h')
            : (process.env.JWT_EXPIRES_REMEMBER || '30d');
        const fallback = adminSession ? 12 * 3_600_000 : 30 * 86_400_000;
        opts.maxAge = parseDurationMs(raw, fallback);
    }
    return opts;
}

function setAuthCookie(res, realm, token, rememberMe = false) {
    res.cookie(cookieNameForRealm(realm), token, cookieOptions(!!rememberMe, { adminSession: realm === 'admin' }));
}

function clearAuthCookie(res, realm) {
    res.clearCookie(cookieNameForRealm(realm), {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'lax',
        path: '/',
    });
}

function clearAllAuthCookies(res) {
    clearAuthCookie(res, 'admin');
    clearAuthCookie(res, 'portal');
}

/** Frontend may send a non-JWT sentinel when only the httpOnly cookie authenticates. */
function isRealBearerToken(bearer) {
    if (!bearer) return false;
    const t = String(bearer).trim();
    if (!t) return false;
    if (
        t === '__cookie_session__' ||
        t === 'null' ||
        t === 'undefined' ||
        t === 'Bearer' ||
        t.toLowerCase() === 'bearer'
    ) {
        return false;
    }
    return true;
}

function readBearerFromHeader(req) {
    const header = req.header('Authorization') || '';
    if (header.startsWith('Bearer ') && header.length > 7) {
        const bearer = header.slice(7).trim();
        if (isRealBearerToken(bearer)) return bearer;
    }
    return null;
}

/**
 * Resolve JWT from Bearer or httpOnly cookies.
 *
 * Rules (strict, no cross-realm surprise):
 * 1. Real Bearer wins.
 * 2. If X-Auth-Realm is set → that realm's cookie only (missing → unauthenticated).
 * 3. Path heuristics for headerless GETs (uploads, admin APIs, portal APIs).
 * 4. Never prefer admin over portal on /api/uploads when both cookies exist.
 * 5. /api/auth/* without realm never guesses a cookie (clients always send X-Auth-Realm).
 */
function readAuthTokenFromRequest(req) {
    const bearer = readBearerFromHeader(req);
    if (bearer) return bearer;

    const cookies = req.cookies || {};
    const realmHint = String(req.header('X-Auth-Realm') || '').toLowerCase();

    // Strict realm: never fall through to the other cookie.
    if (realmHint === 'admin') return cookies[ADMIN_COOKIE] || null;
    if (realmHint === 'portal') return cookies[PORTAL_COOKIE] || null;

    const path = String(req.originalUrl || req.path || '');

    // Headerless protected file GETs (img/open). Dual-cookie → portal so a leftover
    // admin session cannot elevate LMS ACLs. Admin UIs send X-Auth-Realm or use ?ft=.
    if (path.startsWith('/api/uploads')) {
        if (cookies[PORTAL_COOKIE] && cookies[ADMIN_COOKIE]) {
            return cookies[PORTAL_COOKIE];
        }
        return cookies[PORTAL_COOKIE] || cookies[ADMIN_COOKIE] || null;
    }

    // Auth routes must not guess identity without an explicit realm.
    if (path.startsWith('/api/auth')) {
        return null;
    }

    if (
        path.startsWith('/api/admin') ||
        path.startsWith('/api/lms-admin') ||
        path.startsWith('/api/analytics') ||
        path.startsWith('/api/users') ||
        path.startsWith('/api/courses') ||
        path.startsWith('/api/enrollments') ||
        path.startsWith('/api/payroll') ||
        path.startsWith('/api/payments/admin') ||
        path.startsWith('/api/upload') ||
        path.startsWith('/api/settings') ||
        path.startsWith('/api/contact/admin') ||
        path.startsWith('/api/subscribers/admin')
    ) {
        if (cookies[ADMIN_COOKIE]) return cookies[ADMIN_COOKIE];
    }
    if (path.startsWith('/api/portal') && cookies[PORTAL_COOKIE]) {
        return cookies[PORTAL_COOKIE];
    }

    // Ambiguous leftover path: prefer neither elevation — admin first only when
    // portal cookie is absent (legacy single-session clients).
    if (cookies[ADMIN_COOKIE] && !cookies[PORTAL_COOKIE]) return cookies[ADMIN_COOKIE];
    if (cookies[PORTAL_COOKIE] && !cookies[ADMIN_COOKIE]) return cookies[PORTAL_COOKIE];
    return null;
}

/**
 * Read Bearer or a single realm cookie only (never cross-realm fallback).
 * Use for public flows like Stripe checkout so an admin cookie cannot bind a guest payment.
 */
function readAuthTokenForRealm(req, realm) {
    const bearer = readBearerFromHeader(req);
    if (bearer) return bearer;
    const cookies = req.cookies || {};
    const name = cookieNameForRealm(realm === 'admin' ? 'admin' : 'portal');
    return cookies[name] || null;
}

/** True when the request carries a real Bearer token (not just the httpOnly cookie). */
function requestHasBearer(req) {
    return Boolean(readBearerFromHeader(req));
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for cookie sessions. A browser attaches cookies to cross-site requests on its own, but a
 * page on another site cannot add a custom header without a CORS preflight that this API refuses.
 * So a state-changing request that is authenticated only by a cookie must carry X-Auth-Realm.
 */
function cookieRequestIsForged(req) {
    if (SAFE_METHODS.has(String(req.method || '').toUpperCase())) return false;
    if (requestHasBearer(req)) return false;
    const realm = String(req.header('X-Auth-Realm') || '').toLowerCase();
    return realm !== 'admin' && realm !== 'portal';
}

module.exports = {
    ADMIN_COOKIE,
    PORTAL_COOKIE,
    requestHasBearer,
    cookieRequestIsForged,
    setAuthCookie,
    clearAuthCookie,
    clearAllAuthCookies,
    readAuthTokenFromRequest,
    readAuthTokenForRealm,
};
