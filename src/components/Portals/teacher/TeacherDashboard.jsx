import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SummaryGrid } from '../shared/PortalUi';

const TeacherDashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/teacher/dashboard')
      .then((res) => {
        if (res.success) setData(res);
        else setError(res.error || 'Failed to load');
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
  return (
    <div className="portal-page">
      <PortalPageHeader title="Teacher Dashboard" />
      <SummaryGrid
        items={[
          { label: 'Courses', value: s.coursesManaged ?? 0, to: '/teacher/classes' },
          { label: 'Assignments', value: s.assignmentsCount ?? 0, to: '/teacher/content' },
          { label: 'Quizzes', value: s.quizzesCount ?? 0, to: '/teacher/quizzes' },
          {
            label: 'Submissions',
            value: s.submissionCount ?? 0,
            to: '/teacher/content',
          },
        ]}
      />
      <div className="portal-grid" style={{ marginTop: '1rem' }}>
        <Link to="/teacher/classes" className="portal-card portal-link-card">
          My classes →
        </Link>
        <Link to="/teacher/attendance" className="portal-card portal-link-card">
          Students attendance →
        </Link>
        <Link to="/teacher/content" className="portal-card portal-link-card">
          Assignments →
        </Link>
        <Link to="/teacher/resources" className="portal-card portal-link-card">
          Resources →
        </Link>
        <Link to="/teacher/my-attendance" className="portal-card portal-link-card">
          My attendance →
        </Link>
      </div>
    </div>
  );
};

export default TeacherDashboard;
