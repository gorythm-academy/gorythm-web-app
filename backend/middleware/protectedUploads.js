/**
 * Gate sensitive files under /api/uploads before express.static.
 * Public marketing assets (course/research/promo images) stay open.
 * LMS uploads and payment proofs require JWT + live user + course access.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { canAccessLmsUpload } = require('../services/lmsUploadAccess');
const { readAuthTokenFromRequest } = require('../utils/authCookies');
const { assertTokenEpoch } = require('../utils/tokenEpoch');

const PUBLIC_PREFIXES = ['courses-images/', 'video-thumbnails/', 'research-images/', 'subscribe-popup-images/'];

const PROTECTED_PREFIXES = [
    'payment-proofs/',
    'payments/',
    'assignments/',
    'quizzes/',
    'content/',
];

function isPublicPath(rel) {
    return PUBLIC_PREFIXES.some((p) => rel.startsWith(p));
}

function isProtectedPath(rel) {
    return PROTECTED_PREFIXES.some((p) => rel.startsWith(p));
}

function uploadPublicPath(rel) {
    return `/api/uploads/${String(rel || '').replace(/^\//, '')}`;
}

async function liveUserForUpload(req, rel) {
    const fileToken = typeof req.query.ft === 'string' ? req.query.ft.trim() : '';
    if (fileToken) {
        const decoded = verifyJwt(fileToken);
        if (!decoded || decoded.purpose !== 'file' || decoded.path !== uploadPublicPath(rel)) return null;
        return resolveLiveUser(decoded);
    }
    // Cookie-primary sessions: Bearer may be absent after reload; use shared reader.
    return resolveLiveUser(verifyJwt(readAuthTokenFromRequest(req)));
}

function verifyJwt(token) {
    if (!token || !process.env.JWT_SECRET) return null;
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Short-lived ?ft= file links omit authEpoch; session JWTs must match AUTH_EPOCH.
        if (decoded?.purpose !== 'file' && !assertTokenEpoch(decoded)) return null;
        return decoded;
    } catch {
        return null;
    }
}

async function resolveLiveUser(decoded) {
    if (!decoded) return null;
    const userId = decoded.userId || decoded.id;
    if (!userId) return null;

    const user = await User.findById(userId).select('role deletedAt canLogin isActive email sessionVersion');
    if (!user) return null;
    if (user.deletedAt) return null;
    if (user.canLogin === false || user.isActive === false) return null;
    if (decoded.role && user.role !== decoded.role) return null;
    // File-link JWTs are short-lived and omit sessionVersion; live session JWTs must match.
    if (
        decoded.purpose !== 'file' &&
        Number(decoded.sessionVersion ?? 0) !== Number(user.sessionVersion || 0)
    ) {
        return null;
    }

    return {
        userId: String(user._id),
        role: user.role,
        email: user.email,
    };
}

async function canAccessPaymentProof(req, relPath) {
    const publicPath = `/api/uploads/${relPath}`;
    const proofToken = String(req.query.proofToken || req.query.t || '').trim();
    if (proofToken) {
        const byProof = await Payment.findOne({
            ...activePaymentFilter(),
            proofUrl: publicPath,
            uploadToken: proofToken,
        }).select('_id');
        if (byProof) return true;

        const byToken = await Payment.findOne({
            ...activePaymentFilter(),
            uploadToken: proofToken,
        }).select('proofUrl');
        if (byToken && (!byToken.proofUrl || byToken.proofUrl === publicPath)) return true;
    }

    const live = await liveUserForUpload(req, relPath);
    if (!live) return false;

    if (['manager', 'super-admin', 'accountant'].includes(live.role)) return true;

    const payment = await Payment.findOne({ ...activePaymentFilter(), proofUrl: publicPath }).select(
        'email user'
    );
    if (!payment) return false;

    if (payment.user && String(payment.user) === String(live.userId)) return true;

    if (live.email && payment.email) {
        return String(live.email).toLowerCase() === String(payment.email).toLowerCase();
    }

    return false;
}

function decodeUploadPath(value) {
    const raw = String(value || '');
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

async function protectedUploadsGate(req, res, next) {
    // Express leaves %20 in req.path. File-link tokens store the real filename.
    const rel = decodeUploadPath(String(req.path || '').replace(/^\//, ''));
    if (!rel) return res.status(404).end();

    if (isPublicPath(rel)) return next();

    if (!isProtectedPath(rel)) {
        return res.status(404).end();
    }

    if (rel.startsWith('payment-proofs/') || rel.startsWith('payments/')) {
        if (await canAccessPaymentProof(req, rel)) return next();
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const live = await liveUserForUpload(req, rel);
    if (!live) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const publicPath = `/api/uploads/${rel}`;
    if (await canAccessLmsUpload(live.userId, live.role, publicPath)) {
        return next();
    }

    return res.status(403).json({ success: false, error: 'Forbidden' });
}

async function issueFileLink(req, rawPath) {
    const raw = String(rawPath || '').split('?')[0];
    const idx = raw.indexOf('/api/uploads/');
    const publicPath = idx >= 0 ? raw.slice(idx) : '';
    if (!publicPath.startsWith('/api/uploads/') || publicPath.includes('..')) {
        const err = new Error('File path is invalid');
        err.status = 400;
        throw err;
    }
    const rel = publicPath.slice('/api/uploads/'.length);
    if (!isProtectedPath(rel)) {
        const err = new Error('File path is invalid');
        err.status = 400;
        throw err;
    }
    const live = await resolveLiveUser(verifyJwt(readAuthTokenFromRequest(req)));
    if (!live) {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
    }
    if (rel.startsWith('payment-proofs/') || rel.startsWith('payments/')) {
        const allowed = await canAccessPaymentProof(req, rel);
        if (!allowed) {
            const err = new Error('Unauthorized');
            err.status = 401;
            throw err;
        }
    } else if (!(await canAccessLmsUpload(live.userId, live.role, publicPath))) {
        const err = new Error('Forbidden');
        err.status = 403;
        throw err;
    }
    const token = jwt.sign(
        { purpose: 'file', userId: live.userId, role: live.role, path: publicPath },
        process.env.JWT_SECRET,
        { expiresIn: '3m' }
    );
    return { url: `${publicPath}?ft=${encodeURIComponent(token)}`, expiresIn: 180 };
}

module.exports = { protectedUploadsGate, issueFileLink, PUBLIC_PREFIXES, PROTECTED_PREFIXES };
