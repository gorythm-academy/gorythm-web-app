const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const ContactMessage = require('../models/ContactMessage');
const Subscriber = require('../models/Subscriber');
const ClassSchedule = require('../models/ClassSchedule');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { activeUserFilter } = require('../utils/userQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activePaymentFilter, activePaymentListFilter } = require('../utils/paymentQuery');
const {
    nextScheduleOccurrenceMs,
    scheduleStatus,
    withNormalizedTimezone,
} = require('../utils/scheduleTimezone');
const { getAcademyTimezone } = require('../services/academyTimezone');

function getAdminUserId(req) {
    return req.user?.userId || req.user?.id;
}

async function getAdminActivitiesClearedAt(userId) {
    if (!userId) return null;
    const user = await User.findById(userId).select('adminActivitiesClearedAt').lean();
    return user?.adminActivitiesClearedAt || null;
}

function filterActivitiesAfterClear(activities, clearedAt) {
    const list = Array.isArray(activities) ? activities : [];
    if (!clearedAt) return list;
    const clearedMs = new Date(clearedAt).getTime();
    if (Number.isNaN(clearedMs)) return list;
    return list.filter((a) => a.at && new Date(a.at).getTime() > clearedMs);
}

router.use(authMiddleware);
router.use(validateSessionUser);
router.use(allowRoles('manager', 'super-admin'));

// Dashboard stats endpoint
async function fetchDashboardStatsPayload() {
    const totalStudents = await User.countDocuments({ role: 'student', ...activeUserFilter() });
    const totalTeachers = await User.countDocuments({ role: 'teacher', ...activeUserFilter() });
    const totalParents = await User.countDocuments({ role: 'parent', ...activeUserFilter() });
    const totalCourses = await Course.countDocuments({ isPublished: true, ...activeCourseFilter() });

    const revenueAgg = await Payment.aggregate([
        {
            $match: {
                ...activePaymentListFilter(),
                status: { $in: ['paid', 'completed'] },
            },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    const activeStaff = await User.countDocuments({
        isActive: { $ne: false },
        role: { $in: ['manager', 'super-admin', 'accountant'] },
        ...activeUserFilter(),
    });

    return {
        totalStudents,
        totalTeachers,
        totalParents,
        totalCourses,
        totalRevenue,
        activeStaff,
        activeUsers: activeStaff,
    };
}

router.get('/dashboard/stats', async (req, res) => {
    try {
        const stats = await fetchDashboardStatsPayload();
        res.json({ success: true, stats });
    } catch (error) {
        req.log.error('Dashboard stats error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
    }
});

router.get('/dashboard', async (req, res) => {
    try {
        req.log.info('Fetching dashboard stats');

        const stats = await fetchDashboardStatsPayload();

        const clearedAt = await getAdminActivitiesClearedAt(getAdminUserId(req));
        const recentActivities = filterActivitiesAfterClear(
            await buildCrossTabRecentActivities(),
            clearedAt
        );
        const upcomingClasses = await buildUpcomingDashboardClasses();

        res.json({
            success: true,
            stats: {
                ...stats,
                /** @deprecated use activeStaff */
            },
            recentActivities,
            upcomingClasses,
        });

        req.log.debug('Dashboard stats sent');

    } catch (error) {
        req.log.error('Dashboard error', { err: error });
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch dashboard data'
        });
    }
});

router.get('/dashboard/activities', async (req, res) => {
    try {
        const clearedAt = await getAdminActivitiesClearedAt(getAdminUserId(req));
        const recentActivities = filterActivitiesAfterClear(
            await buildCrossTabRecentActivities(),
            clearedAt
        );
        res.json({ success: true, recentActivities });
    } catch (error) {
        req.log.error('Dashboard activities error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch dashboard activities' });
    }
});

router.get('/dashboard/upcoming-classes', async (req, res) => {
    try {
        const upcomingClasses = await buildUpcomingDashboardClasses();
        res.json({ success: true, upcomingClasses });
    } catch (error) {
        req.log.error('Dashboard upcoming classes error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch upcoming classes' });
    }
});

router.post('/dashboard/clear-activities', async (req, res) => {
    try {
        const userId = getAdminUserId(req);
        const clearedAt = new Date();
        await User.findByIdAndUpdate(userId, { adminActivitiesClearedAt: clearedAt });
        res.json({ success: true, clearedAt: clearedAt.toISOString() });
    } catch (error) {
        req.log.error('Dashboard clear activities error', { err: error });
        res.status(500).json({ success: false, error: 'Failed to clear activities' });
    }
});

const ACTIVITY_PER_SOURCE = 45;
const ACTIVITY_FEED_MAX = 200;
const UPCOMING_CLASS_LIMIT = 12;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function buildUpcomingDashboardClasses() {
    const now = new Date();
    const academyTz = await getAcademyTimezone();
    const schedules = await ClassSchedule.find()
        .populate('course', 'title deletedAt')
        .populate('teacher', 'name deletedAt')
        .lean();

    const activeSchedules = schedules.filter(
        (s) => s.course && !s.course.deletedAt && s.teacher && !s.teacher.deletedAt
    );
    if (!activeSchedules.length) return [];

    const scheduleIds = activeSchedules.map((s) => s._id);
    const courseIds = [...new Set(activeSchedules.map((s) => s.course._id))];

    const [bySchedule, unassignedRows] = await Promise.all([
        Enrollment.aggregate([
            {
                $match: {
                    ...activeEnrollmentFilter(),
                    assignedSchedule: { $in: scheduleIds },
                    status: 'active',
                },
            },
            { $group: { _id: '$assignedSchedule', count: { $sum: 1 } } },
        ]),
        Enrollment.aggregate([
            {
                $match: {
                    ...activeEnrollmentFilter(),
                    course: { $in: courseIds },
                    status: 'active',
                    $or: [{ assignedSchedule: null }, { assignedSchedule: { $exists: false } }],
                },
            },
            { $group: { _id: '$course', count: { $sum: 1 } } },
        ]),
    ]);

    const studentsOnSchedule = Object.fromEntries(bySchedule.map((r) => [String(r._id), r.count]));
    const unassignedOnCourse = Object.fromEntries(unassignedRows.map((r) => [String(r._id), r.count]));

    const mapped = activeSchedules.map((s) => {
        const scheduleId = String(s._id);
        const courseId = String(s.course._id);
        const dayLabel = WEEKDAY_LABELS[s.dayOfWeek] || '';
        const timeLabel = `${s.startTime} – ${s.endTime}`;
        const normalized = withNormalizedTimezone(s, academyTz);

        return {
            id: scheduleId,
            courseId,
            course: s.course?.title || 'Course',
            instructor: s.teacher?.name || '—',
            date: dayLabel ? `${dayLabel}, ${timeLabel}` : timeLabel,
            dayOfWeek: normalized.dayOfWeek,
            startTime: normalized.startTime,
            endTime: normalized.endTime,
            status: scheduleStatus(normalized, now),
            roomOrLink: s.roomOrLink || '',
            timezone: normalized.timezone,
            studentsAssigned: studentsOnSchedule[scheduleId] ?? 0,
            _nextMs: nextScheduleOccurrenceMs(normalized, now),
        };
    });

    mapped.sort((a, b) => a._nextMs - b._nextMs);

    const primaryScheduleByCourse = {};
    for (const row of mapped) {
        if (!primaryScheduleByCourse[row.courseId]) {
            primaryScheduleByCourse[row.courseId] = row.id;
        }
    }

    return mapped.slice(0, UPCOMING_CLASS_LIMIT).map((row) => {
        const unassigned =
            primaryScheduleByCourse[row.courseId] === row.id
                ? unassignedOnCourse[row.courseId] ?? 0
                : 0;
        const students = row.studentsAssigned + unassigned;
        const { _nextMs, courseId, studentsAssigned, ...rest } = row;
        return {
            ...rest,
            students,
            studentsAssigned,
            studentsUnassignedIncluded: unassigned,
        };
    });
}

function truncateText(text, maxLen) {
    const s = String(text || '').trim();
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}…`;
}

function activityFeedRow(actor, action, at, icon) {
    const parsed = at ? new Date(at) : new Date();
    const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const ts = d.getTime();
    return {
        user: actor,
        action,
        time: formatTimeAgo(d),
        icon,
        /** ISO timestamp for client-side filtering (e.g. “clear feed” in admin dashboard). */
        at: d.toISOString(),
        _ts: ts,
    };
}

/**
 * Merges recent events from enrollments, payments, users, courses, contact, subscribers — sorted newest first.
 */
async function buildCrossTabRecentActivities() {
    const [
        enrollments,
        payments,
        portalUsers,
        courses,
        contacts,
        subscribers,
    ] = await Promise.all([
        Enrollment.find({ ...activeEnrollmentFilter() })
            .sort({ enrollmentDate: -1, createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .populate('student', 'name deletedAt')
            .populate('course', 'title deletedAt')
            .lean(),
        Payment.find({ ...activePaymentFilter() })
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .populate('user', 'name')
            .populate('course', 'title')
            .lean(),
        User.find({ role: { $in: ['student', 'teacher', 'parent'] }, ...activeUserFilter() })
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .select('name role createdAt')
            .lean(),
        Course.find({ ...activeCourseFilter() })
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .populate('instructor', 'name')
            .select('title isPublished createdAt instructorName')
            .lean(),
        ContactMessage.find({ deletedAt: null })
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .lean(),
        Subscriber.find({})
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .lean(),
    ]);

    const rows = [];

    for (const e of enrollments) {
        if (e.student?.deletedAt || e.course?.deletedAt) continue;
        const courseTitle = e.course?.title || 'a course';
        const line = e.course?.title
            ? `enrolled in ${courseTitle}`
            : `created an enrollment${e.status ? ` (${e.status})` : ''}`;
        rows.push(
            activityFeedRow(e.student?.name || 'Student', line, e.enrollmentDate || e.createdAt, 'fas fa-user-graduate')
        );
    }

    for (const p of payments) {
        const who = p.user?.name || p.studentName || p.email || 'Customer';
        const courseTitle = p.course?.title || p.courseName || 'a course';
        let line;
        if (p.status === 'paid' || p.status === 'completed') line = `paid for ${courseTitle}`;
        else if (p.status === 'failed') line = `payment failed for ${courseTitle}`;
        else if (p.status === 'refunded') line = `refund recorded for ${courseTitle}`;
        else line = `payment ${p.status || 'updated'} for ${courseTitle}`;
        rows.push(activityFeedRow(who, line, p.createdAt, 'fas fa-file-invoice-dollar'));
    }

    for (const u of portalUsers) {
        const roleLabel =
            u.role === 'student' ? 'student' : u.role === 'teacher' ? 'teacher' : 'parent';
        rows.push(
            activityFeedRow(u.name || 'User', `joined as a new ${roleLabel}`, u.createdAt, 'fas fa-user-plus')
        );
    }

    for (const c of courses) {
        const actor = c.instructor?.name || c.instructorName || 'Staff';
        const pub = c.isPublished ? 'published course' : 'added draft course';
        rows.push(
            activityFeedRow(actor, `${pub} "${truncateText(c.title, 80)}"`, c.createdAt, 'fas fa-book')
        );
    }

    for (const m of contacts) {
        const subj = m.subject ? truncateText(m.subject, 56) : 'General inquiry';
        rows.push(
            activityFeedRow(
                m.name || 'Visitor',
                `submitted contact message: ${subj}`,
                m.createdAt,
                'fas fa-envelope'
            )
        );
    }

    for (const s of subscribers) {
        rows.push(
            activityFeedRow(s.email || 'Subscriber', 'subscribed to the newsletter', s.createdAt, 'fas fa-bell')
        );
    }

    rows.sort((a, b) => b._ts - a._ts);

    return rows.slice(0, ACTIVITY_FEED_MAX).map(({ _ts, ...rest }) => rest);
}

// Helper function to format time ago
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'Just now';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    return new Date(date).toLocaleDateString();
}

// Test endpoint
router.get('/test', (req, res) => {
    res.json({ 
        message: 'Admin API is working!',
        timestamp: new Date().toISOString()
    });
});

// Performance metrics endpoint
router.get('/metrics', async (req, res) => {
    try {
        const User = require('../models/User');
        const Enrollment = require('../models/Enrollment');
        const Payment = require('../models/Payment');
        
        // 1. Enrollment Rate
        const studentFilter = { role: 'student', ...activeUserFilter() };
        const totalStudents = await User.countDocuments(studentFilter);
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const newStudents = await User.countDocuments({
            ...studentFilter,
            createdAt: { $gte: lastMonth },
        });
        const enrollmentRate = totalStudents > 0 ? 
            ((newStudents / totalStudents) * 100).toFixed(1) + '%' : '0%';
        
        // 2. Course Completion Rate
        const enrollmentBase = activeEnrollmentFilter();
        const completedEnrollments = await Enrollment.countDocuments({
            ...enrollmentBase,
            status: 'completed',
        });
        const totalEnrollments = await Enrollment.countDocuments(enrollmentBase);
        const completionRate = totalEnrollments > 0 ? 
            ((completedEnrollments / totalEnrollments) * 100).toFixed(1) + '%' : '0%';
        
        // 3. Revenue Growth (simplified - you need to implement ratings first)
        const satisfactionScore = '0.0'; // Implement ratings in Enrollment schema
        
        // 4. Revenue Growth
        const currentMonth = new Date();
        const prevMonth = new Date();
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        
        const paidMatch = {
            ...activePaymentFilter(),
            status: { $in: ['paid', 'completed'] },
        };
        const currentRevenue = await Payment.aggregate([
            {
                $match: {
                    ...paidMatch,
                    createdAt: {
                        $gte: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
                        $lt: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
                    },
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        const previousRevenue = await Payment.aggregate([
            {
                $match: {
                    ...paidMatch,
                    createdAt: {
                        $gte: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1),
                        $lt: new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 1),
                    },
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        
        const current = currentRevenue[0]?.total || 0;
        const previous = previousRevenue[0]?.total || 0;
        const revenueGrowth = previous > 0 ? 
            '+' + ((current - previous) / previous * 100).toFixed(0) + '%' : '+0%';
        
        res.json({
            success: true,
            metrics: {
                enrollmentRate,
                completionRate,
                satisfactionScore,
                revenueGrowth
            }
        });
        
    } catch (error) {
        req.log.error('Admin metrics error', { err: error });
        res.status(500).json({
            success: false,
            metrics: {
                enrollmentRate: '0%',
                completionRate: '0%',
                satisfactionScore: '0.0',
                revenueGrowth: '+0%'
            }
        });
    }
});

module.exports = router;