import React, { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { parseAuthUser, clearAuthSession, AUTH_REALM } from '../../utils/authStorage';
import { isViewingPortalAsAdmin, clearAdminPortalPreview } from '../../utils/adminPortalPreview';
import {
  readAdminDashboardAccent,
  DEFAULT_ADMIN_DASHBOARD_ACCENT,
  getAdminDashboardAccentStyleVars,
  ADMIN_DASHBOARD_ACCENT_CHANGE_EVENT,
  ADMIN_DASHBOARD_ACCENT_STORAGE_KEY,
} from '../../utils/adminDashboardTheme';
import BrandLogo from '../BrandLogo/BrandLogo';
import './PortalLayout.scss';

const MOBILE_MAX_WIDTH = 1024;
const isMobileViewport = () => window.innerWidth <= MOBILE_MAX_WIDTH;

const NAV_BY_ROLE = {
  student: [
    { to: '/student', label: 'Dashboard', icon: 'fas fa-home', end: true },
    { to: '/student/courses', label: 'My Courses', icon: 'fas fa-book' },
    { to: '/student/fees', label: 'Fees', icon: 'fas fa-file-invoice-dollar' },
    { to: '/student/assignments', label: 'Assignments', icon: 'fas fa-tasks' },
    { to: '/student/attendance', label: 'Attendance', icon: 'fas fa-user-check' },
    { to: '/student/quizzes', label: 'Quizzes', icon: 'fas fa-question-circle' },
    { to: '/student/content', label: 'Content', icon: 'fas fa-folder-open' },
    { to: '/student/schedule', label: 'Schedule', icon: 'fas fa-clock' },
  ],
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: 'fas fa-home', end: true },
    { to: '/teacher/classes', label: 'Classes', icon: 'fas fa-chalkboard' },
    { to: '/teacher/attendance', label: 'Students attendance', icon: 'fas fa-user-check' },
    { to: '/teacher/content', label: 'Content', icon: 'fas fa-folder-open' },
    { to: '/teacher/quizzes', label: 'Quizzes', icon: 'fas fa-question-circle' },
    { to: '/teacher/schedule', label: 'Schedule', icon: 'fas fa-clock' },
    { to: '/teacher/my-attendance', label: 'My Attendance', icon: 'fas fa-calendar-check' },
  ],
  parent: [
    { to: '/parent', label: 'Dashboard', icon: 'fas fa-home', end: true },
    { to: '/parent/children', label: 'Children', icon: 'fas fa-child' },
    { to: '/parent/progress', label: 'Progress', icon: 'fas fa-chart-line' },
  ],
  accountant: [
    { to: '/accountant', label: 'Dashboard', icon: 'fas fa-home', end: true },
    { to: '/accountant/payments', label: 'Payments', icon: 'fas fa-credit-card' },
    { to: '/accountant/payroll', label: 'Payroll', icon: 'fas fa-money-bill-wave' },
    { to: '/accountant/reports', label: 'Reports', icon: 'fas fa-file-alt' },
  ],
};

function navItemIsActive(pathname, to, end) {
  if (end) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

const PortalLayout = ({ role, title }) => {
  const user = parseAuthUser(AUTH_REALM.PORTAL) || {};
  const nav = NAV_BY_ROLE[role] || [];
  const navigate = useNavigate();
  const location = useLocation();
  const adminPreview = isViewingPortalAsAdmin();

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !isMobileViewport();
  });

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

  const handleLogout = () => {
    if (adminPreview) {
      clearAdminPortalPreview();
      navigate('/admin');
      return;
    }
    clearAuthSession(AUTH_REALM.PORTAL);
    navigate('/login');
  };

  return (
    <div className="admin-dashboard portal-dashboard" style={dashboardThemeStyle}>
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
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`} />
          </button>
        </div>

        {sidebarOpen ? <p className="portal-dashboard-title">{title}</p> : null}

        <nav className="sidebar-menu" aria-label="Portal navigation">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`menu-item ${
                navItemIsActive(location.pathname, item.to, item.end) ? 'active' : ''
              }`}
              title={!sidebarOpen ? item.label : undefined}
            >
              <i className={item.icon} />
              {sidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
          {adminPreview ? (
            <Link
              to="/admin"
              className="menu-item"
              title={!sidebarOpen ? 'Admin dashboard' : undefined}
            >
              <i className="fas fa-arrow-left" />
              {sidebarOpen && <span>Admin dashboard</span>}
            </Link>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="logout-btn" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt" />
            {sidebarOpen ? <span>{adminPreview ? 'Sign out' : 'Logout'}</span> : null}
          </button>
          <div className="admin-profile">
            <div className="profile-avatar">
              {(user.name || 'P').charAt(0).toUpperCase()}
            </div>
            {sidebarOpen && (
              <div className="profile-info">
                <h4>{user.name || 'Portal User'}</h4>
                {user.email ? <p>{user.email}</p> : null}
                <span className="role-badge">{user.role || role}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="admin-main">
        {adminPreview ? (
          <div className="portal-lms-preview-banner" role="status">
            <strong>Admin preview</strong>
            <span>
              You are viewing the {title} UI with your admin login. API calls still use your admin account unless the
              backend allows it.
            </span>
            <button type="button" className="portal-lms-preview-back" onClick={() => navigate('/admin')}>
              Back to admin
            </button>
          </div>
        ) : null}
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default PortalLayout;
