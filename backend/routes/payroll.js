const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const User = require('../models/User');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const TeacherAttendance = require('../models/TeacherAttendance');
const PayrollRun = require('../models/PayrollRun');
const { logAudit } = require('../utils/audit');
const {
    normalizeMonthKey,
    getTeacherAttendanceForPayroll,
    buildPayrollRun,
} = require('../services/payrollCalculation');

function actorId(req) {
    return req.user?.userId || req.user?.id;
}

router.use(authMiddleware);
router.use(allowRoles('accountant', 'admin', 'super-admin'));

router.get('/teachers', async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' }).select('_id name email');
        return res.json({ success: true, teachers });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to load teachers' });
    }
});

router.get('/preview', async (req, res) => {
    try {
        const { teacherId, monthKey } = req.query;
        if (!teacherId || !monthKey) {
            return res.status(400).json({ success: false, error: 'teacherId and monthKey required' });
        }
        const built = await buildPayrollRun(teacherId, monthKey, actorId(req));
        return res.json({
            success: true,
            preview: {
                ...built.amounts,
                attendanceSource: built.attendance.source,
                monthKey: built.monthKey,
            },
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Failed to preview payroll',
        });
    }
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
            actor: actorId(req),
            action: 'payroll.salaryProfile.save',
            targetType: 'User',
            targetId: teacherId,
            details: { monthlySalary, workingDays },
        });
        return res.json({ success: true, profile });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to save salary profile' });
    }
});

router.post('/attendance', async (req, res) => {
    try {
        const { teacherId, monthKey, presentDays, leaveDays, notes } = req.body;
        const key = normalizeMonthKey(monthKey);
        const attendance = await TeacherAttendance.findOneAndUpdate(
            { teacher: teacherId, monthKey: key },
            { presentDays, leaveDays, notes: notes || '' },
            { upsert: true, new: true }
        );
        await logAudit({
            actor: actorId(req),
            action: 'payroll.attendance.save',
            targetType: 'User',
            targetId: teacherId,
            details: { monthKey: key, presentDays, leaveDays },
        });
        return res.json({ success: true, attendance });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to save teacher attendance' });
    }
});

router.post('/run', async (req, res) => {
    try {
        const { teacherId, monthKey } = req.body;
        const built = await buildPayrollRun(teacherId, monthKey, actorId(req));
        const { amounts, attendance, monthKey: key } = built;

        const payroll = await PayrollRun.findOneAndUpdate(
            { teacher: teacherId, monthKey: key },
            {
                monthlySalary: amounts.monthlySalary,
                workingDays: amounts.workingDays,
                leaveDays: amounts.leaveDays,
                presentDays: amounts.presentDays,
                deduction: amounts.deduction,
                finalSalary: amounts.finalSalary,
                generatedBy: actorId(req),
            },
            { upsert: true, new: true }
        )
            .populate('teacher', 'name email');

        await logAudit({
            actor: actorId(req),
            action: 'payroll.run',
            targetType: 'User',
            targetId: teacherId,
            details: {
                monthKey: key,
                finalSalary: amounts.finalSalary,
                deduction: amounts.deduction,
                attendanceSource: attendance.source,
            },
        });

        return res.json({
            success: true,
            payroll,
            calculation: {
                ...amounts,
                attendanceSource: attendance.source,
            },
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Failed to generate payroll',
        });
    }
});

router.get('/runs', async (req, res) => {
    try {
        const runs = await PayrollRun.find()
            .populate('teacher', 'name email')
            .populate('generatedBy', 'name')
            .sort({ createdAt: -1 })
            .limit(200);
        return res.json({ success: true, runs });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'Failed to load payroll runs' });
    }
});

module.exports = router;
