import React from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { getAuthUserJson, clearAuthSession } from '../../utils/authStorage';
import './PortalLayout.scss';

const NAV_BY_ROLE = {
  student: [
    { to: '/student', label: 'Dashboard' },
    { to: '/student/courses', label: 'My Courses' },
    { to: '/student/assignments', label: 'Assignments' },
    { to: '/student/quizzes', label: 'Quizzes' },
  ],
  teacher: [
    { to: '/teacher', label: 'Dashboard' },
    { to: '/teacher/classes', label: 'Classes' },
    { to: '/teacher/attendance', label: 'Attendance' },
    { to: '/teacher/content', label: 'Content' },
  ],
  parent: [
    { to: '/parent', label: 'Dashboard' },
    { to: '/parent/children', label: 'Children' },
    { to: '/parent/progress', label: 'Progress' },
  ],
  accountant: [
    { to: '/accountant', label: 'Dashboard' },
    { to: '/accountant/payments', label: 'Payments' },
    { to: '/accountant/payroll', label: 'Payroll' },
    { to: '/accountant/reports', label: 'Reports' },
  ],
};

const PortalLayout = ({ role, title }) => {
  const user = JSON.parse(getAuthUserJson() || '{}');
  const nav = NAV_BY_ROLE[role] || [];
  const navigate = useNavigate();

  return (
    <div className="portal-layout">
      <aside className="portal-sidebar">
        <h2>{title}</h2>
        <p>{user.name || 'Portal User'}</p>
        <nav>
          {nav.map((item) => (
            <Link key={item.to} to={item.to} className="portal-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="portal-logout"
          onClick={() => {
            clearAuthSession();
            navigate('/login');
          }}
        >
          Logout
        </button>
      </aside>
      <main className="portal-content">
        <Outlet />
      </main>
    </div>
  );
};

export default PortalLayout;
