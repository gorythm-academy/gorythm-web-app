const StripeWebhookEvent = require('../models/StripeWebhookEvent');

/** A claim that was never finished (crashed worker) can be taken over after this long. */
const CLAIM_STALE_MS = 5 * 60 * 1000;

/**
 * Try to become the only handler of a Stripe event.
 * Returns 'claimed' (handle it), 'duplicate' (already handled), or 'busy' (another worker is on it).
 */
async function claimWebhookEvent(event, { model = StripeWebhookEvent, now = new Date() } = {}) {
    try {
        await model.create({
            eventId: event.id,
            type: event.type,
            status: 'processing',
            claimedAt: now,
        });
        return 'claimed';
    } catch (err) {
        if (err?.code !== 11000) throw err;
    }

    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
    const taken = await model.findOneAndUpdate(
        { eventId: event.id, status: 'processing', claimedAt: { $lt: staleBefore } },
        { $set: { claimedAt: now } }
    );
    if (taken) return 'claimed';

    const existing = await model.findOne({ eventId: event.id }).select('status');
    if (existing?.status === 'done') return 'duplicate';
    return 'busy';
}

async function completeWebhookEvent(eventId, { model = StripeWebhookEvent } = {}) {
    await model.updateOne({ eventId }, { $set: { status: 'done' } });
}

/** Handler failed: let Stripe's retry run the event again. */
async function releaseWebhookEvent(eventId, { model = StripeWebhookEvent } = {}) {
    await model.deleteOne({ eventId, status: 'processing' });
}

/** True only when Stripe reports the whole charge was refunded (not a partial refund). */
function isChargeFullyRefunded(charge) {
    if (!charge) return false;
    if (charge.refunded === true) return true;
    const amount = Number(charge.amount || 0);
    return amount > 0 && Number(charge.amount_refunded || 0) >= amount;
}

module.exports = {
    CLAIM_STALE_MS,
    claimWebhookEvent,
    completeWebhookEvent,
    releaseWebhookEvent,
    isChargeFullyRefunded,
};
