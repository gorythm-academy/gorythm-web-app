const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const ContactMessage = require('../models/ContactMessage');
const Subscriber = require('../models/Subscriber');
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

        const recentActivities = await buildCrossTabRecentActivities();

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

const ACTIVITY_PER_SOURCE = 45;
const ACTIVITY_FEED_MAX = 200;

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
        Enrollment.find({})
            .sort({ enrollmentDate: -1, createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .populate('student', 'name')
            .populate('course', 'title')
            .lean(),
        Payment.find({})
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .populate('user', 'name')
            .populate('course', 'title')
            .lean(),
        User.find({ role: { $in: ['student', 'teacher', 'parent'] } })
            .sort({ createdAt: -1 })
            .limit(ACTIVITY_PER_SOURCE)
            .select('name role createdAt')
            .lean(),
        Course.find({})
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
        if (p.status === 'completed') line = `completed payment for ${courseTitle}`;
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