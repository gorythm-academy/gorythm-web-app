const express = require('express');
const router = express.Router();

const TeacherAttendanceRequest = require('../../models/TeacherAttendanceRequest');
const TeacherAttendance = require('../../models/TeacherAttendance');
const TeacherSelfAttendanceDay = require('../../models/TeacherSelfAttendanceDay');
const User = require('../../models/User');
const {
    buildMonthCalendar,
    monthBounds,
    isoDateKey,
} = require('../../services/teacherAttendanceCalendar');
const {
    aggregateFromApprovedDays,
    monthNeedsReapproval,
    getUnmarkedWorkingDays,
    formatUnmarkedWorkingDaysError,
    computeMonthlyApprovalBlock,
    syncMonthlyRequestFromDaily,
} = require('../../services/teacherAttendanceSync');
const {
    assertMonthEndedForApproval,
    autoGeneratePayrollForApprovedMonth,
} = require('../../services/payrollCalculation');

// ——— Teacher attendance approval ———
router.get('/teacher-attendance-daily', async (req, res) => {
    try {
        const { month, status, teacherId } = req.query;
        const filter = {};
        if (month) {
            const key = String(month).trim();
            const { start, end } = monthBounds(key);
            filter.date = { $gte: start, $lte: end };
        }
        if (status && status !== 'all') {
            filter.approvalStatus = status;
        }
        if (teacherId) {
            filter.teacher = teacherId;
        }
        filter.submittedAt = { $ne: null };
        const days = await TeacherSelfAttendanceDay.find(filter)
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email')
            .sort({ date: -1, submittedAt: -1 });
        const workingDays = days.filter((d) => {
            const dow = new Date(d.date).getDay();
            return dow !== 0;
        });
        res.json({
            success: true,
            days: workingDays.map((d) => ({
                _id: d._id,
                date: isoDateKey(d.date),
                status: d.status,
                notes: d.notes || '',
                approvalStatus: d.approvalStatus || 'pending',
                submittedAt: d.submittedAt,
                reviewedAt: d.reviewedAt,
                teacher: d.teacher,
                reviewedBy: d.reviewedBy,
            })),
            count: workingDays.length,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load daily attendance' });
    }
});

router.get('/teacher-attendance-daily/teachers', async (req, res) => {
    try {
        const { month } = req.query;
        const match = { submittedAt: { $ne: null } };
        if (month) {
            const key = String(month).trim();
            const { start, end } = monthBounds(key);
            match.date = { $gte: start, $lte: end };
        }
        const rows = await TeacherSelfAttendanceDay.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$teacher',
                    pendingCount: {
                        $sum: {
                            $cond: [{ $eq: ['$approvalStatus', 'pending'] }, 1, 0],
                        },
                    },
                    totalCount: { $sum: 1 },
                },
            },
        ]);
        const teacherIds = rows.map((r) => r._id).filter(Boolean);
        const users = await User.find({ _id: { $in: teacherIds } }).select('name email');
        const userById = new Map(users.map((u) => [String(u._id), u]));
        const teachers = rows
            .map((r) => {
                const u = userById.get(String(r._id));
                return {
                    _id: r._id,
                    name: u?.name || 'Teacher',
                    email: u?.email || '',
                    pendingCount: r.pendingCount,
                    totalCount: r.totalCount,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json({ success: true, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance teachers' });
    }
});

router.get('/teacher-attendance-daily/pending-summary', async (req, res) => {
    try {
        const days = await TeacherSelfAttendanceDay.find({
            approvalStatus: 'pending',
            submittedAt: { $ne: null },
        }).populate('teacher', 'name email');
        const map = new Map();
        days.forEach((d) => {
            const monthKey = isoDateKey(d.date).slice(0, 7);
            const teacherId = d.teacher?._id || d.teacher;
            const key = `${monthKey}|${teacherId}`;
            if (!map.has(key)) {
                map.set(key, {
                    kind: 'daily',
                    monthKey,
                    teacherId,
                    teacher: d.teacher,
                    pendingCount: 0,
                });
            }
            map.get(key).pendingCount += 1;
        });
        const items = Array.from(map.values()).sort((a, b) => {
            if (a.monthKey !== b.monthKey) return a.monthKey.localeCompare(b.monthKey);
            return (a.teacher?.name || '').localeCompare(b.teacher?.name || '');
        });

        const monthlyRows = await TeacherAttendanceRequest.find({ status: 'pending' })
            .populate('teacher', 'name email')
            .sort({ monthKey: 1 })
            .lean();
        const monthlyItems = monthlyRows.map((row) => ({
            kind: 'monthly',
            monthKey: row.monthKey,
            teacherId: row.teacher?._id || row.teacher,
            teacher: row.teacher,
            requestId: row._id,
            pendingCount: 1,
        }));

        res.json({ success: true, items, monthlyItems });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load pending attendance summary' });
    }
});

router.patch('/teacher-attendance-daily/:id', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'status must be approved, rejected, or pending',
            });
        }
        const reviewerId = req.user?.userId || req.user?.id;
        if (!reviewerId) {
            return res.status(401).json({ success: false, error: 'Reviewer not authenticated' });
        }
        const updates = {
            approvalStatus: status,
            reviewedBy: status === 'pending' ? null : reviewerId,
            reviewedAt: status === 'pending' ? null : new Date(),
        };
        const day = await TeacherSelfAttendanceDay.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        )
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email');
        if (!day) {
            return res.status(404).json({ success: false, error: 'Daily record not found' });
        }
        const teacherId = day.teacher?._id || day.teacher;
        if (teacherId) {
            await syncMonthlyRequestFromDaily(teacherId, day.date);
        }
        res.json({ success: true, day });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update daily attendance' });
    }
});

router.get('/teacher-attendance-requests', async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        if (req.query.month) {
            filter.monthKey = String(req.query.month).trim();
        }
        const requests = await TeacherAttendanceRequest.find(filter)
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email')
            .sort({ submittedAt: -1, updatedAt: -1 })
            .limit(200);
        const pendingRequests = requests.filter((r) => r.status === 'pending');
        const blockByRequestId = new Map();
        if (pendingRequests.length && pendingRequests.length <= 40) {
            await Promise.all(
                pendingRequests.map(async (req) => {
                    const block = await computeMonthlyApprovalBlock(req.teacher, req.monthKey);
                    if (block) blockByRequestId.set(String(req._id), block);
                })
            );
        }
        const enriched = requests.map((req) => {
            const plain = req.toObject ? req.toObject() : req;
            if (plain.status !== 'pending') {
                return { ...plain, approvalBlockReason: null, unmarkedDates: [] };
            }
            const block = blockByRequestId.get(String(req._id));
            return {
                ...plain,
                approvalBlockReason: block?.reason || null,
                unmarkedDates: block?.unmarkedDates || [],
            };
        });
        res.json({ success: true, requests: enriched });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load requests' });
    }
});

router.get('/teacher-attendance-requests/:id/daily', async (req, res) => {
    try {
        const request = await TeacherAttendanceRequest.findById(req.params.id).populate(
            'teacher',
            'name email'
        );
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }
        const monthKey = request.monthKey;
        const calendar = await buildMonthCalendar(monthKey);
        const { start, end } = monthBounds(monthKey);
        const teacherId = request.teacher?._id || request.teacher;
        const days = await TeacherSelfAttendanceDay.find({
            teacher: teacherId,
            date: { $gte: start, $lte: end },
        });
        const marksByDate = {};
        days.forEach((d) => {
            marksByDate[isoDateKey(d.date)] = {
                status: d.status,
                notes: d.notes || '',
                approvalStatus: d.approvalStatus || 'pending',
                _id: d._id,
            };
        });
        const dailyLog = calendar.days.map((d) => ({
            ...d,
            mark: marksByDate[d.date] || null,
        }));
        res.json({
            success: true,
            request,
            monthKey,
            expectedWorkingDays: calendar.expectedWorkingDays,
            dailyLog,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load daily attendance' });
    }
});

router.patch('/teacher-attendance-requests/:id', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'status must be approved, rejected, or pending',
            });
        }
        const reviewerId = req.user?.userId || req.user?.id;
        if (!reviewerId) {
            return res.status(401).json({ success: false, error: 'Reviewer not authenticated' });
        }

        const existing = await TeacherAttendanceRequest.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        const teacherId = existing.teacher?._id || existing.teacher;
        const monthKey = existing.monthKey;
        const { start, end } = monthBounds(monthKey);
        const monthDays = await TeacherSelfAttendanceDay.find({
            teacher: teacherId,
            date: { $gte: start, $lte: end },
        });
        const calendar = await buildMonthCalendar(monthKey);

        if (status === 'approved') {
            assertMonthEndedForApproval(monthKey);
            const unmarked = getUnmarkedWorkingDays(monthDays, calendar.days);
            if (unmarked.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot approve month: ${formatUnmarkedWorkingDaysError(unmarked)}`,
                    unmarkedDates: unmarked,
                });
            }
            const workingMonthDays = monthDays.filter((d) => {
                const key = isoDateKey(d.date);
                const calDay = calendar.days.find((cd) => cd.date === key);
                return calDay?.dayType !== 'weekend';
            });
            const submitted = workingMonthDays.filter((d) => d.submittedAt);
            if (!submitted.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot approve month: no daily attendance submissions for this month.',
                });
            }
            if (monthNeedsReapproval(monthDays, calendar.days)) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot approve month: one or more submitted days are still pending or rejected.',
                });
            }
        }

        const agg = aggregateFromApprovedDays(monthDays, calendar.days);
        const countFields = {
            presentDays: agg.presentDays ?? 0,
            leaveDays: agg.leaveDays ?? 0,
            absentDays: agg.absentDays ?? 0,
            lateDays: agg.lateDays ?? 0,
            holidayDays: agg.holidayDays ?? 0,
            weekendDays: agg.weekendDays ?? 0,
            reportAbsentDays: agg.reportAbsentDays ?? 0,
            daysMarked: agg.daysMarked ?? 0,
            expectedWorkingDays: agg.expectedWorkingDays ?? calendar.expectedWorkingDays,
        };

        const request = await TeacherAttendanceRequest.findByIdAndUpdate(
            req.params.id,
            {
                ...countFields,
                status,
                reviewedBy: status === 'pending' ? null : reviewerId,
                reviewedAt: status === 'pending' ? null : new Date(),
                payrollMissingReason: status === 'approved' || status === 'pending' ? null : existing.payrollMissingReason,
            },
            { new: true, runValidators: true }
        )
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email');

        if (status === 'approved' && teacherId) {
            await TeacherAttendance.findOneAndUpdate(
                { teacher: teacherId, monthKey },
                {
                    ...countFields,
                    notes: request.notes || '',
                },
                { upsert: true, new: true }
            );
        }

        let payroll = null;
        let payrollError = null;
        if (status === 'approved' && teacherId) {
            try {
                const result = await autoGeneratePayrollForApprovedMonth(
                    teacherId,
                    monthKey,
                    reviewerId
                );
                payroll = result.payroll;
            } catch (err) {
                payrollError = err.message || 'Payroll could not be auto-generated';
                await TeacherAttendanceRequest.findByIdAndUpdate(req.params.id, {
                    payrollMissingReason: payrollError,
                });
                request.payrollMissingReason = payrollError;
                req.log?.warn?.('Auto payroll failed after month approval', {
                    teacherId,
                    monthKey,
                    err: payrollError,
                });
            }
        }

        res.json({ success: true, request, payroll, payrollError });
    } catch (error) {
        req.log?.error?.('Teacher attendance request review failed', { err: error });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update request',
        });
    }
});

router.post('/teacher-attendance-requests/:id/retry-payroll', async (req, res) => {
    try {
        const existing = await TeacherAttendanceRequest.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }
        if (existing.status !== 'approved') {
            return res.status(400).json({
                success: false,
                error: 'Payroll can only be generated for approved monthly attendance.',
            });
        }
        const teacherId = existing.teacher?._id || existing.teacher;
        const reviewerId = req.user?.userId || req.user?.id;
        const result = await autoGeneratePayrollForApprovedMonth(
            teacherId,
            existing.monthKey,
            reviewerId
        );
        await TeacherAttendanceRequest.findByIdAndUpdate(existing._id, {
            payrollMissingReason: null,
        });
        res.json({ success: true, payroll: result.payroll });
    } catch (error) {
        const payrollError = error.message || 'Payroll could not be auto-generated';
        await TeacherAttendanceRequest.findByIdAndUpdate(req.params.id, {
            payrollMissingReason: payrollError,
        });
        res.status(error.status || 500).json({ success: false, error: payrollError });
    }
});

module.exports = router;
