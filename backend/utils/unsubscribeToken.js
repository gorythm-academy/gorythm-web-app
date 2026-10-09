const crypto = require('crypto');

function createUnsubscribeToken() {
    return crypto.randomBytes(24).toString('hex');
}

function publicSiteOrigin() {
    return String(process.env.FRONTEND_URL || 'https://gorythmacademy.com').replace(/\/$/, '');
}

function unsubscribeUrlForToken(token) {
    return `${publicSiteOrigin()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function ensureUnsubscribeToken(subscriber) {
    if (subscriber.unsubscribeToken) return subscriber.unsubscribeToken;
    subscriber.unsubscribeToken = createUnsubscribeToken();
    await subscriber.save();
    return subscriber.unsubscribeToken;
}

module.exports = {
    createUnsubscribeToken,
    publicSiteOrigin,
    unsubscribeUrlForToken,
    ensureUnsubscribeToken,
};
