const mongoose = require('mongoose');

const autoPayChargeSchema = new mongoose.Schema(
    {
        periodKey: { type: String, required: true, unique: true },
        enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', index: true },
        status: {
            type: String,
            enum: ['open', 'charged', 'failed', 'done'],
            default: 'open',
        },
        attempt: { type: Number, default: 1, min: 1 },
        stripePaymentIntentId: { type: String, default: '' },
        groupId: { type: String, default: '' },
        lastError: { type: String, default: '' },
        declineCode: { type: String, default: '' },
        stopped: { type: Boolean, default: false },
        recording: { type: Boolean, default: false },
        notified: { type: Boolean, default: false },
        lastAttemptAt: { type: Date, default: null },
    },
    { timestamps: true }
);

const autoPayLockSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    lockedUntil: { type: Date, default: null },
});

module.exports = {
    AutoPayCharge: mongoose.model('AutoPayCharge', autoPayChargeSchema),
    AutoPayLock: mongoose.model('AutoPayLock', autoPayLockSchema),
};
