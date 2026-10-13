const crypto = require('crypto');
const { deliverableInbox } = require('../utils/studentPortalEmail');
const { publicSiteOrigin } = require('../utils/unsubscribeToken');

const RESET_TTL_MS = 30 * 60 * 1000;
const WELCOME_TTL_MS = 48 * 60 * 60 * 1000;
const GENERIC_MESSAGE = 'If an account uses that email, we sent a reset link.';

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function createRawToken() {
    return crypto.randomBytes(32).toString('hex');
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Inbox that can actually receive mail. A portal login is never that inbox. */
function deliveryAddress(user) {
    return deliverableInbox(user?.personalEmail) || deliverableInbox(user?.email);
}

function canReceiveReset(user) {
    if (!user || user.deletedAt) return false;
    if (user.canLogin === false || user.isActive === false) return false;
    return Boolean(deliveryAddress(user));
}

/** A valid set-password link can be used even before the account can sign in. */
function canApplyPasswordReset(user) {
    return Boolean(user && !user.deletedAt);
}

function resetUrl(token) {
    return `${publicSiteOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
}

function resetExpiresAt(now = Date.now(), ttlMs = RESET_TTL_MS) {
    return new Date(now + ttlMs);
}

module.exports = {
    RESET_TTL_MS,
    WELCOME_TTL_MS,
    GENERIC_MESSAGE,
    hashToken,
    createRawToken,
    escapeRegex,
    deliveryAddress,
    canReceiveReset,
    canApplyPasswordReset,
    resetUrl,
    resetExpiresAt,
};
