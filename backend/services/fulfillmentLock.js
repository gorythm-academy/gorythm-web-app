const crypto = require('crypto');
const FulfillmentLock = require('../models/FulfillmentLock');

const LOCK_TTL_MS = 2 * 60 * 1000;
const WAIT_MS = 20 * 1000;
const POLL_MS = 250;

function busyError(key) {
    const err = new Error(`Fulfillment is already running for ${key}`);
    err.code = 'FULFILLMENT_BUSY';
    return err;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryAcquire(key, owner, { model, ttlMs, now = new Date() }) {
    const lockedUntil = new Date(now.getTime() + ttlMs);
    try {
        await model.create({ key, owner, lockedUntil });
        return true;
    } catch (err) {
        if (err?.code !== 11000) throw err;
    }
    const taken = await model.findOneAndUpdate(
        { key, lockedUntil: { $lte: now } },
        { $set: { owner, lockedUntil } },
        { new: true }
    );
    return Boolean(taken && taken.owner === owner);
}

/**
 * Run fn while holding a lock on key. Waits for another holder, then throws
 * an error with code FULFILLMENT_BUSY if the lock is still not free.
 */
async function withFulfillmentLock(
    key,
    fn,
    { model = FulfillmentLock, ttlMs = LOCK_TTL_MS, waitMs = WAIT_MS, pollMs = POLL_MS } = {}
) {
    const owner = crypto.randomBytes(12).toString('hex');
    const deadline = Date.now() + waitMs;
    let acquired = await tryAcquire(key, owner, { model, ttlMs });
    while (!acquired) {
        if (Date.now() >= deadline) throw busyError(key);
        await sleep(pollMs);
        acquired = await tryAcquire(key, owner, { model, ttlMs });
    }
    try {
        return await fn();
    } finally {
        await model.deleteOne({ key, owner }).catch(() => {});
    }
}

module.exports = { withFulfillmentLock, LOCK_TTL_MS, WAIT_MS };
