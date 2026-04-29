const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');

// Get comprehensive analytics data
router.get('/overview', async (req, res) => {
    try {
        req.log.info('Fetching analytics overview');

        // Get timeframe (default: last 30 days)
        const days = parseInt(req.query.days) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // 1. Enrollment Trends (daily for last 30 days)
        const enrollmentTrend = await Enrollment.aggregate([
            {
                $match: {
                    enrollmentDate: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { 
                        $dateToString: { 
                            format: "%Y-%m-%d", 
                            date: "$enrollmentDate" 
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            },
            {
                $project: {
                    date: "$_id",
                    enrollments: "$count",
                    _id: 0
                }
            }
        ]);

        // 2. Revenue Analysis
        const revenueData = await Payment.aggregate([
            {
                $match: {
                    status: 'completed',
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" }
                    },
                    totalRevenue: { $sum: "$amount" },
                    transactionCount: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1 }
            }
        ]);

        // 3. Course Popularity
        const coursePopularity = await Course.aggregate([
            {
                $lookup: {
                    from: "enrollments",
                    localField: "_id",
                    foreignField: "course",
                    as: "enrollments"
                }
            },
            {
                $project: {
                    title: 1,
                    category: 1,
                    price: 1,
                    enrollmentCount: { $size: "$enrollments" },
                    revenue: { 
                        $multiply: [
                            { $size: "$enrollments" },
                            "$price"
                        ]
                    }
                }
            },
            {
                $sort: { enrollmentCount: -1 }
            },
            {
                $limit: 10
            }
        ]);

        // 4. Course Category Distribution
        const categoryDistribution = await Course.aggregate([
            {
                $lookup: {
                    from: "enrollments",
                    localField: "_id",
                    foreignField: "course",
                    as: "enrollments"
                }
            },
            {
                $group: {
                    _id: "$category",
                    courseCount: { $sum: 1 },
                    enrollmentCount: { $sum: { $size: "$enrollments" } }
                }
            },
            {
                $sort: { enrollmentCount: -1 }
            }
        ]);

        // 5. Completion Rates
        const completedEnrollments = await Enrollment.countDocuments({ status: 'completed' });
        const totalEnrollments = await Enrollment.countDocuments();
        const completionRate = totalEnrollments > 0 ? 
            ((completedEnrollments / totalEnrollments) * 100).toFixed(1) : "0";

        // 6. Active vs Inactive Users
        const userActivity = await User.aggregate([
            {
                $group: {
                    _id: "$isActive",
                    count: { $sum: 1 }
                }
            }
        ]);

        // 7. Payment Methods Distribution
        const paymentMethods = await Payment.aggregate([
            {
                $group: {
                    _id: "$paymentMethod",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" }
                }
            }
        ]);

        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalTeachers = await User.countDocuments({ role: 'teacher' });
        const totalParents = await User.countDocuments({ role: 'parent' });
        const activeUsers = await User.countDocuments({
            isActive: true,
            role: { $in: ['admin', 'super-admin', 'accountant'] }
        });

        res.json({
            success: true,
            timeframe: `${days} days`,
            data: {
                enrollmentTrend,
                revenueData,
                coursePopularity,
                categoryDistribution,
                completionRates: [
                    { status: 'completed', count: completedEnrollments, percentage: completionRate },
                    { status: 'active', count: await Enrollment.countDocuments({ status: 'active' }), percentage: ((await Enrollment.countDocuments({ status: 'active' }) / totalEnrollments) * 100).toFixed(1) || "0" },
                    { status: 'pending', count: await Enrollment.countDocuments({ status: 'pending' }), percentage: ((await Enrollment.countDocuments({ status: 'pending' }) / totalEnrollments) * 100).toFixed(1) || "0" }
                ],
                userActivity,
                paymentMethods,
                summary: {
                    totalStudents,
                    totalTeachers,
                    totalParents,
                    totalCourses: await Course.countDocuments(),
                    totalEnrollments: totalEnrollments,
                    totalRevenue: revenueData.reduce((sum, item) => sum + item.totalRevenue, 0),
                    activeUsers,
                    activeEnrollments: await Enrollment.countDocuments({ status: 'active' }),
                    completionRate: completionRate
                }
            }
        });

    } catch (error) {
        req.log.error('Analytics overview error', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics data'
        });
    }
});

// Get student progress analytics
router.get('/student-progress', async (req, res) => {
    try {
        const studentProgress = await Enrollment.aggregate([
            {
                $lookup: {
                    from: "users",
                    localField: "student",
                    foreignField: "_id",
                    as: "studentInfo"
                }
            },
            {
                $lookup: {
                    from: "courses",
                    localField: "course",
                    foreignField: "_id",
                    as: "courseInfo"
                }
            },
            {
                $unwind: "$studentInfo"
            },
            {
                $unwind: "$courseInfo"
            },
            {
                $project: {
                    studentName: "$studentInfo.name",
                    courseTitle: "$courseInfo.title",
                    progress: "$progress",
                    status: "$status",
                    enrollmentDate: 1,
                    lastAccessed: 1
                }
            },
            {
                $sort: { progress: -1 }
            },
            {
                $limit: 20
            }
        ]);

        res.json({
            success: true,
            data: studentProgress
        });
    } catch (error) {
        req.log.error('Student progress analytics error', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch student progress',
            data: []
        });
    }
});

// Get revenue analytics with filters
router.get('/revenue', async (req, res) => {
    try {
        const { period = 'monthly', start, end } = req.query;
        let groupFormat = "%Y-%m"; // Default monthly
        
        if (period === 'daily') groupFormat = "%Y-%m-%d";
        if (period === 'weekly') groupFormat = "%Y-%U";
        if (period === 'yearly') groupFormat = "%Y";
        
        const matchStage = { status: 'completed' };
        
        if (start) matchStage.createdAt = { $gte: new Date(start) };
        if (end) {
            matchStage.createdAt = {
                ...matchStage.createdAt,
                $lte: new Date(end)
            };
        }

        const revenueAnalytics = await Payment.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        $dateToString: { 
                            format: groupFormat, 
                            date: "$createdAt" 
                        }
                    },
                    revenue: { $sum: "$amount" },
                    transactions: { $sum: 1 },
                    averageValue: { $avg: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            period,
            data: revenueAnalytics
        });
    } catch (error) {
        req.log.error('Revenue analytics error', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch revenue analytics',
            data: []
        });
    }
});

// Performance metrics endpoint
router.get('/metrics', async (req, res) => {
    try {
        const days = Math.max(1, parseInt(req.query.days, 10) || 30);
        req.log.info('Fetching performance metrics', { days });

        const now = new Date();
        const periodStart = new Date(now);
        periodStart.setDate(periodStart.getDate() - days);
        const previousPeriodStart = new Date(periodStart);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - days);

        // 1. Enrollment Rate (new students in selected period vs total)
        const totalStudents = await User.countDocuments({ role: 'student' });
        const newStudents = await User.countDocuments({ 
            role: 'student', 
            createdAt: { $gte: periodStart, $lt: now } 
        });
        const enrollmentRate = totalStudents > 0 ? 
            ((newStudents / totalStudents) * 100).toFixed(1) + '%' : '0%';
        
        // 2. Course Completion Rate in selected period
        const completedEnrollments = await Enrollment.countDocuments({ 
            status: 'completed',
            enrollmentDate: { $gte: periodStart, $lt: now }
        });
        const totalEnrollments = await Enrollment.countDocuments({
            enrollmentDate: { $gte: periodStart, $lt: now }
        });
        const completionRate = totalEnrollments > 0 ? 
            ((completedEnrollments / totalEnrollments) * 100).toFixed(1) + '%' : '0%';
        
        // 3. Student Satisfaction proxy in selected period
        const highProgressEnrollments = await Enrollment.countDocuments({ 
            progress: { $gte: 70 },
            enrollmentDate: { $gte: periodStart, $lt: now }
        });
        const satisfactionScore = totalEnrollments > 0 ? 
            ((highProgressEnrollments / totalEnrollments) * 4.8).toFixed(1) : '0.0';
        
        // 4. Revenue Growth (selected period vs previous period)
        const currentRevenueResult = await Payment.aggregate([
            { $match: { 
                status: 'completed',
                createdAt: { $gte: periodStart, $lt: now }
            }},
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        
        // Previous period revenue
        const previousRevenueResult = await Payment.aggregate([
            { $match: { 
                status: 'completed',
                createdAt: { $gte: previousPeriodStart, $lt: periodStart }
            }},
            { $group: { _id: null, total: { $sum: "$amount" } } }
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
            revenueGrowth = (growth >= 0 ? '+' : '') + growth.toFixed(0) + '%';
        }
        
        res.json({
            success: true,
            timeframe: `${days} days`,
            metrics: {
                enrollmentRate,
                completionRate,
                satisfactionScore,
                revenueGrowth,
                currentPeriodRevenue: currentRevenue,
                previousPeriodRevenue: previousRevenue,
                newStudentsInPeriod: newStudents
            }
        });
        
    } catch (error) {
        req.log.error('Performance metrics error', { err: error });
        res.status(500).json({
            success: false,
            metrics: {
                enrollmentRate: '0%',
                completionRate: '0%',
                satisfactionScore: '0.0',
                revenueGrowth: '+0%',
                currentPeriodRevenue: 0,
                previousPeriodRevenue: 0,
                newStudentsInPeriod: 0
            }
        });
    }
});

module.exports = router;