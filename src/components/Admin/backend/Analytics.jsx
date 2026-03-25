import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../Admin.scss';

const Analytics = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalStudents: 0,
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
const fetchPerformanceMetrics = async () => {
    try {
        const token = localStorage.getItem('token');
        
        // Fetch metrics from a new backend endpoint
        const response = await axios.get('http://localhost:5000/api/analytics/metrics', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
            return response.data.metrics;
        }
    } catch (error) {
        console.error('Error fetching metrics:', error);
    }
    
    // Return zeros if backend fails
    return {
        enrollmentRate: '0%',
        completionRate: '0%',
        satisfactionScore: '0.0',
        revenueGrowth: '+0%'
    };
};
    useEffect(() => {
        fetchAnalyticsData();
    }, [timeFilter]);

    const fetchAnalyticsData = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
	    
	    // Fetch performance metrics
	    const metrics = await fetchPerformanceMetrics();
	    setPerformanceMetrics(metrics);            

            // Fetch dashboard stats from admin API
            const analyticsRes = await axios.get('http://localhost:5000/api/analytics/overview', {
                headers: { Authorization: `Bearer ${token}` },
		params: { days: timeFilter }
            });
        if (analyticsRes.data.success && analyticsRes.data.data) {
            setStats({
                totalStudents: analyticsRes.data.data.summary?.totalStudents || 0,
                totalCourses: analyticsRes.data.data.summary?.totalCourses || 0,
                totalRevenue: analyticsRes.data.data.summary?.totalRevenue || 0,
                activeUsers: analyticsRes.data.data.summary?.activeEnrollments || 0,
                totalEnrollments: analyticsRes.data.data.summary?.totalEnrollments || 0,
                completionRate: analyticsRes.data.data.summary?.completionRate || 0
            });
        }
           
 
            if (analyticsRes.data.success) {
                setStats(analyticsRes.data.stats);
            }

            // Fetch recent enrollments from enrollments API
            const enrollmentsRes = await axios.get('http://localhost:5000/api/enrollments', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (enrollmentsRes.data) {
                setRecentEnrollments(enrollmentsRes.data.slice(0, 5));
            }

            // Fetch courses for stats
            const coursesRes = await axios.get('http://localhost:5000/api/courses', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (coursesRes.data) {
                setCourseStats(coursesRes.data.slice(0, 3));
            }

            setLoading(false);
        } catch (error) {
            console.error('Analytics fetch error:', error);
            setLoading(false);
        }
    };

const [performanceMetrics, setPerformanceMetrics] = useState({
    enrollmentRate: '0%',
    completionRate: '0%',
    satisfactionScore: '0.0',
    revenueGrowth: '+0%'
});
const summaryCards = [
    { 
        title: 'Total Students', 
        value: loading ? '...' : (stats?.totalStudents || 0).toLocaleString(),  // ADD ?. and loading check
        icon: 'fas fa-users', 
        color: 'var(--color-accent)', 
        change: '+0%',
        link: '/admin/users'
    },
    { 
        title: 'Active Courses', 
        value: loading ? '...' : stats?.totalCourses || 0,  // ADD ?.
        icon: 'fas fa-book', 
        color: '#10b981', 
        change: '+0',
        link: '/admin/courses'
    },
    { 
        title: 'Total Revenue', 
        value: loading ? '...' : `$${(stats?.totalRevenue || 0).toLocaleString()}`,  // ADD ?.
        icon: 'fas fa-dollar-sign', 
        color: '#f59e0b', 
        change: '+0%',
        link: '/admin/payments'
    },
    { 
        title: 'Active Users', 
        value: loading ? '...' : stats?.activeUsers || 0,  // ADD ?.
        icon: 'fas fa-user-check', 
        color: '#8b5cf6', 
        change: '+0%',
        link: '/admin/users'
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
                    <span>Last 30 Days</span>
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
                                <i className="fas fa-arrow-up"></i>
                                {card.change}
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
                        <h3><i className="fas fa-history"></i> Recent Enrollments</h3>
                        <button className="view-all" onClick={() => navigate('/admin/enrollments')}>
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
                                            <p><strong>New Enrollment</strong></p>
                                            <span className="activity-time">
                                                Course #{enrollment.course} • Student #{enrollment.student}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <i className="fas fa-user-graduate"></i>
                                <p>No recent enrollments</p>
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
                                                    {course.students?.length || 0} students
                                                </span>
                                                <span>
                                                    <i className="fas fa-dollar-sign"></i>
                                                    ${course.price || 0}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="course-status">
                                            <span className={`status-badge ${course.isPublished ? 'published' : 'draft'}`}>
                                                {course.isPublished ? 'Published' : 'Draft'}
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
                        <div className="insight-card">
                            <i className="fas fa-arrow-up insight-positive"></i>
                            <div>
                                <h4>Student Growth</h4>
                                <p>12% increase in new student registrations this month.</p>
                            </div>
                        </div>
                        <div className="insight-card">
                            <i className="fas fa-dollar-sign insight-revenue"></i>
                            <div>
                                <h4>Revenue Trend</h4>
                                <p>Monthly revenue increased by 8% compared to last month.</p>
                            </div>
                        </div>
                        <div className="insight-card">
                            <i className="fas fa-book insight-courses"></i>
                            <div>
                                <h4>Course Engagement</h4>
                                <p>Average course completion rate is 42%. Focus on improving retention.</p>
                            </div>
                        </div>
                        <div className="insight-card">
                            <i className="fas fa-user-check insight-active"></i>
                            <div>
                                <h4>Active Users</h4>
                                <p>89 active users currently engaged with course materials.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Analytics;