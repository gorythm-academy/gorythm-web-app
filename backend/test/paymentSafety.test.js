const test = require('node:test');
const assert = require('node:assert/strict');

const { withFulfillmentLock } = require('../services/fulfillmentLock');
const {
    claimWebhookEvent,
    completeWebhookEvent,
    releaseWebhookEvent,
    isChargeFullyRefunded,
    CLAIM_STALE_MS,
} = require('../services/stripeWebhookEvents');
const { paymentNeedsFulfillmentRetry } = require('../services/billingCheckout');
const { applyInstallmentPayment } = require('../services/feeDuePolicy');

/** Tiny in-memory stand-in for a Mongoose model keyed by a unique field. */
function fakeModel(uniqueField) {
    const rows = new Map();
    const matches = (row, filter) =>
        Object.entries(filter).every(([key, cond]) => {
            if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
                if ('$lte' in cond) return row[key] <= cond.$lte;
                if ('$lt' in cond) return row[key] < cond.$lt;
            }
            return row[key] === cond;
        });
    const find = (filter) => [...rows.values()].find((row) => matches(row, filter)) || null;
    return {
        rows,
        async create(doc) {
            if (rows.has(doc[uniqueField])) {
                const err = new Error('duplicate');
                err.code = 11000;
                throw err;
            }
            rows.set(doc[uniqueField], { ...doc });
            return doc;
        },
        async findOneAndUpdate(filter, update) {
            const row = find(filter);
            if (row) Object.assign(row, update.$set);
            return row;
        },
        findOne(filter) {
            const row = find(filter);
            return { select: async () => row };
        },
        async updateOne(filter, update) {
            const row = find(filter);
            if (row) Object.assign(row, update.$set);
        },
        async deleteOne(filter) {
            const row = find(filter);
            if (row) rows.delete(row[uniqueField]);
        },
    };
}

test('fulfillment lock runs one holder at a time and releases afterwards', async () => {
    const model = fakeModel('key');
    const order = [];
    const run = (name) =>
        withFulfillmentLock(
            'checkout:cs_test_1',
            async () => {
                order.push(`${name}:start`);
                await new Promise((r) => setTimeout(r, 30));
                order.push(`${name}:end`);
            },
            { model, pollMs: 5, waitMs: 2000 }
        );
    await Promise.all([run('a'), run('b')]);
    assert.deepEqual(order.length, 4);
    assert.equal(order[0].split(':')[1], 'start');
    assert.equal(order[1].split(':')[1], 'end');
    assert.equal(model.rows.size, 0);
});

test('fulfillment lock reports busy when the holder never finishes', async () => {
    const model = fakeModel('key');
    await model.create({ key: 'k', owner: 'other', lockedUntil: new Date(Date.now() + 60000) });
    await assert.rejects(
        withFulfillmentLock('k', async () => 'x', { model, pollMs: 5, waitMs: 30 }),
        (err) => err.code === 'FULFILLMENT_BUSY'
    );
});

test('fulfillment lock is taken over after it expires and released on error', async () => {
    const model = fakeModel('key');
    await model.create({ key: 'k', owner: 'dead', lockedUntil: new Date(Date.now() - 1000) });
    await assert.rejects(
        withFulfillmentLock('k', async () => {
            throw new Error('boom');
        }, { model, pollMs: 5, waitMs: 100 }),
        /boom/
    );
    assert.equal(model.rows.size, 0);
});

test('webhook event is claimed once, then duplicate after done', async () => {
    const model = fakeModel('eventId');
    const event = { id: 'evt_1', type: 'charge.refunded' };
    assert.equal(await claimWebhookEvent(event, { model }), 'claimed');
    assert.equal(await claimWebhookEvent(event, { model }), 'busy');
    await completeWebhookEvent('evt_1', { model });
    assert.equal(await claimWebhookEvent(event, { model }), 'duplicate');
});

test('webhook event can be retried after release or when the claim is stale', async () => {
    const model = fakeModel('eventId');
    const event = { id: 'evt_2', type: 'payment_intent.payment_failed' };
    assert.equal(await claimWebhookEvent(event, { model }), 'claimed');
    await releaseWebhookEvent('evt_2', { model });
    assert.equal(await claimWebhookEvent(event, { model }), 'claimed');

    const later = new Date(Date.now() + CLAIM_STALE_MS + 1000);
    assert.equal(await claimWebhookEvent(event, { model, now: later }), 'claimed');
});

test('only full refunds count as refunded', () => {
    assert.equal(isChargeFullyRefunded({ refunded: true, amount: 1000, amount_refunded: 1000 }), true);
    assert.equal(isChargeFullyRefunded({ refunded: false, amount: 1000, amount_refunded: 400 }), false);
    assert.equal(isChargeFullyRefunded({ amount: 1000, amount_refunded: 1000 }), true);
    assert.equal(isChargeFullyRefunded(null), false);
});

test('unfinished paid rows are retried only inside the retry window', () => {
    const fresh = { status: 'paid', createdAt: new Date() };
    assert.equal(paymentNeedsFulfillmentRetry(fresh), true);
    assert.equal(paymentNeedsFulfillmentRetry({ ...fresh, fulfilledAt: new Date() }), false);
    assert.equal(paymentNeedsFulfillmentRetry({ ...fresh, failureReason: 'No course' }), false);
    assert.equal(paymentNeedsFulfillmentRetry({ ...fresh, status: 'pending' }), false);
    const old = { status: 'paid', createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) };
    assert.equal(paymentNeedsFulfillmentRetry(old), false);
});

test('a payment that was already counted is not applied twice', async () => {
    const payment = { installmentCounted: true, lines: [] };
    const result = await applyInstallmentPayment({ course: {} }, payment, { course: {} });
    assert.equal(result.counted, true);
    assert.equal(result.alreadyCounted, true);
    assert.equal(payment.installmentCounted, true);
});
