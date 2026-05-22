const mongoose = require('mongoose');

const teacherSelfAttendanceDaySchema = new mongoose.Schema(
    {
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        date: { type: Date, required: true },
        status: {
            type: String,
            enum: ['present', 'absent', 'late', 'leave', 'holiday', 'weekend'],
            default: 'present',
        },
        notes: { type: String, default: '' },
    },
    { timestamps: true }
);

teacherSelfAttendanceDaySchema.index({ teacher: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TeacherSelfAttendanceDay', teacherSelfAttendanceDaySchema);
