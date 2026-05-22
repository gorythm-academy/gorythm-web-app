import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SummaryGrid } from '../shared/PortalUi';

const AccountantDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/accountant/dashboard')
      .then((res) => {
        if (res.success) setSummary(res.summary);
        else setError(res.error || 'Failed');
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
  if (!summary) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader title="Accountant Dashboard" />
      <SummaryGrid
        items={[
          { label: 'Total payments', value: summary.payments, to: '/accountant/payments' },
          { label: 'Completed', value: summary.completed, to: '/accountant/payments' },
          { label: 'Pending', value: summary.pending, to: '/accountant/payments' },
          { label: 'Failed', value: summary.failed ?? 0, to: '/accountant/payments' },
          { label: 'Refunded', value: summary.refunded, to: '/accountant/payments' },
        ]}
      />
      <div className="portal-grid" style={{ marginTop: '1rem' }}>
        <Link to="/accountant/payments" className="portal-card portal-link-card">
          Student payments →
        </Link>
        <Link to="/accountant/payroll" className="portal-card portal-link-card">
          Payroll →
        </Link>
        <Link to="/accountant/reports" className="portal-card portal-link-card">
          Reports →
        </Link>
      </div>
    </div>
  );
};

export default AccountantDashboard;
