const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    studentName: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    courseName: { type: String, trim: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: {
        type: String,
        enum: ['pending', 'awaiting_review', 'paid', 'rejected', 'failed', 'refunded', 'completed'],
        default: 'pending',
    },
    paymentMethod: { type: String, default: 'stripe' },
    transactionId: { type: String },
    stripePaymentIntentId: { type: String },
    refundId: { type: String },
    failureReason: { type: String },
    proofUrl: { type: String, default: '' },
    proofSubmittedAt: { type: Date },
    uploadToken: { type: String },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Payment', paymentSchema);
