const mongoose = require('mongoose');

/**
 * One row per Stripe event id so a retried or duplicated delivery is applied once.
 * Rows expire after 60 days (Stripe retries for at most a few days).
 */
const stripeWebhookEventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true },
    type: { type: String, default: '' },
    status: { type: String, enum: ['processing', 'done'], default: 'processing' },
    claimedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now, expires: 60 * 24 * 60 * 60 },
});

module.exports = mongoose.model('StripeWebhookEvent', stripeWebhookEventSchema);
