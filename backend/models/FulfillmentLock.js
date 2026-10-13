const mongoose = require('mongoose');

/** Short-lived lock so one checkout is fulfilled by one handler at a time. */
const fulfillmentLockSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    lockedUntil: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 },
});

module.exports = mongoose.model('FulfillmentLock', fulfillmentLockSchema);
