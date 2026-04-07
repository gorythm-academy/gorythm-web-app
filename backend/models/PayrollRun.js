const mongoose = require('mongoose');

const payrollRunSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    monthKey: { type: String, required: true },
    monthlySalary: { type: Number, required: true },
    workingDays: { type: Number, required: true },
    leaveDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    deduction: { type: Number, default: 0 },
    finalSalary: { type: Number, required: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

payrollRunSchema.index({ teacher: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
