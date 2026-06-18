import React, { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { parseAuthUser, clearAuthSession, AUTH_REALM } from '../../utils/authStorage';
import {
    readAdminDashboardAccent,
    DEFAULT_ADMIN_DASHBOARD_ACCENT,
    getAdminDashboardAccentStyleVars,
    ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT,
    ADMIN_DASHBOARD_ACCENT_STORAGE_KEY,
} from '../../utils/adminDashboardTheme';
import BrandLogo from '../BrandLogo/BrandLogo';
import { AdminDialogProvider } from './AdminDialogContext';
import { useAdminPortalBadges } from '../../hooks/useAdminPortalBadges';
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
        clearAuthSession(AUTH_REALM.ADMIN);
        navigate('/admin/login');
    };

    const user = parseAuthUser(AUTH_REALM.ADMIN) || {};
    const adminBadges = useAdminPortalBadges(true);

    const menuItems = [
        { path: '/admin', icon: 'fas fa-home', label: 'Dashboard' },
        { path: '/admin/users', icon: 'fas fa-users', label: 'Users' },
        { path: '/admin/students', icon: 'fas fa-user-graduate', label: 'Students' },
        { path: '/admin/teachers', icon: 'fas fa-chalkboard-teacher', label: 'Teachers' },
        { path: '/admin/parents', icon: 'fas fa-people-roof', label: 'Parents' },
        { path: '/admin/courses', icon: 'fas fa-book', label: 'Courses' },
        { path: '/admin/payments', icon: 'fas fa-credit-card', label: 'Payments' },
        { path: '/admin/lms', icon: 'fas fa-school', label: 'LMS', badgeKey: 'lmsAttendance', badgeDot: true },
        { path: '/admin/assignments', icon: 'fas fa-folder-open', label: 'Resources & Submissions' },
        { path: '/admin/analytics', icon: 'fas fa-chart-bar', label: 'Analytics' },
        { path: '/admin/contact-messages', icon: 'fas fa-envelope-open-text', label: 'Contact Messages' },
        { path: '/admin/subscribers', icon: 'fas fa-user-plus', label: 'Subscribers' },
        { path: '/admin/promo-videos', icon: 'fas fa-video', label: 'Video Controls' },
    ];

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
                                <BrandLogo className="sidebar-logo-image" alt="Gorythm Academy" width={148} height={148} />
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
                    {menuItems.map((item) => {
                        const badgeCount = item.badgeKey ? adminBadges[item.badgeKey] || 0 : 0;
                        const isActive =
                            item.path === '/admin'
                                ? location.pathname === '/admin'
                                : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                        return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`menu-item ${isActive ? 'active' : ''}`}
                            title={
                                !sidebarOpen && badgeCount > 0
                                    ? `${item.label}${item.badgeDot ? ' (pending)' : ` (${badgeCount})`}`
                                    : undefined
                            }
                        >
                            <i className={item.icon}></i>
                            {sidebarOpen ? (
                                <span className="menu-item__label">
                                    {item.label}
                                    {badgeCount > 0 ? (
                                        item.badgeDot ? (
                                            <span
                                                className="menu-item__badge menu-item__badge--dot"
                                                aria-label="Pending items"
                                            />
                                        ) : (
                                            <span className="menu-item__badge" aria-label={`${badgeCount} pending`}>
                                                {badgeCount > 99 ? '99+' : badgeCount}
                                            </span>
                                        )
                                    ) : null}
                                </span>
                            ) : null}
                            {!sidebarOpen && badgeCount > 0 ? (
                                item.badgeDot ? (
                                    <span
                                        className="menu-item__badge menu-item__badge--dot menu-item__badge--collapsed"
                                        aria-label="Pending items"
                                    />
                                ) : (
                                    <span
                                        className="menu-item__badge menu-item__badge--collapsed"
                                        aria-label={`${badgeCount} pending`}
                                    >
                                        {badgeCount > 9 ? '9+' : badgeCount}
                                    </span>
                                )
                            ) : null}
                        </Link>
                    );
                    })}
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
                                <span className="role-badge">
                                  {user.role === 'manager' ? 'Manager' : user.role || 'staff'}
                                </span>
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