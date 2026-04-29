const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');

router.use(authMiddleware);
router.use(allowRoles('admin', 'super-admin'));

// Dashboard stats endpoint
router.get('/dashboard', async (req, res) => {
    try {
        req.log.info('Fetching dashboard stats');

        // Get real data from MongoDB
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalTeachers = await User.countDocuments({ role: 'teacher' });
        const totalParents = await User.countDocuments({ role: 'parent' });
        const totalCourses = await Course.countDocuments({ isPublished: true });
        
        // Calculate total revenue
        const payments = await Payment.find({ status: 'completed' });
        const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
        
        const activeUsers = await User.countDocuments({
            isActive: true,
            role: { $in: ['admin', 'super-admin', 'accountant'] }
        });

        // Get recent activities from payments
        const recentPayments = await Payment.find({ status: 'completed' })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name')
            .populate('course', 'title');

        // Format recent activities
        const recentActivities = recentPayments.map(payment => ({
            user: payment.user?.name || 'Student',
            action: `Enrolled in ${payment.course?.title || 'a course'}`,
            time: formatTimeAgo(payment.createdAt)
        }));

        res.json({
            success: true,
            stats: {
                totalStudents,
                totalTeachers,
                totalParents,
                totalCourses,
                totalRevenue,
                activeUsers
            },
            recentActivities
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
        const totalStudents = await User.countDocuments({ role: 'student' });
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const newStudents = await User.countDocuments({ 
            role: 'student', 
            createdAt: { $gte: lastMonth } 
        });
        const enrollmentRate = totalStudents > 0 ? 
            ((newStudents / totalStudents) * 100).toFixed(1) + '%' : '0%';
        
        // 2. Course Completion Rate
        const completedEnrollments = await Enrollment.countDocuments({ 
            status: 'completed' 
        });
        const totalEnrollments = await Enrollment.countDocuments();
        const completionRate = totalEnrollments > 0 ? 
            ((completedEnrollments / totalEnrollments) * 100).toFixed(1) + '%' : '0%';
        
        // 3. Revenue Growth (simplified - you need to implement ratings first)
        const satisfactionScore = '0.0'; // Implement ratings in Enrollment schema
        
        // 4. Revenue Growth
        const currentMonth = new Date();
        const prevMonth = new Date();
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        
        const currentRevenue = await Payment.aggregate([
            { $match: { 
                status: 'completed',
                createdAt: { 
                    $gte: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
                    $lt: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
                }
            }},
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        
        const previousRevenue = await Payment.aggregate([
            { $match: { 
                status: 'completed',
                createdAt: { 
                    $gte: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1),
                    $lt: new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 1)
                }
            }},
            { $group: { _id: null, total: { $sum: "$amount" } } }
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