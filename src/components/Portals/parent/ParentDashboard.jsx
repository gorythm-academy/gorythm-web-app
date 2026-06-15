import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SummaryGrid } from '../shared/PortalUi';

const ParentDashboard = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/parent/dashboard')
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
      {data.previewMode ? <PortalAlert type="info">{data.message}</PortalAlert> : null}
      <PortalPageHeader title="Parent Dashboard" subtitle="Overview of your linked children" />

      <div className="portal-hero portal-hero--parent">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-users" />
        </div>
        <div>
          <h2>Family learning hub</h2>
          <p>View enrollments, attendance, assignments, quiz results, and fees for each linked child.</p>
        </div>
      </div>

      <SummaryGrid
        items={[
          { label: 'Children linked', value: s.childrenCount ?? 0, to: '/parent/children' },
          { label: 'Enrollments', value: s.enrollmentsCount ?? 0, to: '/parent/progress' },
          { label: 'Attendance records', value: s.attendanceRecords ?? 0, to: '/parent/progress' },
          { label: 'Pending fees', value: s.pendingFees ?? 0, to: '/parent/progress' },
        ]}
      />

      <div className="portal-quick-links">
        <Link to="/parent/children" className="portal-card portal-link-card">
          My children →
        </Link>
        <Link to="/parent/progress" className="portal-card portal-link-card">
          Progress & results →
        </Link>
      </div>
    </div>
  );
};

export default ParentDashboard;
