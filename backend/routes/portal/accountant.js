const express = require('express');
const router = express.Router();

const { allowPortalRoles } = require('../../middleware/portalAccess');
const PayrollRun = require('../../models/PayrollRun');
const TeacherSalaryProfile = require('../../models/TeacherSalaryProfile');
const TeacherAttendance = require('../../models/TeacherAttendance');
const TeacherAttendanceRequest = require('../../models/TeacherAttendanceRequest');
const Payment = require('../../models/Payment');
const User = require('../../models/User');
const {
    normalizeMonthKey,
    buildPayrollRun,
    persistPayrollRun,
    payrollRunTeacherId,
    payrollRunTeacherDisplay,
} = require('../../services/payrollCalculation');
const { upsertTeacherPayrollProfile } = require('../../services/teacherPayrollProfile');
const { getTeacherPayrollAttendanceDetail } = require('../../services/teacherPayrollAttendance');
const { activeUserFilter } = require('../../utils/userQuery');
const {
    activePaymentFilter,
    trashedPaymentFilter,
    activePaymentListFilter,
} = require('../../utils/paymentQuery');
const { serializePayments } = require('../../utils/serializePayment');

// ————————————————— ACCOUNTANT (read-focused portal APIs) —————————————————

router.get('/accountant/dashboard', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payments = await Payment.find(activePaymentFilter()).sort({ createdAt: -1 }).limit(500);
        const payrollRuns = await PayrollRun.find().select('status');
        const payrollMissingAlerts = await TeacherAttendanceRequest.find({
            status: 'approved',
            payrollMissingReason: { $nin: [null, ''] },
        })
            .populate('teacher', 'name email')
            .sort({ monthKey: -1 })
            .limit(20);
        res.json({
            success: true,
            summary: {
                payments: payments.length,
                paid: payments.filter((p) => p.status === 'paid' || p.status === 'completed').length,
                pending: payments.filter((p) =>
                    ['pending', 'awaiting_review', 'processing'].includes(p.status)
                ).length,
                refunded: payments.filter((p) => p.status === 'refunded').length,
                failed: payments.filter((p) => p.status === 'failed').length,
                payrollPendingReview: payrollRuns.filter((r) => r.status === 'pending_review').length,
                payrollStale: payrollRuns.filter((r) => r.status === 'stale').length,
                payrollPaid: payrollRuns.filter((r) => r.status === 'paid').length,
                payrollMissing: payrollMissingAlerts.length,
            },
            payrollMissingAlerts: payrollMissingAlerts.map((a) => ({
                _id: a._id,
                teacher: a.teacher,
                monthKey: a.monthKey,
                reason: a.payrollMissingReason,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load accountant dashboard' });
    }
});

router.get('/accountant/payments', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const filter = trash ? trashedPaymentFilter() : activePaymentListFilter();
        const sort = trash ? { deletedAt: -1 } : { createdAt: -1 };
        const [payments, trashCount] = await Promise.all([
            Payment.find(filter)
                .populate('user', 'name email')
                .populate('course', 'title')
                .sort(sort)
                .lean(),
            Payment.countDocuments(trashedPaymentFilter()),
        ]);
        const withProof = serializePayments(payments).map((p) => ({
            ...p,
            proofUrl: p.proofUrl || '',
        }));
        res.json({ success: true, payments: withProof, trashCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payments' });
    }
});

router.patch('/accountant/payments/:id/approve', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { isPaidStatus } = require('../../services/onPaymentPaid');
        const verifiedBy = req.portalActorId || req.user?.userId;
        const { fulfillPaymentEnrollment } = require('../../services/onPaymentPaid');
        const { resolveAndLinkCourseOnPayment } = require('../../services/resolveCourseFromPayment');

        const claimed = await Payment.findOneAndUpdate(
            {
                _id: req.params.id,
                ...activePaymentFilter(),
                paymentMethod: 'bank',
                status: 'awaiting_review',
                proofUrl: { $nin: [null, ''] },
            },
            {
                $set: {
                    status: 'processing',
                    verifiedBy,
                    verifiedAt: new Date(),
                },
            },
            { new: true }
        );

        if (!claimed) {
            const payment = await Payment.findById(req.params.id);
            if (!payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            if (payment.deletedAt) {
                return res.status(400).json({ success: false, error: 'Payment is in trash' });
            }
            if (payment.paymentMethod !== 'bank') {
                return res.status(400).json({ success: false, error: 'Only bank transfer payments can be approved here' });
            }
            if (!payment.proofUrl) {
                return res.status(400).json({ success: false, error: 'No payment proof uploaded yet' });
            }
            if (isPaidStatus(payment.status)) {
                return res.status(400).json({ success: false, error: 'Payment is already paid' });
            }
            return res.status(400).json({ success: false, error: 'Payment is not awaiting review' });
        }

        try {
            await resolveAndLinkCourseOnPayment(claimed);
            await claimed.populate(['user', 'course']);
            await fulfillPaymentEnrollment(claimed, { verifiedBy });

            claimed.status = 'paid';
            claimed.rejectionReason = '';
            await claimed.save();

            res.json({ success: true, message: 'Payment approved', payment: claimed });
        } catch (error) {
            await Payment.findByIdAndUpdate(claimed._id, {
                $set: { status: 'awaiting_review' },
                $unset: { verifiedBy: 1, verifiedAt: 1 },
            });
            throw error;
        }
    } catch (error) {
        req.log?.error('Approve bank payment failed', { err: error });
        const msg =
            error?.code === 11000
                ? 'Could not create student account — that email is already used. Ask admin to link the student manually.'
                : error.message || 'Failed to approve payment';
        res.status(400).json({ success: false, error: msg });
    }
});

router.patch('/accountant/payments/:id/reject', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { isPaidStatus } = require('../../services/onPaymentPaid');
        const reason = String(req.body?.reason || '').trim();
        if (!reason) {
            return res.status(400).json({ success: false, error: 'Rejection reason is required' });
        }
        const payment = await Payment.findOne({ _id: req.params.id, ...activePaymentFilter() });
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }
        if (payment.paymentMethod !== 'bank') {
            return res.status(400).json({ success: false, error: 'Only bank transfer payments can be rejected here' });
        }
        if (isPaidStatus(payment.status)) {
            return res.status(400).json({ success: false, error: 'Paid payments cannot be rejected' });
        }
        if (!['awaiting_review', 'pending', 'processing'].includes(payment.status)) {
            return res.status(400).json({ success: false, error: 'This payment cannot be rejected' });
        }

        payment.status = 'rejected';
        payment.rejectionReason = reason;
        await payment.save();

        res.json({ success: true, message: 'Payment rejected', payment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to reject payment' });
    }
});

router.delete('/accountant/payments/:id', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payment = await Payment.findOneAndUpdate(
            { _id: req.params.id, ...activePaymentFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }
        res.json({ success: true, message: 'Payment moved to trash', paymentId: req.params.id });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete payment' });
    }
});

router.patch('/accountant/payments/:id/restore', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payment = await Payment.findOneAndUpdate(
            { _id: req.params.id, ...trashedPaymentFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Trashed payment not found' });
        }
        res.json({ success: true, message: 'Payment restored', payment });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore payment' });
    }
});

router.delete('/accountant/payments/:id/permanent', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { deleteProofFile } = require('../../services/trashCleanup');
        const payment = await Payment.findOne({
            _id: req.params.id,
            ...trashedPaymentFilter(),
        });
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment must be in trash before permanent delete' });
        }
        if (payment.proofUrl) {
            deleteProofFile(payment.proofUrl);
        }
        await Payment.deleteOne({ _id: payment._id });
        res.json({ success: true, message: 'Payment permanently deleted', paymentId: req.params.id });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete payment' });
    }
});

// ————————————————— ACCOUNTANT PAYROLL (portal; uses approved attendance) —————————————————

router.get('/accountant/payroll/teachers', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher', ...activeUserFilter() }).select('_id name email');
        res.json({ success: true, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teachers' });
    }
});

router.get('/accountant/payroll/preview', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey } = req.query;
        if (!teacherId || !monthKey) {
            return res.status(400).json({ success: false, error: 'teacherId and monthKey required' });
        }
        const built = await buildPayrollRun(teacherId, monthKey, req.portalActorId || req.user?.userId);
        res.json({
            success: true,
            preview: { ...built.amounts, attendanceSource: built.attendance.source, monthKey: built.monthKey },
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Preview failed' });
    }
});

router.get('/accountant/payroll/salary-profiles', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher', ...activeUserFilter() }).select('_id name email').sort({ name: 1 });
        const profiles = await TeacherSalaryProfile.find().populate('teacher', 'name email');
        const profileByTeacher = new Map(profiles.map((p) => [String(p.teacher?._id || p.teacher), p]));
        const rows = teachers.map((t) => ({
            teacher: t,
            profile: profileByTeacher.get(String(t._id)) || null,
        }));
        const listedTeacherIds = new Set(teachers.map((t) => String(t._id)));
        profiles.forEach((p) => {
            const teacherRef = p.teacher?._id || p.get('teacher');
            const tid = teacherRef ? String(teacherRef) : '';
            if (!tid || listedTeacherIds.has(tid)) return;
            rows.push({
                teacher: p.teacher?.name
                    ? p.teacher
                    : { _id: teacherRef, name: 'Removed teacher', email: '', removed: true },
                profile: p,
                teacherRemoved: true,
            });
        });
        res.json({ success: true, rows });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load salary profiles' });
    }
});

router.post('/accountant/payroll/salary-profile', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, name, monthlySalary, workingDays, email } = req.body;
        const result = await upsertTeacherPayrollProfile({
            teacherId: teacherId || null,
            name,
            monthlySalary,
            workingDays,
            email,
        });
        res.json({
            success: true,
            profile: result.profile,
            teacher: { _id: result.teacher._id, name: result.teacher.name, email: result.teacher.email },
            created: result.created,
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to save salary profile' });
    }
});

router.patch('/accountant/payroll/teacher-profile/:teacherId', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { name, monthlySalary, workingDays } = req.body;
        const result = await upsertTeacherPayrollProfile({
            teacherId: req.params.teacherId,
            name,
            monthlySalary,
            workingDays,
        });
        res.json({
            success: true,
            profile: result.profile,
            teacher: { _id: result.teacher._id, name: result.teacher.name, email: result.teacher.email },
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to update teacher profile' });
    }
});

router.delete('/accountant/payroll/teacher-profile/:teacherId', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const teacherId = req.params.teacherId;
        const profile = await TeacherSalaryProfile.findOneAndDelete({ teacher: teacherId });
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Teacher salary profile not found' });
        }
        res.json({ success: true, message: 'Teacher salary profile removed' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to remove teacher salary profile' });
    }
});

router.post('/accountant/payroll/attendance', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey, presentDays, leaveDays, absentDays, notes } = req.body;
        const key = normalizeMonthKey(monthKey);
        const attendance = await TeacherAttendance.findOneAndUpdate(
            { teacher: teacherId, monthKey: key },
            {
                presentDays,
                leaveDays,
                absentDays: absentDays ?? 0,
                notes: notes || '',
            },
            { upsert: true, new: true }
        );
        res.json({ success: true, attendance });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save attendance' });
    }
});

router.post('/accountant/payroll/run', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey } = req.body;
        const actorId = req.portalActorId || req.user?.userId;
        const result = await persistPayrollRun(teacherId, monthKey, actorId, {
            autoGenerated: false,
            status: 'pending_review',
        });
        res.json({ success: true, payroll: result.payroll, calculation: result.calculation });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to generate payroll' });
    }
});

router.post('/accountant/payroll/runs/:id/regenerate', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Cannot regenerate a payroll that is already marked paid.',
            });
        }
        const actorId = req.portalActorId || req.user?.userId;
        const result = await persistPayrollRun(run.teacher, run.monthKey, actorId, {
            autoGenerated: false,
            status: 'pending_review',
        });
        res.json({ success: true, payroll: result.payroll, calculation: result.calculation });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to regenerate payroll' });
    }
});

router.get('/accountant/payroll/runs/:id/attendance', allowPortalRoles('accountant'), async (req, res) => {
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
                presentDays: run.presentDays,
                absentDays: run.absentDays,
                deduction: run.deduction,
                finalSalary: run.finalSalary,
                status: run.status,
            },
            attendance,
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to load attendance' });
    }
});

router.patch('/accountant/payroll/runs/:id', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({ success: false, error: 'Cannot edit a payroll that is already marked paid.' });
        }
        const { deduction, finalSalary, absentDays, accountantNotes } = req.body;
        const updates = { editedByAccountant: true };
        if (accountantNotes !== undefined) updates.accountantNotes = String(accountantNotes || '');

        if (absentDays !== undefined && absentDays !== null) {
            const absent = Math.max(0, Number(absentDays) || 0);
            const perDay = run.workingDays > 0 ? run.monthlySalary / run.workingDays : 0;
            updates.absentDays = absent;
            updates.deductionDays = absent;
            updates.deduction = Math.round(perDay * absent * 100) / 100;
            updates.finalSalary = Math.max(0, Math.round((run.monthlySalary - updates.deduction) * 100) / 100);
        } else {
            if (deduction !== undefined && deduction !== null) {
                updates.deduction = Math.max(0, Number(deduction) || 0);
            }
            if (finalSalary !== undefined && finalSalary !== null) {
                updates.finalSalary = Math.max(0, Number(finalSalary) || 0);
            } else if (updates.deduction !== undefined) {
                updates.finalSalary = Math.max(
                    0,
                    Math.round((run.monthlySalary - updates.deduction) * 100) / 100
                );
            }
        }

        const payroll = await PayrollRun.findByIdAndUpdate(run._id, updates, { new: true })
            .populate('teacher', 'name email')
            .populate('generatedBy', 'name email');
        res.json({ success: true, payroll });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update payroll' });
    }
});

router.patch('/accountant/payroll/runs/:id/mark-paid', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'stale') {
            return res.status(400).json({
                success: false,
                error: 'This payroll is out of date. Regenerate from approved attendance before marking paid.',
            });
        }
        if (run.status === 'paid') {
            return res.status(400).json({ success: false, error: 'Payroll is already marked paid.' });
        }
        if (run.status === 'rejected') {
            return res.status(400).json({
                success: false,
                error: 'Rejected payroll must be reviewed by admin before marking paid.',
            });
        }
        const actorId = req.portalActorId || req.user?.userId;
        const payroll = await PayrollRun.findByIdAndUpdate(
            run._id,
            { status: 'paid', paidAt: new Date(), paidBy: actorId, rejectedAt: null, rejectedBy: null },
            { new: true }
        )
            .populate('teacher', 'name email')
            .populate('paidBy', 'name email');
        res.json({ success: true, payroll });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark payroll paid' });
    }
});

router.patch('/accountant/payroll/runs/:id/reject', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { note } = req.body;
        const trimmedNote = String(note || '').trim();
        if (!trimmedNote) {
            return res.status(400).json({ success: false, error: 'Rejection note is required' });
        }
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({ success: false, error: 'Paid payroll cannot be rejected.' });
        }
        const actorId = req.portalActorId || req.user?.userId;
        const teacherId = payrollRunTeacherId(run);
        const payroll = await PayrollRun.findByIdAndUpdate(
            run._id,
            {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: actorId,
                accountantNotes: trimmedNote,
                paidAt: null,
                paidBy: null,
            },
            { new: true }
        )
            .populate('teacher', 'name email')
            .populate('rejectedBy', 'name email');
        if (teacherId) {
            await TeacherAttendanceRequest.updateOne(
                { teacher: teacherId, monthKey: run.monthKey },
                { status: 'pending', reviewedBy: null, reviewedAt: null }
            );
        }
        res.json({ success: true, payroll });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to reject payroll' });
    }
});

router.delete('/accountant/payroll/runs/:id', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Paid payroll runs cannot be deleted. Contact an admin if this record must be removed.',
            });
        }
        await PayrollRun.deleteOne({ _id: run._id });
        res.json({ success: true, message: 'Payroll run deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete payroll run' });
    }
});

router.get('/accountant/payroll/runs', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const runs = await PayrollRun.find(filter)
            .populate('teacher', 'name email')
            .populate('generatedBy', 'name email')
            .populate('paidBy', 'name email')
            .populate('rejectedBy', 'name email')
            .sort({ monthKey: -1, updatedAt: -1 })
            .limit(200);
        const teacherIds = runs.map((r) => r.teacher?._id || r.teacher).filter(Boolean);
        const profiles = await TeacherSalaryProfile.find({ teacher: { $in: teacherIds } });
        const profileByTeacher = new Map(profiles.map((p) => [String(p.teacher), p]));
        const enriched = runs.map((r) => {
            const plain = r.toObject();
            const tid = String(r.teacher?._id || r.teacher);
            const profile = profileByTeacher.get(tid);
            const teacher = payrollRunTeacherDisplay(r);
            return {
                ...plain,
                teacher,
                profileSalary: profile?.monthlySalary ?? null,
                profileWorkingDays: profile?.workingDays ?? null,
            };
        });
        res.json({ success: true, runs: enriched });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payroll runs' });
    }
});

module.exports = router;
