import React, { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getAuthToken, getAuthUserJson, clearAuthSession } from '../../utils/authStorage';
import {
    ADMIN_SETTINGS_PAGE_ENABLED,
    readAdminDashboardAccent,
    DEFAULT_ADMIN_DASHBOARD_ACCENT,
    getAdminDashboardAccentStyleVars,
    ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT,
    ADMIN_DASHBOARD_ACCENT_STORAGE_KEY,
} from '../../utils/adminDashboardTheme';
import headerLogo from '../../assets/images/home/logo.png';
import { AdminDialogProvider } from './AdminDialogContext';
import './Admin.scss';

const MOBILE_MAX_WIDTH = 1024;
const isMobileViewport = () => window.innerWidth <= MOBILE_MAX_WIDTH;

const DashboardLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        return !isMobileViewport();
    });
    const navigate = useNavigate();
    const location = useLocation();

    // Check authentication on mount
    useEffect(() => {
        const token = getAuthToken();
        const user = getAuthUserJson();
        
        if (!token || !user) {
            navigate('/admin/login');
        }
    }, [navigate]);

    useEffect(() => {
        const handleViewportChange = () => {
            if (isMobileViewport()) {
                setSidebarOpen(false);
            } else {
                setSidebarOpen(true);
            }
        };

        handleViewportChange();
        window.addEventListener('resize', handleViewportChange);

        return () => window.removeEventListener('resize', handleViewportChange);
    }, []);

    const handleLogout = () => {
        clearAuthSession();
        navigate('/admin/login');
    };

    // Get current user from localStorage
    const user = JSON.parse(getAuthUserJson() || '{}');

    const menuItems = [
        { path: '/admin', icon: 'fas fa-home', label: 'Dashboard' },
        { path: '/admin/users', icon: 'fas fa-users', label: 'Users' },
        { path: '/admin/people', icon: 'fas fa-people-group', label: 'People' },
        { path: '/admin/courses', icon: 'fas fa-book', label: 'Courses' },
        { path: '/admin/payments', icon: 'fas fa-credit-card', label: 'Payments' },
        { path: '/admin/students-data', icon: 'fas fa-user-graduate', label: 'Students data' },
        { path: '/admin/assignments', icon: 'fas fa-tasks', label: 'Assignments' },
        { path: '/admin/analytics', icon: 'fas fa-chart-bar', label: 'Analytics' },
        { path: '/admin/contact-messages', icon: 'fas fa-envelope-open-text', label: 'Contact Messages' },
        { path: '/admin/subscribers', icon: 'fas fa-user-plus', label: 'Subscribers' },
        { path: '/admin/settings', icon: 'fas fa-cog', label: 'Settings' },
    ].filter((item) => ADMIN_SETTINGS_PAGE_ENABLED || item.path !== '/admin/settings');

    const [dashboardAccent, setDashboardAccent] = useState(
        () => readAdminDashboardAccent() || DEFAULT_ADMIN_DASHBOARD_ACCENT
    );

    useEffect(() => {
        const syncFromEvent = (e) => {
            const next = e?.detail?.hex || readAdminDashboardAccent() || DEFAULT_ADMIN_DASHBOARD_ACCENT;
            setDashboardAccent(next);
        };
        const onStorage = (ev) => {
            if (ev.key === ADMIN_DASHBOARD_ACCENT_STORAGE_KEY || ev.key === null) {
                setDashboardAccent(readAdminDashboardAccent() || DEFAULT_ADMIN_DASHBOARD_ACCENT);
            }
        };
        window.addEventListener(ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT, syncFromEvent);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT, syncFromEvent);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    const dashboardThemeStyle = useMemo(
        () => getAdminDashboardAccentStyleVars(dashboardAccent),
        [dashboardAccent]
    );

    return (
        <div className="admin-dashboard" style={dashboardThemeStyle}>
            {/* Sidebar */}
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    {sidebarOpen && (
                        <div className="sidebar-logo-wrap">
                            <Link to="/" className="sidebar-logo-link" aria-label="Go to home page">
                                <img src={headerLogo} alt="Gorythm Academy" className="sidebar-logo-image" />
                            </Link>
                        </div>
                    )}
                    <button 
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                    >
                        <i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`}></i>
                    </button>
                </div>
                
                <nav className="sidebar-menu">
                    {menuItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`menu-item ${location.pathname === item.path ? 'active' : ''}`}
                        >
                            <i className={item.icon}></i>
                            {sidebarOpen && <span>{item.label}</span>}
                        </Link>
                    ))}
                </nav>
                
                <div className="sidebar-footer">
                    <button className="logout-btn" onClick={handleLogout}>
                        <i className="fas fa-sign-out-alt"></i>
                        {sidebarOpen ? <span>Logout</span> : null}
                    </button>
                    <div className="admin-profile">
                        <div className="profile-avatar">
                            {user.name ? user.name.charAt(0).toUpperCase() : 'A'}
                        </div>
                        {sidebarOpen && (
                            <div className="profile-info">
                                <h4>{user.name || 'Admin User'}</h4>
                                {user.email ? <p>{user.email}</p> : null}
                                <span className="role-badge">{user.role || 'admin'}</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <div className="admin-content">
                    <AdminDialogProvider>
                        <Outlet />
                    </AdminDialogProvider>
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;