const mongoose = require('mongoose');

const teacherAttendanceSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    monthKey: { type: String, required: true }, // YYYY-MM
    presentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

teacherAttendanceSchema.index({ teacher: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model('TeacherAttendance', teacherAttendanceSchema);
