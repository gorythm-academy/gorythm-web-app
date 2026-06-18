/**
 * Gate sensitive files under /api/uploads before express.static.
 * Public marketing assets (course/research/promo images) stay open.
 * LMS uploads and payment proofs require JWT (header or access_token query) or proofToken.
 */
const jwt = require('jsonwebtoken');
const Payment = require('../models/Payment');
const { activePaymentFilter } = require('../utils/paymentQuery');

const PUBLIC_PREFIXES = ['courses-images/', 'video-thumbnails/', 'research-images/'];

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

function extractBearerOrQueryToken(req) {
    const auth = req.header('Authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    const q = req.query.access_token;
    return typeof q === 'string' && q.trim() ? q.trim() : null;
}

function verifyJwt(token) {
    if (!token || !process.env.JWT_SECRET) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
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

    const user = verifyJwt(extractBearerOrQueryToken(req));
    if (!user) return false;

    if (['manager', 'super-admin', 'accountant'].includes(user.role)) return true;

    const payment = await Payment.findOne({ ...activePaymentFilter(), proofUrl: publicPath }).select(
        'email user'
    );
    if (!payment) return false;

    if (payment.user && String(payment.user) === String(user.userId || user.id)) return true;

    if (user.email && payment.email) {
        return String(user.email).toLowerCase() === String(payment.email).toLowerCase();
    }

    return false;
}

async function protectedUploadsGate(req, res, next) {
    const rel = String(req.path || '').replace(/^\//, '');
    if (!rel) return res.status(404).end();

    if (isPublicPath(rel)) return next();

    if (!isProtectedPath(rel)) {
        return res.status(404).end();
    }

    if (rel.startsWith('payment-proofs/') || rel.startsWith('payments/')) {
        if (await canAccessPaymentProof(req, rel)) return next();
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const user = verifyJwt(extractBearerOrQueryToken(req));
    if (!user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const allowedRoles = new Set(['manager', 'super-admin', 'teacher', 'student', 'accountant', 'parent']);
    if (!allowedRoles.has(user.role)) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    return next();
}

module.exports = { protectedUploadsGate, PUBLIC_PREFIXES, PROTECTED_PREFIXES };
