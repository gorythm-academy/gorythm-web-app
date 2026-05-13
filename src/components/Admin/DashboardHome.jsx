import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken, getAuthUserJson } from '../../utils/authStorage';
import { API_BASE_URL } from '../../config/constants';
import {
    ADMIN_SETTINGS_PAGE_ENABLED,
    persistAndNotifyAdminDashboardAccent,
    readAdminDashboardAccent,
    DEFAULT_ADMIN_DASHBOARD_ACCENT,
    ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT,
} from '../../utils/adminDashboardTheme';
import './DashboardHome.scss';

/** When set (ISO string), dashboard hides activities at or before this time until newer events arrive. */
const ADMIN_RECENT_ACTIVITIES_CLEARED_AT = 'adminDashboardRecentActivitiesClearedAt';

function filterActivitiesAfterClear(activities) {
    const list = Array.isArray(activities) ? activities : [];
    let raw;
    try {
        raw = localStorage.getItem(ADMIN_RECENT_ACTIVITIES_CLEARED_AT);
    } catch {
        return list;
    }
    if (!raw) return list;
    const clearedMs = new Date(raw).getTime();
    if (Number.isNaN(clearedMs)) return list;
    return list.filter((a) => {
        if (!a.at) return false;
        return new Date(a.at).getTime() > clearedMs;
    });
}

const DASHBOARD_ACCENT_PRESETS = [
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#10b981', label: 'Green' },
    { hex: '#f59e0b', label: 'Amber' },
    { hex: '#8b5cf6', label: 'Purple' },
    { hex: '#ef4444', label: 'Red' },
    { hex: '#06b6d4', label: 'Cyan' },
];

const DashboardHome = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalStudents: 0,
        totalTeachers: 0,
        totalParents: 0,
        totalCourses: 0,
        totalRevenue: 0,
        activeUsers: 0
    });
    const [recentActivities, setRecentActivities] = useState([]);
    const [upcomingClasses, setUpcomingClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [backendStatus, setBackendStatus] = useState('checking');
    const [dashboardAccent, setDashboardAccent] = useState(
        () => readAdminDashboardAccent() || DEFAULT_ADMIN_DASHBOARD_ACCENT
    );

    const user = JSON.parse(getAuthUserJson() || '{}');

    const checkBackendHealth = useCallback(async () => {
        try {
            await axios.get(`${API_BASE_URL}/health`);
            setBackendStatus('connected');
        } catch (err) {
            setBackendStatus('disconnected');
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

            const response = await axios.get(`${API_BASE_URL}/api/admin/dashboard`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
                setStats(response.data.stats);
                setRecentActivities(filterActivitiesAfterClear(response.data.recentActivities));
                setUpcomingClasses(Array.isArray(response.data.upcomingClasses) ? response.data.upcomingClasses : []);
                setLoading(false);
                return;
            } else {
                throw new Error(response.data.error || 'Failed to fetch dashboard data');
            }
            
        } catch (error) {
            // Set empty data on error
            setStats({
                totalStudents: 0,
                totalTeachers: 0,
                totalParents: 0,
                totalCourses: 0,
                totalRevenue: 0,
                activeUsers: 0
            });
            
            setRecentActivities([]);
            setUpcomingClasses([]);
            
            setError('Backend connection failed. No data available.');
            setLoading(false);
        }
    }, [backendStatus, navigate]);

    // Fetch dashboard data from backend
    useEffect(() => {
        fetchDashboardData();
        checkBackendHealth();
    }, [fetchDashboardData, checkBackendHealth]);

    useEffect(() => {
        const onAccent = (e) => {
            const h = e?.detail?.hex;
            if (h && /^#[0-9A-Fa-f]{6}$/.test(String(h).trim())) {
                setDashboardAccent(h.trim());
            }
        };
        window.addEventListener(ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT, onAccent);
        return () => window.removeEventListener(ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT, onAccent);
    }, []);

    const applyDashboardAccent = (hex) => {
        const normalized = /^#[0-9A-Fa-f]{6}$/.test(String(hex || '').trim())
            ? hex.trim()
            : DEFAULT_ADMIN_DASHBOARD_ACCENT;
        setDashboardAccent(normalized);
        persistAndNotifyAdminDashboardAccent(normalized);
    };

    const clearRecentActivities = () => {
        try {
            localStorage.setItem(ADMIN_RECENT_ACTIVITIES_CLEARED_AT, new Date().toISOString());
        } catch {
            /* ignore quota / private mode */
        }
        setRecentActivities([]);
    };

    const statsData = [
        { 
            title: 'Total Students', 
            value: loading ? '...' : stats.totalStudents.toLocaleString(), 
            icon: 'fas fa-users', 
            color: 'var(--color-accent)', 
            onClick: () => navigate('/admin/students-data')
        },
        { 
            title: 'Active Courses', 
            value: loading ? '...' : stats.totalCourses, 
            icon: 'fas fa-book', 
            color: '#10b981', 
            onClick: () => navigate('/admin/courses')
        },
        { 
            title: 'Total Revenue', 
            value: loading ? '...' : `$${stats.totalRevenue.toLocaleString()}`, 
            icon: 'fas fa-dollar-sign', 
            color: '#f59e0b', 
            onClick: () => navigate('/admin/payments')
        },
        { 
            title: 'Active Users', 
            value: loading ? '...' : stats.activeUsers, 
            icon: 'fas fa-user-check', 
            color: '#8b5cf6', 
            onClick: () => navigate('/admin/users')
        },
        {
            title: 'Teachers',
            value: loading ? '...' : stats.totalTeachers,
            icon: 'fas fa-chalkboard-teacher',
            color: '#06b6d4',
            onClick: () => navigate('/admin/people')
        },
        {
            title: 'Parents',
            value: loading ? '...' : stats.totalParents,
            icon: 'fas fa-people-roof',
            color: '#f97316',
            onClick: () => navigate('/admin/people')
        },
    ];

    const quickActions = [
        { icon: 'fas fa-plus-circle', label: 'Add Course', action: () => navigate('/admin/courses'), color: 'var(--color-accent)' },
        { icon: 'fas fa-user-plus', label: 'Add Student', action: () => navigate('/admin/students-data'), color: '#10b981' },
        { icon: 'fas fa-file-invoice-dollar', label: 'Create Invoice', action: () => navigate('/admin/payments'), color: '#f59e0b' },
        { icon: 'fas fa-chart-line', label: 'View Reports', action: () => navigate('/admin/analytics'), color: '#8b5cf6' },
        ...(ADMIN_SETTINGS_PAGE_ENABLED
            ? [{ icon: 'fas fa-cog', label: 'Settings', action: () => navigate('/admin/settings'), color: '#64748b' }]
            : []),
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

            <div className="dashboard-card dashboard-appearance-card">
                <div className="card-header">
                    <h3><i className="fas fa-palette"></i> Dashboard appearance</h3>
                </div>
                <div className="card-body">
                    <p className="dashboard-appearance-hint">
                        Primary accent for this admin area (sidebar highlights, buttons, links). Saved in this browser only.
                    </p>
                    <div className="dashboard-appearance-swatches" role="group" aria-label="Accent presets">
                        {DASHBOARD_ACCENT_PRESETS.map((p) => (
                            <button
                                key={p.hex}
                                type="button"
                                className={`dashboard-appearance-swatch ${
                                    dashboardAccent.toLowerCase() === p.hex.toLowerCase() ? 'active' : ''
                                }`}
                                style={{ backgroundColor: p.hex }}
                                title={p.label}
                                aria-label={`${p.label} accent`}
                                aria-pressed={dashboardAccent.toLowerCase() === p.hex.toLowerCase()}
                                onClick={() => applyDashboardAccent(p.hex)}
                            />
                        ))}
                    </div>
                    <div className="dashboard-appearance-custom">
                        <label htmlFor="admin-dashboard-accent-custom">Custom color</label>
                        <input
                            id="admin-dashboard-accent-custom"
                            type="color"
                            value={dashboardAccent}
                            onChange={(e) => applyDashboardAccent(e.target.value)}
                            aria-label="Pick a custom dashboard accent"
                        />
                    </div>
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
                    <div className="card-header card-header--activities">
                        <h3><i className="fas fa-history"></i> Recent Activities</h3>
                        <div className="card-header-actions">
                            <button
                                type="button"
                                className="clear-activities-btn"
                                onClick={clearRecentActivities}
                                title="Hide current items until new activity occurs"
                            >
                                <i className="fas fa-eraser" aria-hidden="true"></i>
                                Clear
                            </button>
                            <button type="button" className="view-all" onClick={() => navigate('/admin/analytics')}>
                                View All <i className="fas fa-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                    <div className="card-body card-body--activities">
                        {recentActivities.length === 0 ? (
                            <div className="activities-empty" role="status">
                                <i className="fas fa-inbox" aria-hidden="true"></i>
                                <p>No recent activities to show.</p>
                                <small>New enrollments, payments, and other events will appear here.</small>
                            </div>
                        ) : (
                            <ul className="activities-list">
                                {recentActivities.map((activity, index) => (
                                    <li
                                        key={activity.at ? `${activity.at}-${index}` : `${activity.time}-${index}-${activity.user}`}
                                        className="activity-item"
                                    >
                                        <div className="activity-icon">
                                            <i className={activity.icon || 'fas fa-stream'}></i>
                                        </div>
                                        <div className="activity-content">
                                            <p><strong>{activity.user}</strong> {activity.action}</p>
                                            <span className="activity-time">{activity.time}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
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
                    <button className="view-all" onClick={() => navigate('/admin/courses')}>
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
                                                onClick={() => navigate('/admin/courses')}
                                            >
                                                {cls.status === 'live' ? 'Join Now' : 'View'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {upcomingClasses.length === 0 && (
                                    <tr>
                                        <td colSpan="6">No upcoming classes available.</td>
                                    </tr>
                                )}
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