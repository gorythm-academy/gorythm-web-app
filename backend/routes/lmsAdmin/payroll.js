const express = require('express');
const router = express.Router();

const TeacherAttendanceRequest = require('../../models/TeacherAttendanceRequest');
const PayrollRun = require('../../models/PayrollRun');
const TeacherSalaryProfile = require('../../models/TeacherSalaryProfile');
const { getTeacherPayrollAttendanceDetail } = require('../../services/teacherPayrollAttendance');
const { payrollRunTeacherId, payrollRunTeacherDisplay } = require('../../services/payrollCalculation');

// ——— Teacher payroll (paid records for admin) ———
router.get('/payroll-missing-alerts', async (req, res) => {
    try {
        const alerts = await TeacherAttendanceRequest.find({
            status: 'approved',
            payrollMissingReason: { $nin: [null, ''] },
        })
            .populate('teacher', 'name email')
            .sort({ monthKey: -1 })
            .limit(50);
        res.json({ success: true, alerts });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payroll alerts' });
    }
});

router.get('/payroll-runs/:id/attendance', async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id).populate('teacher', 'name email');
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        const teacherId = payrollRunTeacherId(run);
        if (!teacherId) {
            return res.status(404).json({
                success: false,
                error: 'Teacher account no longer exists for this payroll run.',
            });
        }
        const attendance = await getTeacherPayrollAttendanceDetail(teacherId, run.monthKey);
        const teacher = payrollRunTeacherDisplay(run);
        res.json({
            success: true,
            run: {
                _id: run._id,
                monthKey: run.monthKey,
                teacher,
                teacherName: run.teacherName,
                status: run.status,
                finalSalary: run.finalSalary,
            },
            attendance,
        });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Failed to load attendance',
        });
    }
});

router.delete('/payroll-runs/:id', async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Paid payroll runs cannot be deleted. Contact a super-admin if correction is required.',
            });
        }
        await PayrollRun.deleteOne({ _id: run._id });
        res.json({ success: true, message: 'Payroll run deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete payroll run' });
    }
});

router.get('/payroll-runs', async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const runs = await PayrollRun.find(filter)
            .populate('teacher', 'name email')
            .populate('paidBy', 'name email')
            .populate('rejectedBy', 'name email')
            .sort({ monthKey: -1, paidAt: -1, updatedAt: -1 })
            .limit(300);
        const teacherIds = runs.map((r) => r.teacher?._id || r.teacher).filter(Boolean);
        const profiles = await TeacherSalaryProfile.find({ teacher: { $in: teacherIds } });
        const profileByTeacher = new Map(profiles.map((p) => [String(p.teacher), p]));
        const rows = runs.map((r) => {
            const plain = r.toObject();
            const tid = String(r.teacher?._id || r.teacher);
            const profile = profileByTeacher.get(tid);
            return {
                ...plain,
                teacher: payrollRunTeacherDisplay(r),
                profileSalary: profile?.monthlySalary ?? null,
            };
        });
        res.json({ success: true, runs: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payroll runs' });
    }
});

module.exports = router;
