import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SummaryGrid } from '../shared/PortalUi';

const formatMonth = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const AccountantDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [payrollMissingAlerts, setPayrollMissingAlerts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/accountant/dashboard')
      .then((res) => {
        if (res.success) {
          setSummary(res.summary);
          setPayrollMissingAlerts(res.payrollMissingAlerts || []);
        } else setError(res.error || 'Failed');
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
      <PortalPageHeader title="Finance overview" subtitle="Student fee reviews, teacher payroll, and exportable reports" />

      <div className="portal-hero portal-hero--accountant">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-calculator" />
        </div>
        <div>
          <h2>Welcome back</h2>
          <p>Track pending fee proofs, teacher payroll queues, and monthly financial summaries in one place.</p>
        </div>
      </div>

      {payrollMissingAlerts.length > 0 ? (
        <PortalAlert type="warning">
          <strong>
            {payrollMissingAlerts.length} approved month{payrollMissingAlerts.length === 1 ? '' : 's'}{' '}
            without payroll
          </strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
            {payrollMissingAlerts.map((a) => (
              <li key={a._id}>
                {a.teacher?.name || 'Teacher'} — {formatMonth(a.monthKey)}: {a.reason}
              </li>
            ))}
          </ul>
          <p style={{ margin: '0.5rem 0 0' }}>
            <Link to="/accountant/payroll">Add salary profile or generate payroll →</Link>
          </p>
        </PortalAlert>
      ) : null}

      <SummaryGrid
        items={[
          { label: 'Payroll to review', value: summary.payrollPendingReview ?? 0, to: '/accountant/payroll' },
          { label: 'Payroll out of date', value: summary.payrollStale ?? 0, to: '/accountant/payroll' },
          { label: 'Missing payroll', value: summary.payrollMissing ?? 0, to: '/accountant/payroll' },
          { label: 'Payroll paid', value: summary.payrollPaid ?? 0, to: '/accountant/payroll' },
          { label: 'Student payments', value: summary.payments, to: '/accountant/payments' },
          { label: 'Pending payments', value: summary.pending, to: '/accountant/payments' },
        ]}
      />

      <div className="portal-quick-links">
        <Link to="/accountant/payments" className="portal-card portal-link-card">
          Fee reviews →
        </Link>
        <Link to="/accountant/payroll" className="portal-card portal-link-card">
          Teacher payroll →
        </Link>
        <Link to="/accountant/reports" className="portal-card portal-link-card">
          Financial reports →
        </Link>
      </div>
    </div>
  );
};

export default AccountantDashboard;
