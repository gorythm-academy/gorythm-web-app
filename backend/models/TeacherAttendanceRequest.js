const mongoose = require('mongoose');

const teacherAttendanceRequestSchema = new mongoose.Schema(
    {
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        monthKey: { type: String, required: true },
        presentDays: { type: Number, default: 0 },
        leaveDays: { type: Number, default: 0 },
        absentDays: { type: Number, default: 0 },
        lateDays: { type: Number, default: 0 },
        holidayDays: { type: Number, default: 0 },
        weekendDays: { type: Number, default: 0 },
        reportAbsentDays: { type: Number, default: 0 },
        daysMarked: { type: Number, default: 0 },
        expectedWorkingDays: { type: Number, default: 0 },
        notes: { type: String, default: '' },
        submittedAt: { type: Date, default: null },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        /** Set when month is approved but auto-payroll failed (e.g. missing salary profile). */
        payrollMissingReason: { type: String, default: null },
    },
    { timestamps: true }
);

teacherAttendanceRequestSchema.index({ teacher: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model('TeacherAttendanceRequest', teacherAttendanceRequestSchema);
