const mongoose = require('mongoose');

const paymentLineSchema = new mongoose.Schema(
    {
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
        enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', default: null },
        studentName: { type: String, trim: true, default: '' },
        studentEmail: { type: String, trim: true, lowercase: true, default: '' },
        courseName: { type: String, trim: true, default: '' },
        amount: { type: Number, default: 0 },
        dueDate: { type: Date, default: null },
        installmentMonths: { type: Number, default: 1, min: 1 },
    },
    { _id: false }
);

const dueDateExtensionSchema = new mongoose.Schema(
    {
        previousDueDate: { type: Date, default: null },
        newDueDate: { type: Date, required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
        note: { type: String, default: '' },
    },
    { _id: false }
);

const paymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    studentName: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    courseName: { type: String, trim: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    invoiceNumber: { type: String, default: null, index: true, sparse: true, unique: true },
    presentmentCurrency: { type: String, default: '' },
    presentmentAmount: { type: Number, default: null },
    status: {
        type: String,
        enum: [
            'pending',
            'awaiting_review',
            'processing',
            'paid',
            'rejected',
            'failed',
            'refunded',
            'completed',
            'cancelled',
        ],
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
    groupId: { type: String, default: null, index: true },
    invoiceMode: { type: String, enum: ['combined', 'separate'], default: undefined },
    payerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    payerRole: { type: String, enum: ['parent', 'student', 'guest', 'admin'], default: undefined },
    lines: { type: [paymentLineSchema], default: [] },
    dueDate: { type: Date, default: null },
    dueDateExtensions: { type: [dueDateExtensionSchema], default: [] },
    receiptIssuedAt: { type: Date, default: null },
    installmentCounted: { type: Boolean, default: false },
    installmentMonths: { type: Number, default: 1, min: 1 },
    cardBrand: { type: String, default: '' },
    cardLast4: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

paymentSchema.index({ deletedAt: 1, createdAt: -1 });
paymentSchema.index({ status: 1, deletedAt: 1 });
paymentSchema.index({ dueDate: 1, status: 1 });
paymentSchema.index({ 'lines.student': 1 });
paymentSchema.index({ 'lines.course': 1 });

module.exports = mongoose.model('Payment', paymentSchema);
