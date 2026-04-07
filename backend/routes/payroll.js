const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const User = require('../models/User');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const TeacherAttendance = require('../models/TeacherAttendance');
const PayrollRun = require('../models/PayrollRun');
const { logAudit } = require('../utils/audit');

router.use(authMiddleware);
router.use(allowRoles('accountant', 'admin', 'super-admin'));

router.get('/teachers', async (req, res) => {
  const teachers = await User.find({ role: 'teacher' }).select('_id name email');
  return res.json({ success: true, teachers });
});

router.post('/salary-profile', async (req, res) => {
  try {
    const { teacherId, monthlySalary, workingDays, currency } = req.body;
    const profile = await TeacherSalaryProfile.findOneAndUpdate(
      { teacher: teacherId },
      { monthlySalary, workingDays, currency: currency || 'USD' },
      { upsert: true, new: true }
    );
    await logAudit({
      actor: req.user.id,
      action: 'payroll.salaryProfile.save',
      targetType: 'User',
      targetId: teacherId,
      details: { monthlySalary, workingDays }
    });
    return res.json({ success: true, profile });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to save salary profile' });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const { teacherId, monthKey, presentDays, leaveDays, notes } = req.body;
    const attendance = await TeacherAttendance.findOneAndUpdate(
      { teacher: teacherId, monthKey },
      { presentDays, leaveDays, notes: notes || '' },
      { upsert: true, new: true }
    );
    await logAudit({
      actor: req.user.id,
      action: 'payroll.attendance.save',
      targetType: 'User',
      targetId: teacherId,
      details: { monthKey, presentDays, leaveDays }
    });
    return res.json({ success: true, attendance });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to save teacher attendance' });
  }
});

router.post('/run', async (req, res) => {
  try {
    const { teacherId, monthKey } = req.body;
    const profile = await TeacherSalaryProfile.findOne({ teacher: teacherId });
    const attendance = await TeacherAttendance.findOne({ teacher: teacherId, monthKey });
    if (!profile) return res.status(400).json({ success: false, error: 'Teacher salary profile not found' });

    const workingDays = profile.workingDays || 26;
    const leaveDays = attendance?.leaveDays || 0;
    const presentDays = attendance?.presentDays || 0;
    const perDay = workingDays > 0 ? profile.monthlySalary / workingDays : 0;
    const deduction = Math.max(0, leaveDays * perDay);
    const finalSalary = Math.max(0, profile.monthlySalary - deduction);

    const payroll = await PayrollRun.findOneAndUpdate(
      { teacher: teacherId, monthKey },
      {
        monthlySalary: profile.monthlySalary,
        workingDays,
        leaveDays,
        presentDays,
        deduction,
        finalSalary,
        generatedBy: req.user.id,
      },
      { upsert: true, new: true }
    );
    await logAudit({
      actor: req.user.id,
      action: 'payroll.run',
      targetType: 'User',
      targetId: teacherId,
      details: { monthKey, finalSalary, deduction }
    });

    return res.json({ success: true, payroll });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to generate payroll' });
  }
});

router.get('/runs', async (req, res) => {
  const runs = await PayrollRun.find()
    .populate('teacher', 'name email')
    .populate('generatedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ success: true, runs });
});

module.exports = router;
