import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken, getAuthUserJson } from '../../utils/authStorage';
import './DashboardHome.scss';

const DashboardHome = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalStudents: 0,
        totalCourses: 0,
        totalRevenue: 0,
        activeUsers: 0
    });
    const [recentActivities, setRecentActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [backendStatus, setBackendStatus] = useState('checking');

    const user = JSON.parse(getAuthUserJson() || '{}');

    const checkBackendHealth = useCallback(async () => {
        try {
            const response = await axios.get('http://localhost:5000/health');
            setBackendStatus('connected');
            console.log('✅ Backend health:', response.data);
        } catch (err) {
            setBackendStatus('disconnected');
            console.log('⚠️ Backend not responding');
        }
    }, []);

    const fetchDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            
            const token = getAuthToken();
            
            if (!token && backendStatus === 'connected') {
                navigate('/admin/login');
                return;
            }

            const response = await axios.get('http://localhost:5000/api/admin/dashboard', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
                setStats(response.data.stats);
                setRecentActivities(response.data.recentActivities);
                setLoading(false);
                return;
            } else {
                throw new Error(response.data.error || 'Failed to fetch dashboard data');
            }
            
        } catch (error) {
            console.error('❌ Error fetching dashboard:', error);
            
            // Set empty data on error
            setStats({
                totalStudents: 0,
                totalCourses: 0,
                totalRevenue: 0,
                activeUsers: 0
            });
            
            setRecentActivities([
                { user: 'System', action: 'No data available. Check backend connection.', time: 'Just now' }
            ]);
            
            setError('Backend connection failed. No data available.');
            setLoading(false);
        }
    }, [backendStatus, navigate]);

    // Fetch dashboard data from backend
    useEffect(() => {
        fetchDashboardData();
        checkBackendHealth();
    }, [fetchDashboardData, checkBackendHealth]);

    const statsData = [
        { 
            title: 'Total Students', 
            value: loading ? '...' : stats.totalStudents.toLocaleString(), 
            icon: 'fas fa-users', 
            color: 'var(--color-accent)', 
            change: '+0%',
            onClick: () => navigate('/admin/users')
        },
        { 
            title: 'Active Courses', 
            value: loading ? '...' : stats.totalCourses, 
            icon: 'fas fa-book', 
            color: '#10b981', 
            change: '+0',
            onClick: () => navigate('/admin/courses')
        },
        { 
            title: 'Total Revenue', 
            value: loading ? '...' : `$${stats.totalRevenue.toLocaleString()}`, 
            icon: 'fas fa-dollar-sign', 
            color: '#f59e0b', 
            change: '+0%',
            onClick: () => navigate('/admin/payments')
        },
        { 
            title: 'Active Users', 
            value: loading ? '...' : stats.activeUsers, 
            icon: 'fas fa-user-check', 
            color: '#8b5cf6', 
            change: '+0%',
            onClick: () => navigate('/admin/users')
        },
    ];

    const quickActions = [
        { icon: 'fas fa-plus-circle', label: 'Add Course', action: () => navigate('/admin/courses'), color: 'var(--color-accent)' },
        { icon: 'fas fa-user-plus', label: 'Add Student', action: () => navigate('/admin/enrollments'), color: '#10b981' },
        { icon: 'fas fa-file-invoice-dollar', label: 'Create Invoice', action: () => navigate('/admin/payments'), color: '#f59e0b' },
        { icon: 'fas fa-chart-line', label: 'View Reports', action: () => navigate('/admin/analytics'), color: '#8b5cf6' },
        { icon: 'fas fa-cog', label: 'Settings', action: () => navigate('/admin/settings'), color: '#64748b' },
        { icon: 'fas fa-question-circle', label: 'Help Center', action: () => window.open('#', '_blank'), color: 'var(--color-accent)' },
    ];

    const upcomingClasses = [
        { course: 'Quranic Arabic', instructor: 'Dr. Sarah Chen', date: 'Today, 2:00 PM', students: 0, status: 'scheduled' },
        { course: 'Tajweed Mastery', instructor: 'Ahmed Abdullah', date: 'Tomorrow, 10:00 AM', students: 0, status: 'scheduled' },
        { course: 'Islamic Studies', instructor: 'Fatima Rahman', date: 'Dec 15, 3:00 PM', students: 0, status: 'scheduled' },
        { course: 'STEM with Islamic Perspective', instructor: 'Dr. Omar Khan', date: 'Dec 17, 11:00 AM', students: 0, status: 'scheduled' },
    ];

    if (loading) {
        return (
            <div className="dashboard-home loading">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading dashboard data...</p>
                    <small>Connecting to backend server</small>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard-home">
            {/* Welcome Message with Status */}
            <div className="welcome-banner">
                <div className="welcome-content">
                    <h2>Welcome back, {user.name?.split(' ')[0] || 'Admin'}! 👋</h2>
                    <p>Here's what's happening with Gorythm Academy today</p>
                </div>
                <div className="status-indicator">
                    <div className={`status-badge ${backendStatus}`}>
                        <span className="status-dot"></span>
                        {backendStatus === 'connected' ? 'Backend Connected' : 'Backend Disconnected'}
                    </div>
                    <small>{backendStatus === 'connected' ? 'Real data from MongoDB' : 'No backend connection'}</small>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid">
                {statsData.map((stat, index) => (
                    <div 
                        key={index} 
                        className="stat-card"
                        onClick={stat.onClick}
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="stat-icon" style={{ background: stat.color }}>
                            <i className={stat.icon}></i>
                        </div>
                        <div className="stat-info">
                            <h3>{stat.value}</h3>
                            <p>{stat.title}</p>
                        </div>
                        <div className="stat-change" style={{ color: '#64748b' }}>
                            {stat.change}
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="info-message">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>{error}</p>
                </div>
            )}

            {/* Main Content Grid */}
            <div className="dashboard-grid">
                {/* Recent Activities */}
                <div className="dashboard-card">
                    <div className="card-header">
                        <h3><i className="fas fa-history"></i> Recent Activities</h3>
                        <button className="view-all" onClick={() => navigate('/admin/analytics')}>
                            View All <i className="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <div className="card-body">
                        <ul className="activities-list">
                            {recentActivities.map((activity, index) => (
                                <li key={index} className="activity-item">
                                    <div className="activity-icon">
                                        <i className="fas fa-user-circle"></i>
                                    </div>
                                    <div className="activity-content">
                                        <p><strong>{activity.user}</strong> {activity.action}</p>
                                        <span className="activity-time">{activity.time}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="dashboard-card">
                    <div className="card-header">
                        <h3><i className="fas fa-bolt"></i> Quick Actions</h3>
                    </div>
                    <div className="card-body">
                        <div className="actions-grid">
                            {quickActions.map((action, index) => (
                                <button 
                                    key={index} 
                                    className="action-btn"
                                    onClick={action.action}
                                    style={{ '--action-color': action.color }}
                                >
                                    <i className={action.icon}></i>
                                    <span>{action.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Upcoming Classes */}
            <div className="dashboard-card">
                <div className="card-header">
                    <h3><i className="fas fa-calendar-alt"></i> Upcoming Classes</h3>
                    <button className="view-all" onClick={() => alert('Calendar view coming soon!')}>
                        <i className="fas fa-calendar"></i> View Calendar
                    </button>
                </div>
                <div className="card-body">
                    <div className="events-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Course</th>
                                    <th>Instructor</th>
                                    <th>Date & Time</th>
                                    <th>Students</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upcomingClasses.map((cls, index) => (
                                    <tr key={index}>
                                        <td>
                                            <div className="course-name">
                                                <i className="fas fa-book-open"></i>
                                                {cls.course}
                                            </div>
                                        </td>
                                        <td>{cls.instructor}</td>
                                        <td>
                                            <div className="date-cell">
                                                <i className="far fa-clock"></i>
                                                {cls.date}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="student-count">
                                                <i className="fas fa-user-graduate"></i>
                                                {cls.students}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${cls.status}`}>
                                                {cls.status}
                                            </span>
                                        </td>
                                        <td>
                                            <button 
                                                className={`join-btn ${cls.status}`}
                                                onClick={() => alert(`${cls.status === 'live' ? 'Joining' : 'Scheduled:'} ${cls.course} class`)}
                                            >
                                                {cls.status === 'live' ? 'Join Now' : 'View'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* System Status */}
            <div className="system-status">
                <div className="status-card">
                    <i className="fas fa-database"></i>
                    <div>
                        <h4>Database</h4>
                        <p>{backendStatus === 'connected' ? 'MongoDB Connected' : 'Not Connected'}</p>
                    </div>
                </div>
                <div className="status-card">
                    <i className="fas fa-server"></i>
                    <div>
                        <h4>Backend API</h4>
                        <p>{backendStatus === 'connected' ? 'Running on port 5000' : 'Not Responding'}</p>
                    </div>
                </div>
                <div className="status-card">
                    <i className="fas fa-user-shield"></i>
                    <div>
                        <h4>Admin Role</h4>
                        <p>{user.role || 'Super Admin'}</p>
                    </div>
                </div>
                <div className="status-card">
                    <i className="fas fa-rocket"></i>
                    <div>
                        <h4>System Status</h4>
                        <p className={backendStatus === 'connected' ? 'status-good' : 'status-bad'}>
                            {backendStatus === 'connected' ? 'All Systems Operational' : 'Backend Issues'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;