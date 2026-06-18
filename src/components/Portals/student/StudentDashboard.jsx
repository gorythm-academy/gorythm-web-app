import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SummaryGrid } from '../shared/PortalUi';

const StudentDashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/dashboard')
      .then((res) => {
        if (res.success) setData(res);
        else setError(res.error || 'Failed to load dashboard');
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  const s = data.summary || {};
  const due = data.dueAssignments || [];

  return (
    <div className="portal-page">
      <PortalPageHeader title="Student Dashboard" subtitle="Your learning overview" />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-graduation-cap" />
        </div>
        <div>
          <h2>Welcome back</h2>
          <p>Track courses, assignments, quizzes, fees, and your class schedule from one place.</p>
        </div>
      </div>

      <SummaryGrid
        items={[
          { label: 'Enrolled courses', value: s.enrolledCourses ?? 0, to: '/student/schedule' },
          { label: 'Attendance', value: `${s.attendanceRate ?? 0}%`, to: '/student/attendance' },
          { label: 'Assignments due', value: s.assignmentsDue ?? 0, to: '/student/assignments' },
          { label: 'Pending fees', value: s.pendingFees ?? 0, to: '/student/fees' },
        ]}
      />

      {due.length ? (
        <div className="portal-panel" style={{ marginTop: '1.25rem' }}>
          <div className="portal-panel__head">
            <h2>Assignments due</h2>
          </div>
          <div className="portal-panel__body portal-panel__body--padded">
            <ul className="portal-due-list">
              {due.map((a) => (
                <li key={a._id}>
                  <Link to="/student/assignments">
                    {a.title}
                    {a.course?.title ? ` (${a.course.title})` : ''} — due{' '}
                    {new Date(a.dueDate).toLocaleDateString()}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="portal-quick-links">
        <Link to="/student/schedule" className="portal-card portal-link-card">
          Classes schedules →
        </Link>
        <Link to="/student/assignments" className="portal-card portal-link-card">
          Assignments →
        </Link>
        <Link to="/student/quizzes" className="portal-card portal-link-card">
          Quizzes →
        </Link>
        <Link to="/student/fees" className="portal-card portal-link-card">
          Fees →
        </Link>
        <Link to="/student/schedule" className="portal-card portal-link-card">
          Class schedule →
        </Link>
        <Link to="/student/content" className="portal-card portal-link-card">
          Course content →
        </Link>
      </div>
    </div>
  );
};

export default StudentDashboard;
