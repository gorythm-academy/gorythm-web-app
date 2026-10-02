const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        default: null
    },
    enrollmentDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'inactive', 'paused'],
        default: 'inactive'
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    },
    completionDate: {
        type: Date
    },
    grade: {
        type: String,
        default: null
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
        default: 'pending'
    },
    /** Fee due date for unpaid enrollments. */
    feeDueDate: {
        type: Date,
        default: null,
    },
    feeDueDateManuallySet: { type: Boolean, default: false },
    /** Academy day of month (1-31) used for the next monthly due date. */
    feeDueDay: { type: Number, default: null, min: 1, max: 31 },
    /** Copied from the course at enroll. Empty means old one-time behaviour. */
    totalFeeCount: { type: Number, default: null, min: 1 },
    paidInstallmentCount: { type: Number, default: 0, min: 0 },
    lastSettledDueDate: { type: Date, default: null },
    autoPayEnabled: { type: Boolean, default: false },
    autoPayPayer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    autoPayLastError: { type: String, default: '' },
    autoPayLastAttemptAt: { type: Date, default: null },
    feeReminderDueSentFor: { type: String, default: '' },
    feeReminderOverdueSentFor: { type: String, default: '' },
    dueDateExtensions: {
        type: [
            {
                previousDueDate: { type: Date, default: null },
                newDueDate: { type: Date, required: true },
                by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
                at: { type: Date, default: Date.now },
                note: { type: String, default: '' },
            },
        ],
        default: [],
    },
    /** Class schedule row this student attends (day/time/teacher). */
    assignedSchedule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSchedule',
        default: null,
    },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

enrollmentSchema.pre('save', function assignFeeDueDate(next) {
    next();
});

enrollmentSchema.index({ student: 1, deletedAt: 1 });
enrollmentSchema.index({ deletedAt: 1 });
enrollmentSchema.index({ paymentStatus: 1, feeDueDate: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);