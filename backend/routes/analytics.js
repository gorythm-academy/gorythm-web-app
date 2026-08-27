const express = require('express');
const { createShortTtlCache } = require('../utils/shortTtlCache');

const analyticsOverviewCache = createShortTtlCache(120_000);
const analyticsMetricsCache = createShortTtlCache(120_000);
const router = express.Router();
const User = require('../models/User');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const { activeUserFilter } = require('../utils/userQuery');

const PAID_PAYMENT_STATUSES = ['paid', 'completed'];
const STAFF_ROLES = ['manager', 'super-admin', 'accountant'];

const getPeriodBounds = (days) => {
    const now = new Date();
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - days);
    return { now, periodStart };
};

const getChartGroupFormat = (days) => {
    if (days <= 31) return '%Y-%m-%d';
    if (days <= 90) return '%G-%V';
    return '%Y-%m';
};

const getChartGrouping = (days) => {
    if (days <= 31) return 'daily';
    if (days <= 90) return 'weekly';
    return 'monthly';
};

const periodDateRange = (periodStart, now) => ({ $gte: periodStart, $lt: now });

const periodEnrollmentActivityMatch = (periodStart, now) => ({
    ...activeEnrollmentFilter(),
    $or: [
        { enrollmentDate: periodDateRange(periodStart, now) },
        { completionDate: periodDateRange(periodStart, now) },
        { lastAccessed: periodDateRange(periodStart, now) },
    ],
});

const completedInPeriodMatch = (periodStart, now) => ({
    status: 'completed',
    ...activeEnrollmentFilter(),
    $or: [
        { completionDate: periodDateRange(periodStart, now) },
        {
            $and: [
                {
                    $or: [
                        { completionDate: null },
                        { completionDate: { $exists: false } },
                    ],
                },
                { enrollmentDate: periodDateRange(periodStart, now) },
            ],
        },
    ],
});

const buildRoleActivity = (rows = []) => {
    const activity = {
        students: { active: 0, inactive: 0 },
        teachers: { active: 0, inactive: 0 },
        parents: { active: 0, inactive: 0 },
        staff: { active: 0, inactive: 0 },
    };

    rows.forEach((row) => {
        const role = row._id?.role;
        const status = row._id?.isActive === false ? 'inactive' : 'active';
        const count = row.count || 0;

        if (role === 'student') {
            activity.students[status] += count;
        } else if (role === 'teacher') {
            activity.teachers[status] += count;
        } else if (role === 'parent') {
            activity.parents[status] += count;
        } else if (STAFF_ROLES.includes(role)) {
            activity.staff[status] += count;
        }
    });

    return activity;
};

const periodEnrollmentLookupStages = (periodStart, now) => ([
    {
        $match: {
            $expr: { $eq: ['$course', '$$courseId'] },
            enrollmentDate: periodDateRange(periodStart, now),
            ...activeEnrollmentFilter(),
        },
    },
]);

router.use(authMiddleware);
router.use(validateSessionUser);
router.use(allowRoles('super-admin', 'manager'));

// Get comprehensive analytics data
router.get('/overview', async (req, res) => {
    try {
        const days = Math.max(1, parseInt(req.query.days, 10) || 30);
        const cacheKey = String(days);
        const cached = analyticsOverviewCache.get();
        if (cached && cached.key === cacheKey) {
            return res.json(cached.payload);
        }

        req.log.info('Fetching analytics overview');
        const { now, periodStart } = getPeriodBounds(days);
        const chartGroupFormat = getChartGroupFormat(days);
        const chartGrouping = getChartGrouping(days);

        const enrollmentTrend = await Enrollment.aggregate([
            {
                $match: {
                    enrollmentDate: periodDateRange(periodStart, now),
                    ...activeEnrollmentFilter(),
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: chartGroupFormat,
                            date: '$enrollmentDate',
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    date: '$_id',
                    enrollments: '$count',
                    _id: 0,
                },
            },
        ]);

        const revenueData = await Payment.aggregate([
            {
                $match: {
                    status: { $in: PAID_PAYMENT_STATUSES },
                    createdAt: periodDateRange(periodStart, now),
                    ...activePaymentFilter(),
                },
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: chartGroupFormat,
                            date: '$createdAt',
                        },
                    },
                    totalRevenue: { $sum: '$amount' },
                    transactionCount: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    date: '$_id',
                    totalRevenue: 1,
                    transactionCount: 1,
                    _id: 0,
                },
            },
        ]);

        const coursePopularity = await Course.aggregate([
            { $match: { ...activeCourseFilter() } },
            {
                $lookup: {
                    from: 'enrollments',
                    let: { courseId: '$_id' },
                    pipeline: periodEnrollmentLookupStages(periodStart, now),
                    as: 'enrollments',
                },
            },
            {
                $project: {
                    title: 1,
                    category: 1,
                    price: 1,
                    isPublished: 1,
                    enrollmentCount: { $size: '$enrollments' },
                    revenue: {
                        $multiply: [{ $size: '$enrollments' }, '$price'],
                    },
                },
            },
            { $match: { enrollmentCount: { $gt: 0 } } },
            { $sort: { enrollmentCount: -1 } },
            { $limit: 10 },
        ]);

        const categoryDistribution = await Course.aggregate([
            { $match: { ...activeCourseFilter() } },
            {
                $lookup: {
                    from: 'enrollments',
                    let: { courseId: '$_id' },
                    pipeline: periodEnrollmentLookupStages(periodStart, now),
                    as: 'enrollments',
                },
            },
            {
                $group: {
                    _id: '$category',
                    courseCount: { $sum: 1 },
                    enrollmentCount: { $sum: { $size: '$enrollments' } },
                },
            },
            { $match: { enrollmentCount: { $gt: 0 } } },
            { $sort: { enrollmentCount: -1 } },
        ]);

        const periodEnrollments = await Enrollment.countDocuments({
            enrollmentDate: periodDateRange(periodStart, now),
            ...activeEnrollmentFilter(),
        });
        const completedEnrollments = await Enrollment.countDocuments(
            completedInPeriodMatch(periodStart, now)
        );
        const completionDenominator = await Enrollment.countDocuments(
            periodEnrollmentActivityMatch(periodStart, now)
        );
        const completionRate = completionDenominator > 0
            ? ((completedEnrollments / completionDenominator) * 100).toFixed(1)
            : '0';

        const roleActivityRows = await User.aggregate([
            { $match: { ...activeUserFilter() } },
            {
                $group: {
                    _id: { role: '$role', isActive: '$isActive' },
                    count: { $sum: 1 },
                },
            },
        ]);
        const roleActivity = buildRoleActivity(roleActivityRows);

        const [
            totalStudents,
            totalTeachers,
            totalParents,
            newStudentsInPeriod,
            newTeachersInPeriod,
            newParentsInPeriod,
            publishedCourses,
            draftCourses,
            activeUsers,
            activeEnrollmentCount,
            inactiveEnrollmentCount,
            coursesWithEnrollmentsResult,
            recentEnrollments,
        ] = await Promise.all([
            User.countDocuments({ role: 'student', ...activeUserFilter() }),
            User.countDocuments({ role: 'teacher', ...activeUserFilter() }),
            User.countDocuments({ role: 'parent', ...activeUserFilter() }),
            User.countDocuments({
                role: 'student',
                createdAt: periodDateRange(periodStart, now),
                ...activeUserFilter(),
            }),
            User.countDocuments({
                role: 'teacher',
                createdAt: periodDateRange(periodStart, now),
                ...activeUserFilter(),
            }),
            User.countDocuments({
                role: 'parent',
                createdAt: periodDateRange(periodStart, now),
                ...activeUserFilter(),
            }),
            Course.countDocuments({ isPublished: true, ...activeCourseFilter() }),
            Course.countDocuments({ isPublished: false, ...activeCourseFilter() }),
            User.countDocuments({
                isActive: { $ne: false },
                role: { $in: STAFF_ROLES },
                ...activeUserFilter(),
            }),
            Enrollment.countDocuments({
                status: 'active',
                enrollmentDate: periodDateRange(periodStart, now),
                ...activeEnrollmentFilter(),
            }),
            Enrollment.countDocuments({
                status: { $in: ['inactive', null] },
                enrollmentDate: periodDateRange(periodStart, now),
                ...activeEnrollmentFilter(),
            }),
            Enrollment.aggregate([
                {
                    $match: {
                        course: { $ne: null },
                        enrollmentDate: periodDateRange(periodStart, now),
                        ...activeEnrollmentFilter(),
                    },
                },
                { $group: { _id: '$course' } },
                { $count: 'total' },
            ]),
            Enrollment.find({
                enrollmentDate: periodDateRange(periodStart, now),
                ...activeEnrollmentFilter(),
            })
                .populate('student', 'name')
                .populate('course', 'title')
                .sort({ enrollmentDate: -1 })
                .limit(5)
                .lean(),
        ]);

        const coursesWithEnrollments = coursesWithEnrollmentsResult[0]?.total || 0;
        const periodRevenue = revenueData.reduce((sum, item) => sum + (item.totalRevenue || 0), 0);
        const topCourses = coursePopularity.slice(0, 3).map((course) => ({
            _id: String(course._id),
            title: course.title,
            price: course.price || 0,
            students: course.enrollmentCount || 0,
            status: course.isPublished ? 'published' : 'draft',
        }));

        const payload = {
            success: true,
            timeframe: `${days} days`,
            chartGrouping,
            data: {
                enrollmentTrend,
                revenueData,
                coursePopularity,
                categoryDistribution,
                recentEnrollments,
                topCourses,
                completionRates: [
                    { status: 'completed', count: completedEnrollments, percentage: completionRate },
                    {
                        status: 'active',
                        count: activeEnrollmentCount,
                        percentage:
                            periodEnrollments > 0
                                ? ((activeEnrollmentCount / periodEnrollments) * 100).toFixed(1)
                                : '0',
                    },
                    {
                        status: 'inactive',
                        count: inactiveEnrollmentCount,
                        percentage:
                            periodEnrollments > 0
                                ? ((inactiveEnrollmentCount / periodEnrollments) * 100).toFixed(1)
                                : '0',
                    },
                ],
                roleActivity,
                summary: {
                    totalStudents,
                    totalTeachers,
                    totalParents,
                    newStudentsInPeriod,
                    newTeachersInPeriod,
                    newParentsInPeriod,
                    publishedCourses,
                    draftCourses,
                    coursesWithEnrollments,
                    totalCourses: publishedCourses,
                    totalEnrollments: periodEnrollments,
                    completionDenominator,
                    periodRevenue,
                    activeUsers,
                    activeEnrollments: activeEnrollmentCount,
                    completionRate,
                    roleActivity,
                },
            },
        };
        analyticsOverviewCache.set({ key: cacheKey, payload });
        res.json(payload);
    } catch (error) {
        req.log.error('Analytics overview error', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics data',
        });
    }
});

// Get student progress analytics
router.get('/student-progress', async (req, res) => {
    try {
        const studentProgress = await Enrollment.aggregate([
            { $match: { ...activeEnrollmentFilter() } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'student',
                    foreignField: '_id',
                    as: 'studentInfo',
                },
            },
            {
                $lookup: {
                    from: 'courses',
                    localField: 'course',
                    foreignField: '_id',
                    as: 'courseInfo',
                },
            },
            { $unwind: '$studentInfo' },
            { $unwind: '$courseInfo' },
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { 'studentInfo.deletedAt': null },
                                { 'studentInfo.deletedAt': { $exists: false } },
                            ],
                        },
                        {
                            $or: [
                                { 'courseInfo.deletedAt': null },
                                { 'courseInfo.deletedAt': { $exists: false } },
                            ],
                        },
                    ],
                },
            },
            {
                $project: {
                    studentName: '$studentInfo.name',
                    courseTitle: '$courseInfo.title',
                    progress: '$progress',
                    status: '$status',
                    enrollmentDate: 1,
                    lastAccessed: 1,
                },
            },
            { $sort: { progress: -1 } },
            { $limit: 20 },
        ]);

        res.json({
            success: true,
            data: studentProgress,
        });
    } catch (error) {
        req.log.error('Student progress analytics error', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch student progress',
            data: [],
        });
    }
});

// Get revenue analytics with filters
router.get('/revenue', async (req, res) => {
    try {
        const { period = 'monthly', start, end } = req.query;
        let groupFormat = '%Y-%m';

        if (period === 'daily') groupFormat = '%Y-%m-%d';
        if (period === 'weekly') groupFormat = '%Y-%U';
        if (period === 'yearly') groupFormat = '%Y';

        const matchStage = {
            status: { $in: PAID_PAYMENT_STATUSES },
            ...activePaymentFilter(),
        };

        if (start) matchStage.createdAt = { $gte: new Date(start) };
        if (end) {
            matchStage.createdAt = {
                ...matchStage.createdAt,
                $lte: new Date(end),
            };
        }

        const revenueAnalytics = await Payment.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: groupFormat,
                            date: '$createdAt',
                        },
                    },
                    revenue: { $sum: '$amount' },
                    transactions: { $sum: 1 },
                    averageValue: { $avg: '$amount' },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            success: true,
            period,
            data: revenueAnalytics,
        });
    } catch (error) {
        req.log.error('Revenue analytics error', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch revenue analytics',
            data: [],
        });
    }
});

// Performance metrics endpoint
router.get('/metrics', async (req, res) => {
    try {
        const days = Math.max(1, parseInt(req.query.days, 10) || 30);
        const cacheKey = String(days);
        const cached = analyticsMetricsCache.get();
        if (cached && cached.key === cacheKey) {
            return res.json(cached.payload);
        }

        req.log.info('Fetching performance metrics', { days });

        const { now, periodStart } = getPeriodBounds(days);
        const previousPeriodStart = new Date(periodStart);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - days);

        const totalStudents = await User.countDocuments({ role: 'student', ...activeUserFilter() });
        const newStudents = await User.countDocuments({
            role: 'student',
            createdAt: periodDateRange(periodStart, now),
            ...activeUserFilter(),
        });
        const enrollmentRate = totalStudents > 0
            ? `${((newStudents / totalStudents) * 100).toFixed(1)}%`
            : '0%';

        const completedEnrollments = await Enrollment.countDocuments(
            completedInPeriodMatch(periodStart, now)
        );
        const completionDenominator = await Enrollment.countDocuments(
            periodEnrollmentActivityMatch(periodStart, now)
        );
        const completionRate = completionDenominator > 0
            ? `${((completedEnrollments / completionDenominator) * 100).toFixed(1)}%`
            : '0%';

        const highProgressEnrollments = await Enrollment.countDocuments({
            progress: { $gte: 70 },
            ...activeEnrollmentFilter(),
            $or: [
                { enrollmentDate: periodDateRange(periodStart, now) },
                { lastAccessed: periodDateRange(periodStart, now) },
            ],
        });
        const highProgressRate = completionDenominator > 0
            ? `${((highProgressEnrollments / completionDenominator) * 100).toFixed(1)}%`
            : '0%';

        const currentRevenueResult = await Payment.aggregate([
            {
                $match: {
                    status: { $in: PAID_PAYMENT_STATUSES },
                    createdAt: periodDateRange(periodStart, now),
                    ...activePaymentFilter(),
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        const previousRevenueResult = await Payment.aggregate([
            {
                $match: {
                    status: { $in: PAID_PAYMENT_STATUSES },
                    createdAt: periodDateRange(previousPeriodStart, periodStart),
                    ...activePaymentFilter(),
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        const currentRevenue = currentRevenueResult[0]?.total || 0;
        const previousRevenue = previousRevenueResult[0]?.total || 0;

        let revenueGrowth;
        if (previousRevenue === 0 && currentRevenue === 0) {
            revenueGrowth = '+0%';
        } else if (previousRevenue === 0) {
            revenueGrowth = '+100%';
        } else {
            const growth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
            revenueGrowth = `${growth >= 0 ? '+' : ''}${growth.toFixed(0)}%`;
        }

        const payload = {
            success: true,
            timeframe: `${days} days`,
            metrics: {
                enrollmentRate,
                completionRate,
                highProgressRate,
                revenueGrowth,
                currentPeriodRevenue: currentRevenue,
                previousPeriodRevenue: previousRevenue,
                newStudentsInPeriod: newStudents,
            },
        };
        analyticsMetricsCache.set({ key: cacheKey, payload });
        res.json(payload);
    } catch (error) {
        req.log.error('Performance metrics error', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch performance metrics',
        });
    }
});

module.exports = router;
