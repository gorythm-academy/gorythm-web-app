import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import '../Admin.scss';

const formatPercent = (value, withSign = false) => {
    const numeric = Number(value) || 0;
    const fixed = numeric.toFixed(1).replace(/\.0$/, '');
    if (withSign) {
        return `${numeric >= 0 ? '+' : ''}${fixed}%`;
    }
    return `${fixed}%`;
};

const formatSignedValue = (value, suffix = '%') => {
    const numeric = Number(value) || 0;
    const fixed = numeric.toFixed(1).replace(/\.0$/, '');
    return `${numeric >= 0 ? '+' : ''}${fixed}${suffix}`;
};

const Analytics = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalStudents: 0,
        totalTeachers: 0,
        totalParents: 0,
        totalCourses: 0,
        totalRevenue: 0,
        activeUsers: 0,
        totalEnrollments: 0,
        completionRate: 0
    });
    const [recentEnrollments, setRecentEnrollments] = useState([]);
    const [courseStats, setCourseStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeFilter, setTimeFilter] = useState('30');
    const [insights, setInsights] = useState([]);
    const [cardTrends, setCardTrends] = useState({
        students: { value: '- 0 active', secondaryValue: '- 0 inactive', direction: 'neutral' },
        courses: { value: '- 0 published • 0 draft', secondaryValue: '- 0 with enrollments', direction: 'neutral' },
        revenue: { value: '+0%', direction: 'up' },
        activeUsers: { value: '- 0 active', secondaryValue: '- 0 inactive', direction: 'neutral' },
        teachers: { value: '- 0 active', secondaryValue: '- 0 inactive', direction: 'neutral' },
        parents: { value: '- 0 active', secondaryValue: '- 0 inactive', direction: 'neutral' }
    });

    const fetchPerformanceMetrics = useCallback(async () => {
        try {
            const token = getAuthToken();

            const response = await axios.get(`${API_BASE_URL}/api/analytics/metrics`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { days: timeFilter }
            });

            if (response.data.success) {
                return response.data.metrics;
            }
        } catch (error) {
            console.error('Error fetching metrics:', error);
        }

        return {
            enrollmentRate: '0%',
            completionRate: '0%',
            satisfactionScore: '0.0',
            revenueGrowth: '+0%',
            currentPeriodRevenue: 0,
            previousPeriodRevenue: 0,
            newStudentsInPeriod: 0
        };
    }, [timeFilter]);

    const fetchAnalyticsData = useCallback(async () => {
        let computedCoursesWithEnrollments = 0;
        try {
            setLoading(true);
            const token = getAuthToken();

            const headers = { Authorization: `Bearer ${token}` };
            const daysParams = { days: timeFilter };

            const [metrics, analyticsRes, enrollmentsRes, coursesRes, usersRes] = await Promise.all([
                fetchPerformanceMetrics(),
                axios.get(`${API_BASE_URL}/api/analytics/overview`, { headers, params: daysParams }),
                axios.get(`${API_BASE_URL}/api/enrollments`, { headers }),
                axios.get(`${API_BASE_URL}/api/courses`, { headers }),
                axios.get(`${API_BASE_URL}/api/users`, { headers }),
            ]);

            setPerformanceMetrics(metrics);

            if (analyticsRes.data.success && analyticsRes.data.data) {
                const summary = analyticsRes.data.data.summary || {};
                setStats({
                    totalStudents: summary.totalStudents || 0,
                    totalTeachers: summary.totalTeachers || 0,
                    totalParents: summary.totalParents || 0,
                    totalCourses: summary.totalCourses || 0,
                    totalRevenue: summary.totalRevenue || 0,
                    activeUsers: summary.activeUsers || 0,
                    totalEnrollments: summary.totalEnrollments || 0,
                    completionRate: Number(summary.completionRate) || 0
                });

                const days = Number(timeFilter) || 30;
                const totalEnrollments = summary.totalEnrollments || 0;
                const activeUsers = summary.activeUsers || 0;
                const completionRate = Number(summary.completionRate) || 0;
                const revenueGrowthNumeric = Number(String(metrics.revenueGrowth || '0').replace('%', '')) || 0;
                const publishedCourses = (analyticsRes.data.data.coursePopularity || []).filter(
                    (course) => Number(course.enrollmentCount) > 0
                ).length;
                computedCoursesWithEnrollments = publishedCourses;

                setCardTrends({
                    students: {
                        value: '- 0 active',
                        secondaryValue: '- 0 inactive',
                        direction: 'neutral'
                    },
                    courses: {
                        value: '- 0 published • 0 draft',
                        secondaryValue: `- ${publishedCourses} with enrollments`,
                        direction: 'neutral'
                    },
                    revenue: {
                        value: formatSignedValue(revenueGrowthNumeric),
                        direction: revenueGrowthNumeric >= 0 ? 'up' : 'down'
                    },
                    activeUsers: {
                        value: '- 0 active',
                        secondaryValue: '- 0 inactive',
                        direction: 'neutral'
                    },
                    teachers: {
                        value: '- 0 active',
                        secondaryValue: '- 0 inactive',
                        direction: 'neutral'
                    },
                    parents: {
                        value: '- 0 active',
                        secondaryValue: '- 0 inactive',
                        direction: 'neutral'
                    }
                });

                setInsights([
                    {
                        icon: 'fas fa-arrow-up insight-positive',
                        title: 'Student Growth',
                        text: `${metrics.enrollmentRate} of students joined in the last ${days} days (${metrics.newStudentsInPeriod || 0} new accounts in this period).`
                    },
                    {
                        icon: 'fas fa-dollar-sign insight-revenue',
                        title: 'Revenue Trend',
                        text: `Revenue trend is ${formatPercent(revenueGrowthNumeric, true)} with $${(metrics.currentPeriodRevenue || 0).toLocaleString()} in this period vs $${(metrics.previousPeriodRevenue || 0).toLocaleString()} in the previous period.`
                    },
                    {
                        icon: 'fas fa-book insight-courses',
                        title: 'Course Engagement',
                        text: `Course completion rate is ${formatPercent(completionRate)} across ${totalEnrollments.toLocaleString()} enrollments.`
                    },
                    {
                        icon: 'fas fa-user-check insight-active',
                        title: 'Active Users',
                        text: `${activeUsers.toLocaleString()} active users are currently in staff accounts.`
                    }
                ]);
            }

            if (enrollmentsRes.data?.success) {
                setRecentEnrollments((enrollmentsRes.data.enrollments || []).slice(0, 5));
            }

            if (coursesRes.data?.success) {
                const allCourses = Array.isArray(coursesRes.data.courses) ? coursesRes.data.courses : [];
                const publishedCount = allCourses.filter((course) => course?.status === 'published' || course?.isPublished === true).length;
                const draftCount = allCourses.filter((course) => course?.status === 'draft' || course?.isPublished === false).length;

                setCourseStats(allCourses.slice(0, 3));
                setCardTrends((prev) => ({
                    ...prev,
                    courses: {
                        value: `- ${publishedCount} published • ${draftCount} draft`,
                        secondaryValue: `- ${computedCoursesWithEnrollments} with enrollments`,
                        direction: 'neutral'
                    }
                }));
            }

            if (usersRes.data?.success) {
                const allUsers = Array.isArray(usersRes.data.users) ? usersRes.data.users : [];
                const isInactive = (u) => u?.isActive === false;

                const studentUsers = allUsers.filter((u) => u?.role === 'student');
                const teacherUsers = allUsers.filter((u) => u?.role === 'teacher');
                const parentUsers = allUsers.filter((u) => u?.role === 'parent');
                const staffUsers = allUsers.filter((u) => ['admin', 'super-admin', 'accountant'].includes(u?.role));

                const studentInactive = studentUsers.filter(isInactive).length;
                const teacherInactive = teacherUsers.filter(isInactive).length;
                const parentInactive = parentUsers.filter(isInactive).length;
                const staffInactive = staffUsers.filter(isInactive).length;

                const studentActive = Math.max(0, studentUsers.length - studentInactive);
                const teacherActive = Math.max(0, teacherUsers.length - teacherInactive);
                const parentActive = Math.max(0, parentUsers.length - parentInactive);
                const staffActive = Math.max(0, staffUsers.length - staffInactive);

                setCardTrends((prev) => ({
                    ...prev,
                    students: {
                        value: `- ${studentActive} active`,
                        secondaryValue: `- ${studentInactive} inactive`,
                        direction: 'neutral'
                    },
                    activeUsers: {
                        value: `- ${staffActive} active`,
                        secondaryValue: `- ${staffInactive} inactive`,
                        direction: 'neutral'
                    },
                    teachers: {
                        value: `- ${teacherActive} active`,
                        secondaryValue: `- ${teacherInactive} inactive`,
                        direction: 'neutral'
                    },
                    parents: {
                        value: `- ${parentActive} active`,
                        secondaryValue: `- ${parentInactive} inactive`,
                        direction: 'neutral'
                    }
                }));
            }

            setLoading(false);
        } catch (error) {
            console.error('Analytics fetch error:', error);
            setLoading(false);
        }
    }, [fetchPerformanceMetrics, timeFilter]);

    useEffect(() => {
        fetchAnalyticsData();
    }, [fetchAnalyticsData]);

    const [performanceMetrics, setPerformanceMetrics] = useState({
        enrollmentRate: '0%',
        completionRate: '0%',
        satisfactionScore: '0.0',
        revenueGrowth: '+0%',
        currentPeriodRevenue: 0,
        previousPeriodRevenue: 0,
        newStudentsInPeriod: 0
    });

    const summaryCards = [
    { 
        title: 'Total Students', 
        value: loading ? '...' : (stats?.totalStudents || 0).toLocaleString(),
        icon: 'fas fa-users', 
        color: 'var(--color-accent)', 
        change: cardTrends.students.value,
        secondaryValue: cardTrends.students.secondaryValue,
        direction: cardTrends.students.direction,
        link: '/admin/users'
    },
    { 
        title: 'Active Courses', 
        value: loading ? '...' : stats?.totalCourses || 0,
        icon: 'fas fa-book', 
        color: '#10b981', 
        change: cardTrends.courses.value,
        secondaryValue: cardTrends.courses.secondaryValue,
        direction: cardTrends.courses.direction,
        link: '/admin/courses'
    },
    { 
        title: 'Total Revenue', 
        value: loading ? '...' : `$${(stats?.totalRevenue || 0).toLocaleString()}`,
        icon: 'fas fa-dollar-sign', 
        color: '#f59e0b', 
        change: cardTrends.revenue.value,
        direction: cardTrends.revenue.direction,
        link: '/admin/payments'
    },
    { 
        title: 'Active Users', 
        value: loading ? '...' : stats?.activeUsers || 0,
        icon: 'fas fa-user-check', 
        color: '#8b5cf6', 
        change: cardTrends.activeUsers.value,
        secondaryValue: cardTrends.activeUsers.secondaryValue,
        direction: cardTrends.activeUsers.direction,
        link: '/admin/users'
    },
    {
        title: 'Teachers',
        value: loading ? '...' : stats?.totalTeachers || 0,
        icon: 'fas fa-chalkboard-teacher',
        color: '#06b6d4',
        change: cardTrends.teachers.value,
        secondaryValue: cardTrends.teachers.secondaryValue,
        direction: cardTrends.teachers.direction,
        link: '/admin/people'
    },
    {
        title: 'Parents',
        value: loading ? '...' : stats?.totalParents || 0,
        icon: 'fas fa-people-roof',
        color: '#f97316',
        change: cardTrends.parents.value,
        secondaryValue: cardTrends.parents.secondaryValue,
        direction: cardTrends.parents.direction,
        link: '/admin/people'
    },
];

    const performanceCards = [
        {
            title: 'Enrollment Rate',
            value: performanceMetrics.enrollmentRate,
            icon: 'fas fa-user-plus',
            color: '#06b6d4',
            description: 'New student signups'
        },
        {
            title: 'Course Completion',
            value: performanceMetrics.completionRate,
            icon: 'fas fa-trophy',
            color: '#10b981',
            description: 'Students completing courses'
        },
        {
            title: 'Student Satisfaction',
            value: performanceMetrics.satisfactionScore,
            icon: 'fas fa-star',
            color: '#f59e0b',
            description: 'Average rating'
        },
        {
            title: 'Revenue Growth',
            value: performanceMetrics.revenueGrowth,
            icon: 'fas fa-chart-line',
            color: '#ef4444',
            description: 'Monthly increase'
        }
    ];
    if (loading) {
        return (
            <div className="analytics-page loading">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="analytics-page">
            {/* Header */}
            <div className="analytics-header">
                <div>
                    <h1><i className="fas fa-chart-bar"></i> Analytics Dashboard</h1>
                    <p>Monitor academy performance and growth metrics</p>
                </div>
                <div className="date-filter">
                    <span>Last {timeFilter} Days</span>
                </div>
            </div>

<div className="time-filter-buttons">
    <button 
        className={timeFilter === '7' ? 'active' : ''}
        onClick={() => setTimeFilter('7')}
    >
        7 Days
    </button>
    <button 
        className={timeFilter === '30' ? 'active' : ''}
        onClick={() => setTimeFilter('30')}
    >
        30 Days
    </button>
    <button 
        className={timeFilter === '90' ? 'active' : ''}
        onClick={() => setTimeFilter('90')}
    >
        90 Days
    </button>
    <button 
        className={timeFilter === '365' ? 'active' : ''}
        onClick={() => setTimeFilter('365')}
    >
        1 Year
    </button>
</div>

            {/* Main Stats */}
            <div className="stats-grid">
                {summaryCards.map((card, index) => (
                    <div 
                        key={index} 
                        className="stat-card clickable"
                        onClick={() => navigate(card.link)}
                    >
                        <div className="stat-icon" style={{ background: card.color }}>
                            <i className={card.icon}></i>
                        </div>
                        <div className="stat-info">
                            <h3>{card.value}</h3>
                            <p>{card.title}</p>
                            <div className="trend-badge">
                                {card.direction !== 'neutral' ? (
                                    <i className={`fas ${card.direction === 'down' ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                                ) : null}
                                <span>
                                    {card.change}
                                    {card.secondaryValue ? <><br />{card.secondaryValue}</> : null}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Performance Metrics */}
            <div className="dashboard-card">
                <div className="card-header">
                    <h3><i className="fas fa-tachometer-alt"></i> Performance Metrics</h3>
                </div>
                <div className="card-body">
                    <div className="metrics-grid">
                        {performanceCards.map((metric, index) => (
                            <div key={index} className="metric-card">
                                <div className="metric-icon" style={{ color: metric.color }}>
                                    <i className={metric.icon}></i>
                                </div>
                                <div className="metric-content">
                                    <h4>{metric.value}</h4>
                                    <p>{metric.title}</p>
                                    <small>{metric.description}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="dashboard-grid">
                <div className="dashboard-card">
                    <div className="card-header">
                        <h3><i className="fas fa-history"></i> Latest student records</h3>
                        <button className="view-all" onClick={() => navigate('/admin/students-data')}>
                            View All
                        </button>
                    </div>
                    <div className="card-body">
                        {recentEnrollments.length > 0 ? (
                            <div className="activities-list">
                                {recentEnrollments.map((enrollment, index) => (
                                    <div key={index} className="activity-item">
                                        <div className="activity-icon">
                                            <i className="fas fa-user-graduate"></i>
                                        </div>
                                        <div className="activity-content">
                                            <p><strong>New record</strong></p>
                                            <span className="activity-time">
                                                {enrollment.course?.title || 'Unknown course'} • {enrollment.student?.name || 'Unknown student'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-user-graduate"></i>
                                <p>No recent student records</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Course Overview */}
                <div className="dashboard-card">
                    <div className="card-header">
                        <h3><i className="fas fa-book"></i> Course Overview</h3>
                        <button className="view-all" onClick={() => navigate('/admin/courses')}>
                            View All
                        </button>
                    </div>
                    <div className="card-body">
                        {courseStats.length > 0 ? (
                            <div className="courses-list">
                                {courseStats.map((course, index) => (
                                    <div key={index} className="course-item">
                                        <div className="course-icon">
                                            <i className="fas fa-book-open"></i>
                                        </div>
                                        <div className="course-content">
                                            <h4>{course.title}</h4>
                                            <div className="course-meta">
                                                <span>
                                                    <i className="fas fa-users"></i>
                                                    {Number(course.students) || 0} students
                                                </span>
                                                <span>
                                                    <i className="fas fa-dollar-sign"></i>
                                                    ${course.price || 0}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="course-status">
                                            <span className={`status-badge ${course.status === 'published' ? 'published' : 'draft'}`}>
                                                {course.status === 'published' ? 'Published' : 'Draft'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-book"></i>
                                <p>No courses available</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick Insights */}
            <div className="dashboard-card">
                <div className="card-header">
                    <h3><i className="fas fa-lightbulb"></i> Quick Insights</h3>
                </div>
                <div className="card-body">
                    <div className="insights-grid">
                        {insights.map((insight, index) => (
                            <div key={index} className="insight-card">
                                <i className={insight.icon}></i>
                                <div>
                                    <h4>{insight.title}</h4>
                                    <p>{insight.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;