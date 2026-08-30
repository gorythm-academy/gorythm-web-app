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
import { PortalDialogProvider } from './shared/PortalDialogContext';
import { useStudentPortalBadges } from '../../hooks/useStudentPortalBadges';
import { useTeacherPortalBadges } from '../../hooks/useTeacherPortalBadges';
import { useAccountantPortalBadges } from '../../hooks/useAccountantPortalBadges';
import './PortalLayout.scss';
import './accountant/AccountantPortalTheme.scss';
import '../Admin/Admin.scss';

const MOBILE_MAX_WIDTH = 1024;
const isMobileViewport = () => window.innerWidth <= MOBILE_MAX_WIDTH;

const NAV_BY_ROLE = {
  student: [
    { to: '/student', label: 'Dashboard', icon: 'fas fa-home', end: true },
    { to: '/student/schedule', label: 'Class Schedules', icon: 'fas fa-clock' },
    { to: '/student/fees', label: 'Fees', icon: 'fas fa-file-invoice-dollar' },
    { to: '/student/assignments', label: 'Assignments', icon: 'fas fa-tasks', badgeKey: 'assignments', editDotKey: 'assignmentsEdit' },
    { to: '/student/quizzes', label: 'Quizzes', icon: 'fas fa-question-circle', badgeKey: 'quizzes' },
    { to: '/student/content', label: 'Content', icon: 'fas fa-folder-open', badgeKey: 'content' },
    { to: '/student/attendance', label: 'Attendance', icon: 'fas fa-user-check' },
    { to: '/student/account', label: 'Account', icon: 'fas fa-user-cog' },
  ],
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: 'fas fa-home', end: true },
    { to: '/teacher/classes', label: 'Classes', icon: 'fas fa-chalkboard' },
    { to: '/teacher/attendance', label: 'Students Attendance', icon: 'fas fa-user-check' },
    { to: '/teacher/content', label: 'Assignments', icon: 'fas fa-tasks', badgeKey: 'submissions', editDotKey: 'submissionsEdit' },
    { to: '/teacher/resources', label: 'Resources', icon: 'fas fa-folder-open', badgeKey: 'adminResources' },
    { to: '/teacher/quizzes', label: 'Quizzes', icon: 'fas fa-question-circle', badgeKey: 'quizAttempts' },
    { to: '/teacher/my-attendance', label: 'My Attendance', icon: 'fas fa-calendar-check' },
    { to: '/teacher/account', label: 'Account', icon: 'fas fa-user-cog' },
  ],
  parent: [
    { to: '/parent', label: 'Dashboard', icon: 'fas fa-home', end: true },
    { to: '/parent/children', label: 'Children', icon: 'fas fa-child' },
    { to: '/parent/schedule', label: 'Class Schedules', icon: 'fas fa-clock' },
    { to: '/parent/progress', label: 'Progress', icon: 'fas fa-chart-line' },
    { to: '/parent/account', label: 'Account', icon: 'fas fa-user-cog' },
  ],
  accountant: [
    { to: '/accountant', label: 'Overview', icon: 'fas fa-chart-pie', end: true },
    { to: '/accountant/payments', label: 'Fee Reviews', icon: 'fas fa-file-invoice-dollar', badgeKey: 'payments' },
    { to: '/accountant/payroll', label: 'Teacher Payroll', icon: 'fas fa-money-check-alt', badgeKey: 'payroll', badgeDot: true },
    { to: '/accountant/reports', label: 'Financial Reports', icon: 'fas fa-file-export' },
    { to: '/accountant/account', label: 'Account', icon: 'fas fa-user-cog' },
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
  const studentBadges = useStudentPortalBadges(role === 'student');
  const teacherBadges = useTeacherPortalBadges(role === 'teacher');
  const accountantBadges = useAccountantPortalBadges(role === 'accountant');
  const navBadges =
    role === 'student'
      ? studentBadges
      : role === 'teacher'
        ? teacherBadges
        : role === 'accountant'
          ? accountantBadges
          : {};

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
    clearAuthSession(AUTH_REALM.PORTAL);
    navigate('/login');
  };

  return (
    <div className={`admin-dashboard portal-dashboard portal-dashboard--${role}`} style={dashboardThemeStyle}>
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
          {nav.map((item) => {
            const badgeCount = item.badgeKey ? navBadges[item.badgeKey] || 0 : 0;
            const showCountBadge = badgeCount > 0;
            const showEditDot = item.editDotKey ? Boolean(navBadges[item.editDotKey]) : false;
            const showBadge = showCountBadge || showEditDot;
            const collapsedTitleSuffix = showCountBadge
              ? ` (${badgeCount})`
              : showEditDot
                ? ' (updated)'
                : '';
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`menu-item ${
                  navItemIsActive(location.pathname, item.to, item.end) ? 'active' : ''
                }`}
                title={
                  !sidebarOpen && showBadge
                    ? `${item.label}${item.badgeDot && !showCountBadge ? ' (pending)' : collapsedTitleSuffix}`
                    : !sidebarOpen
                      ? item.label
                      : undefined
                }
              >
                <i className={item.icon} />
                {sidebarOpen && (
                  <span className="menu-item__label">
                    {item.label}
                    {showBadge ? (
                      <span className="menu-item__badges">
                        {showCountBadge ? (
                          item.badgeDot ? (
                            <span className="menu-item__badge menu-item__badge--dot" aria-label="Pending items" />
                          ) : (
                            <span className="menu-item__badge" aria-label={`${badgeCount} new`}>
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )
                        ) : null}
                        {showEditDot ? (
                          <span
                            className="menu-item__badge menu-item__badge--dot menu-item__badge--edit"
                            aria-label="Updated items"
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                )}
                {!sidebarOpen && showBadge ? (
                  <span className="menu-item__badges menu-item__badges--collapsed">
                    {showCountBadge ? (
                      item.badgeDot ? (
                        <span
                          className="menu-item__badge menu-item__badge--dot menu-item__badge--collapsed"
                          aria-label="Pending items"
                        />
                      ) : (
                        <span className="menu-item__badge menu-item__badge--collapsed" aria-label={`${badgeCount} new`}>
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )
                    ) : null}
                    {showEditDot ? (
                      <span
                        className="menu-item__badge menu-item__badge--dot menu-item__badge--edit menu-item__badge--collapsed"
                        aria-label="Updated items"
                      />
                    ) : null}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="logout-btn" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt" />
            {sidebarOpen ? <span>Logout</span> : null}
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
        <div className="admin-content">
          <PortalDialogProvider>
            <Outlet />
          </PortalDialogProvider>
        </div>
      </main>
    </div>
  );
};

export default PortalLayout;
