import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet } from '../shared/portalApi';
import {
  PortalAlert,
  PortalPageHeader,
  PortalSummaryGridSkeleton,
  SummaryGrid,
} from '../shared/PortalUi';

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

  const loading = !data;
  const s = data?.summary || {};

  return (
    <div className="portal-page">
      <PortalPageHeader title="Parent Dashboard" subtitle="Overview of your linked children" />

      <div className="portal-hero portal-hero--parent">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-users" />
        </div>
        <div>
          <h2>Family Learning Hub</h2>
          <p>View attendance, assignments, and quiz results in Progress. Courses and fees are on the Fees tab.</p>
        </div>
      </div>

      {error ? <PortalAlert type="error">{error}</PortalAlert> : null}
      {loading ? (
        <PortalSummaryGridSkeleton items={4} />
      ) : (
        <SummaryGrid
          items={[
            { label: 'Children Linked', value: s.childrenCount ?? 0, to: '/parent/children' },
            { label: 'Courses', value: s.enrollmentsCount ?? 0, to: '/parent/billing' },
            { label: 'Attendance Records', value: s.attendanceRecords ?? 0, to: '/parent/progress' },
            { label: 'Pending Fees', value: s.pendingFees ?? 0, to: '/parent/billing' },
          ]}
        />
      )}

      <div className="portal-quick-links">
        <Link to="/parent/children" className="portal-card portal-link-card">
          My children →
        </Link>
        <Link to="/parent/billing" className="portal-card portal-link-card">
          Pay fees →
        </Link>
        <Link to="/parent/progress" className="portal-card portal-link-card">
          Progress & Results →
        </Link>
      </div>
    </div>
  );
};

export default ParentDashboard;
