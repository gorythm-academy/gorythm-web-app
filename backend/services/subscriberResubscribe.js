const crypto = require('crypto');
const { publicSiteOrigin } = require('../utils/unsubscribeToken');

const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function createRawToken() {
    return crypto.randomBytes(32).toString('hex');
}

function confirmExpiresAt(now = Date.now()) {
    return new Date(now + CONFIRM_TTL_MS);
}

function confirmUrl(token) {
    return `${publicSiteOrigin()}/subscribe/confirm?token=${encodeURIComponent(token)}`;
}

/** Unsubscribed addresses stay off until the inbox confirms. */
function subscribeAction(existing) {
    if (existing?.unsubscribedAt) return 'confirm';
    if (existing) return 'refresh';
    return 'create';
}

module.exports = {
    CONFIRM_TTL_MS,
    hashToken,
    createRawToken,
    confirmExpiresAt,
    confirmUrl,
    subscribeAction,
};
