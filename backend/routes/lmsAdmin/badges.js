const express = require('express');
const router = express.Router();

const { createShortTtlCache } = require('../../utils/shortTtlCache');
const TeacherAttendanceRequest = require('../../models/TeacherAttendanceRequest');
const TeacherSelfAttendanceDay = require('../../models/TeacherSelfAttendanceDay');
const Assignment = require('../../models/Assignment');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const Resource = require('../../models/Resource');
const PayrollRun = require('../../models/PayrollRun');
const { activeLmsFilter } = require('../../utils/lmsTrashQuery');

const lmsTabBadgesCache = createShortTtlCache(45_000);

router.get('/lms-tab-badges', async (req, res) => {
    try {
        const force = req.query.force === 'true' || req.query.force === '1';
        if (!force) {
            const cached = lmsTabBadgesCache.get();
            if (cached) {
                return res.json({ success: true, ...cached, cached: true });
            }
        }

        const [
            dailyPending,
            monthlyPending,
            payrollPendingReview,
            payrollStale,
            payrollRejected,
            payrollMissing,
        ] = await Promise.all([
            TeacherSelfAttendanceDay.countDocuments({
                approvalStatus: 'pending',
                submittedAt: { $ne: null },
            }),
            TeacherAttendanceRequest.countDocuments({ status: 'pending' }),
            PayrollRun.countDocuments({ status: 'pending_review' }),
            PayrollRun.countDocuments({ status: 'stale' }),
            PayrollRun.countDocuments({ status: 'rejected' }),
            TeacherAttendanceRequest.countDocuments({
                status: 'approved',
                payrollMissingReason: { $nin: [null, ''] },
            }),
        ]);
        const attendanceCount = dailyPending + monthlyPending;
        const payrollCount =
            payrollPendingReview + payrollStale + payrollRejected + payrollMissing;
        const payload = {
            attendanceCount,
            payrollCount,
            dailyPending,
            monthlyPending,
            payrollPendingReview,
            payrollStale,
            payrollRejected,
            payrollMissing,
        };
        lmsTabBadgesCache.set(payload);
        res.json({ success: true, ...payload });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load LMS tab badges' });
    }
});

/** Pending Resources & Submissions activity since client last visit.
 *  Counts teacher-created assignments/resources and student submissions only —
 *  admin publishes do not increment the admin portal's own badges. */
router.get('/resources-submissions-badge', async (req, res) => {
    try {
        const fallbackSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const parseSince = (raw) => {
            if (!raw) return fallbackSince;
            const d = new Date(raw);
            return Number.isNaN(d.getTime()) ? fallbackSince : d;
        };
        const sinceAssignments = parseSince(req.query.sinceAssignments || req.query.since);
        const sinceResources = parseSince(req.query.sinceResources || req.query.since);
        const sinceSubmissions = parseSince(req.query.sinceSubmissions || req.query.since);
        const [submissions, assignments, resources] = await Promise.all([
            AssignmentSubmission.countDocuments({
                ...activeLmsFilter(),
                submittedAt: { $gt: sinceSubmissions },
            }),
            Assignment.countDocuments({
                ...activeLmsFilter(),
                createdByRole: 'teacher',
                createdAt: { $gt: sinceAssignments },
            }),
            Resource.countDocuments({
                ...activeLmsFilter(),
                createdByRole: 'teacher',
                createdAt: { $gt: sinceResources },
            }),
        ]);
        res.json({
            success: true,
            count: submissions + assignments + resources,
            breakdown: { submissions, assignments, resources },
            tabCounts: { assignments, resources, submissions },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load resources badge count' });
    }
});

router.get('/attendance-pending-count', async (req, res) => {
    try {
        const [dailyPending, monthlyPending] = await Promise.all([
            TeacherSelfAttendanceDay.countDocuments({
                approvalStatus: 'pending',
                submittedAt: { $ne: null },
            }),
            TeacherAttendanceRequest.countDocuments({ status: 'pending' }),
        ]);
        res.json({
            success: true,
            count: dailyPending + monthlyPending,
            dailyPending,
            monthlyPending,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance badge count' });
    }
});

module.exports = router;
