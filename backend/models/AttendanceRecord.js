const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema(
    {
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        date: { type: Date, required: true, default: Date.now },
        status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
        notes: { type: String, default: '' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
