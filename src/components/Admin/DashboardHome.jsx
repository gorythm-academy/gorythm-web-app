import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken, parseAuthUser, AUTH_REALM } from '../../utils/authStorage';
import { API_BASE_URL } from '../../config/constants';
import {
    persistAndNotifyAdminDashboardAccent,
    readAdminDashboardAccent,
    DEFAULT_ADMIN_DASHBOARD_ACCENT,
    ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT,
} from '../../utils/adminDashboardTheme';
import { getMeetingHref } from '../../utils/scheduleRoomOrLink';
import { refreshUpcomingClassStatuses } from '../../utils/scheduleTimezone';
import './DashboardHome.scss';

const ACTIVITY_PREVIEW_COUNT = 8;
const UPCOMING_CLASSES_POLL_MS = 60_000;
const LIVE_STATUS_TICK_MS = 15_000;

const ADMIN_ROLE_LABELS = {
    'super-admin': 'Super Admin',
    manager: 'Manager',
    accountant: 'Accountant',
};

function formatAdminRole(role) {
    if (ADMIN_ROLE_LABELS[role]) return ADMIN_ROLE_LABELS[role];
    if (!role) return 'Admin';
    return String(role).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getApiEndpointLabel() {
    if (!API_BASE_URL && process.env.NODE_ENV === 'development') {
        const devProxy = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        try {
            const proxyUrl = new URL(devProxy);
            return proxyUrl.port ? `Proxied to port ${proxyUrl.port}` : `Proxied to ${proxyUrl.host}`;
        } catch {
            return 'Proxied to local API';
        }
    }

    try {
        const url = new URL(API_BASE_URL);
        if (url.port) return `Running on port ${url.port}`;
        return url.hostname || 'API connected';
    } catch {
        return 'API connected';
    }
}

function getDashboardErrorMessage(error) {
    const status = error.response?.status;
    const serverMsg = error.response?.data?.error || error.response?.data?.message;
    if (status === 403) return serverMsg || 'You do not have permission to view the dashboard.';
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status >= 500) return serverMsg || 'Server error while loading dashboard data.';
    if (!error.response || error.code === 'ERR_NETWORK') {
        return 'Network error. Check your connection and try again.';
    }
    return serverMsg || error.message || 'Failed to load dashboard data.';
}

function deriveOverallStatus(api, db) {
    if (api === 'checking' || db === 'checking') return 'checking';
    if (api === 'ok' && db === 'ok') return 'connected';
    if (api === 'ok') return 'degraded';
    return 'disconnected';
}

function backendStatusLabel(status) {
    if (status === 'connected') return 'Backend Connected';
    if (status === 'degraded') return 'API Connected';
    if (status === 'checking') return 'Checking connection…';
    return 'Backend Disconnected';
}

function backendStatusDetail(status) {
    if (status === 'connected') return 'Real data from MongoDB';
    if (status === 'degraded') return 'API is up but database health check failed';
    if (status === 'checking') return 'Verifying API and database';
    return 'No backend connection';
}

function databaseStatusLabel(db) {
    if (db === 'checking') return 'Checking…';
    if (db === 'ok') return 'MongoDB Connected';
    return 'Not Connected';
}

function systemStatusLabel(overall) {
    if (overall === 'connected') return 'All Systems Operational';
    if (overall === 'checking') return 'Verifying…';
    if (overall === 'degraded') return 'Database issue detected';
    return 'Backend Issues';
}

const DASHBOARD_ACCENT_PRESETS = [
    { hex: '#ef4444', label: 'Red' },
    { hex: '#3b82f6', label: 'Blue' },
    { hex: '#10b981', label: 'Green' },
    { hex: '#f59e0b', label: 'Amber' },
    { hex: '#8b5cf6', label: 'Purple' },
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
        activeStaff: 0,
    });
    const [allActivities, setAllActivities] = useState([]);
    const [activitiesExpanded, setActivitiesExpanded] = useState(false);
    const [upcomingClasses, setUpcomingClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [connection, setConnection] = useState({ api: 'checking', db: 'checking' });
    const overallStatus = deriveOverallStatus(connection.api, connection.db);
    const [dashboardAccent, setDashboardAccent] = useState(
        () => readAdminDashboardAccent() || DEFAULT_ADMIN_DASHBOARD_ACCENT
    );

    const user = parseAuthUser(AUTH_REALM.ADMIN) || {};

    const checkBackendHealth = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/health`);
            const dbOk = res.data?.database === 'connected' && res.status === 200;
            setConnection((c) => {
                if (c.api === 'ok') return c;
                return { ...c, db: dbOk ? 'ok' : 'fail' };
            });
        } catch {
            setConnection((c) => (c.api === 'ok' ? c : { ...c, db: 'fail' }));
        }
    }, []);

    const fetchUpcomingClasses = useCallback(async () => {
        const token = getAuthToken(AUTH_REALM.ADMIN);
        if (!token) return;
        try {
            const response = await axios.get(`${API_BASE_URL}/api/admin/dashboard/upcoming-classes`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.data?.success) {
                setUpcomingClasses(
                    refreshUpcomingClassStatuses(
                        Array.isArray(response.data.upcomingClasses) ? response.data.upcomingClasses : []
                    )
                );
            }
        } catch {
            /* silent refresh — full dashboard retry covers hard failures */
        }
    }, []);

    const fetchDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            
            const token = getAuthToken(AUTH_REALM.ADMIN);
            
            if (!token) {
                setLoading(false);
                navigate('/admin/login', { replace: true });
                return;
            }

            const headers = { Authorization: `Bearer ${token}` };
            const statsRes = await axios.get(`${API_BASE_URL}/api/admin/dashboard/stats`, { headers });

            if (statsRes.data?.success) {
                const nextStats = statsRes.data.stats || {};
                setStats({
                    totalStudents: nextStats.totalStudents ?? 0,
                    totalTeachers: nextStats.totalTeachers ?? 0,
                    totalParents: nextStats.totalParents ?? 0,
                    totalCourses: nextStats.totalCourses ?? 0,
                    totalRevenue: nextStats.totalRevenue ?? 0,
                    activeStaff: nextStats.activeStaff ?? nextStats.activeUsers ?? 0,
                });
                setConnection({ api: 'ok', db: 'ok' });
                setLoading(false);
            } else {
                throw new Error(statsRes.data?.error || 'Failed to fetch dashboard stats');
            }

            const [activitiesRes, upcomingRes] = await Promise.allSettled([
                axios.get(`${API_BASE_URL}/api/admin/dashboard/activities`, { headers }),
                axios.get(`${API_BASE_URL}/api/admin/dashboard/upcoming-classes`, { headers }),
            ]);

            if (activitiesRes.status === 'fulfilled' && activitiesRes.value.data?.success) {
                setAllActivities(
                    Array.isArray(activitiesRes.value.data.recentActivities)
                        ? activitiesRes.value.data.recentActivities
                        : []
                );
                setActivitiesExpanded(false);
            } else {
                setAllActivities([]);
            }

            if (upcomingRes.status === 'fulfilled' && upcomingRes.value.data?.success) {
                setUpcomingClasses(
                    refreshUpcomingClassStatuses(
                        Array.isArray(upcomingRes.value.data.upcomingClasses)
                            ? upcomingRes.value.data.upcomingClasses
                            : []
                    )
                );
            } else {
                setUpcomingClasses([]);
            }
            return;
            
        } catch (error) {
            if (error.response?.status === 401) {
                setLoading(false);
                navigate('/admin/login', { replace: true });
                return;
            }
            setConnection((c) => ({ ...c, api: 'fail' }));
            setStats({
                totalStudents: 0,
                totalTeachers: 0,
                totalParents: 0,
                totalCourses: 0,
                totalRevenue: 0,
                activeStaff: 0,
            });
            
            setAllActivities([]);
            setActivitiesExpanded(false);
            setUpcomingClasses([]);
            
            setError(getDashboardErrorMessage(error));
            setLoading(false);
        }
    }, [navigate]);

    // Fetch dashboard data from backend
    useEffect(() => {
        fetchDashboardData();
        checkBackendHealth();
    }, [fetchDashboardData, checkBackendHealth]);

    useEffect(() => {
        if (loading) return undefined;
        const intervalId = setInterval(fetchUpcomingClasses, UPCOMING_CLASSES_POLL_MS);
        return () => clearInterval(intervalId);
    }, [loading, fetchUpcomingClasses]);

    useEffect(() => {
        if (loading) return undefined;
        const tickId = setInterval(() => {
            setUpcomingClasses((prev) => refreshUpcomingClassStatuses(prev));
        }, LIVE_STATUS_TICK_MS);
        return () => clearInterval(tickId);
    }, [loading]);

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

    const clearRecentActivities = async () => {
        const token = getAuthToken(AUTH_REALM.ADMIN);
        if (!token) return;
        try {
            await axios.post(
                `${API_BASE_URL}/api/admin/dashboard/clear-activities`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setAllActivities([]);
            setActivitiesExpanded(false);
        } catch {
            setError('Could not clear activities. Please try again.');
        }
    };

    const displayedActivities = activitiesExpanded
        ? allActivities
        : allActivities.slice(0, ACTIVITY_PREVIEW_COUNT);

    const getStudentCountTitle = (cls) => {
        const assigned = cls.studentsAssigned ?? cls.students ?? 0;
        const unassigned = cls.studentsUnassignedIncluded ?? 0;
        if (unassigned > 0) {
            return `${assigned} assigned to this schedule + ${unassigned} unassigned for this course`;
        }
        if (assigned > 0) return `${assigned} assigned to this schedule`;
        return 'No active enrollments for this schedule';
    };

    const getClassActionLabel = (cls) => {
        if (cls.status === 'live') {
            return getMeetingHref(cls.roomOrLink) ? 'Join Now' : 'No link set';
        }
        return 'View schedule';
    };

    const handleClassAction = (cls) => {
        const meetingHref = getMeetingHref(cls.roomOrLink);
        if (cls.status === 'live' && meetingHref) {
            window.open(meetingHref, '_blank', 'noopener,noreferrer');
            return;
        }
        navigate('/admin/lms?tab=schedules');
    };

    const statsData = [
        { 
            title: 'Total Students', 
            value: loading ? '...' : stats.totalStudents.toLocaleString(), 
            icon: 'fas fa-users', 
            color: 'var(--color-accent)', 
            onClick: () => navigate('/admin/students')
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
            title: 'Active Staff', 
            value: loading ? '...' : stats.activeStaff, 
            icon: 'fas fa-user-check', 
            color: '#8b5cf6', 
            onClick: () => navigate('/admin/users')
        },
        {
            title: 'Teachers',
            value: loading ? '...' : stats.totalTeachers,
            icon: 'fas fa-chalkboard-teacher',
            color: '#06b6d4',
            onClick: () => navigate('/admin/teachers')
        },
        {
            title: 'Parents',
            value: loading ? '...' : stats.totalParents,
            icon: 'fas fa-people-roof',
            color: '#f97316',
            onClick: () => navigate('/admin/parents')
        },
    ];

    const quickActions = [
        { icon: 'fas fa-plus-circle', label: 'Add Course', action: () => navigate('/admin/courses'), color: 'var(--color-accent)' },
        { icon: 'fas fa-user-plus', label: 'Add Student', action: () => navigate('/admin/students'), color: '#10b981' },
        { icon: 'fas fa-file-invoice-dollar', label: 'View Payments', action: () => navigate('/admin/payments'), color: '#f59e0b' },
        { icon: 'fas fa-chart-line', label: 'View Reports', action: () => navigate('/admin/analytics'), color: '#8b5cf6' },
    ];

    return (
        <div className="dashboard-home">
            {/* Welcome Message with Status */}
            <div className="welcome-banner">
                <div className="welcome-content">
                    <h2>Welcome back, {user.name?.split(' ')[0] || 'Admin'}! 👋</h2>
                    <p>Here's what's happening with Gorythm Academy today</p>
                </div>
                <div className="status-indicator">
                    <div className={`status-badge ${overallStatus}`}>
                        <span className="status-dot"></span>
                        {backendStatusLabel(overallStatus)}
                    </div>
                    <small>{backendStatusDetail(overallStatus)}</small>
                </div>
            </div>

            <div className="dashboard-card lms-portals-card lms-portals-card--hint-only">
                <div className="card-header">
                    <h3>
                        <i className="fas fa-window-restore" aria-hidden="true"></i> LMS Portals
                    </h3>
                </div>
                <div className="card-body">
                    <p className="lms-portals-hint">
                        Student, teacher, parent, and accountant portals require a valid login at{' '}
                        <a href="/login">/login</a> with the matching role. Admin accounts cannot open portal routes
                        without signing in as that portal user.
                    </p>
                </div>
            </div>

            <div className="dashboard-card dashboard-appearance-card">
                <div className="card-header">
                    <h3><i className="fas fa-palette"></i> Dashboard Appearance</h3>
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
                        <label htmlFor="admin-dashboard-accent-custom">Custom Color</label>
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
                <div className="info-message dashboard-error-message">
                    <i className="fas fa-exclamation-triangle"></i>
                    <p>{error}</p>
                    <button type="button" className="retry-btn" onClick={fetchDashboardData}>
                        <i className="fas fa-redo" aria-hidden="true"></i> Retry
                    </button>
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
                                title="Hide items until new activity occurs (saved to your account)"
                            >
                                <i className="fas fa-eraser" aria-hidden="true"></i>
                                Clear
                            </button>
                            {allActivities.length > ACTIVITY_PREVIEW_COUNT && (
                                <button
                                    type="button"
                                    className="view-all"
                                    onClick={() => setActivitiesExpanded((v) => !v)}
                                >
                                    {activitiesExpanded ? (
                                        <>Show less</>
                                    ) : (
                                        <>View all <i className="fas fa-arrow-right"></i></>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="card-body card-body--activities">
                        {displayedActivities.length === 0 ? (
                            <div className="activities-empty" role="status">
                                <i className="fas fa-inbox" aria-hidden="true"></i>
                                <p>No recent activities to show.</p>
                                <small>New enrollments, payments, and other events will appear here.</small>
                            </div>
                        ) : (
                            <ul className="activities-list">
                                {displayedActivities.map((activity, index) => (
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
                    <button type="button" className="view-all" onClick={() => navigate('/admin/lms?tab=schedules')}>
                        <i className="fas fa-calendar"></i> View Schedules
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
                                {upcomingClasses.map((cls) => (
                                    <tr key={cls.id}>
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
                                            <span className="student-count" title={getStudentCountTitle(cls)}>
                                                <i className="fas fa-user-graduate"></i>
                                                {cls.students}
                                                {cls.studentsUnassignedIncluded > 0 && (
                                                    <small className="student-count-hint"> incl. unassigned</small>
                                                )}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`class-status-badge ${cls.status}`}>
                                                {cls.status === 'live' ? 'Live' : 'Upcoming'}
                                            </span>
                                        </td>
                                        <td>
                                            <button 
                                                type="button"
                                                className={`join-btn ${cls.status}`}
                                                onClick={() => handleClassAction(cls)}
                                                title={
                                                    cls.status === 'live' && !getMeetingHref(cls.roomOrLink)
                                                        ? 'No meeting link on this schedule — open LMS schedules to add one'
                                                        : undefined
                                                }
                                            >
                                                {getClassActionLabel(cls)}
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
                        <p>{databaseStatusLabel(connection.db)}</p>
                    </div>
                </div>
                <div className="status-card">
                    <i className="fas fa-server"></i>
                    <div>
                        <h4>Backend API</h4>
                        <p>
                            {connection.api === 'ok'
                                ? getApiEndpointLabel()
                                : connection.api === 'checking'
                                  ? 'Checking…'
                                  : 'Not Responding'}
                        </p>
                    </div>
                </div>
                <div className="status-card">
                    <i className="fas fa-user-shield"></i>
                    <div>
                        <h4>Admin Role</h4>
                        <p>{formatAdminRole(user.role)}</p>
                    </div>
                </div>
                <div className="status-card">
                    <i className="fas fa-rocket"></i>
                    <div>
                        <h4>System Status</h4>
                        <p className={
                            overallStatus === 'connected'
                                ? 'status-good'
                                : overallStatus === 'checking'
                                  ? 'status-neutral'
                                  : 'status-bad'
                        }>
                            {systemStatusLabel(overallStatus)}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;