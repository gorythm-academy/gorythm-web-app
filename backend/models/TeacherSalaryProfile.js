const mongoose = require('mongoose');

const teacherSalaryProfileSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    monthlySalary: { type: Number, required: true, default: 0 },
    workingDays: { type: Number, required: true, default: 26 },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TeacherSalaryProfile', teacherSalaryProfileSchema);
