import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';

const AccountantPayments = () => {
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/accountant/payments')
      .then((res) => {
        if (res.success) setPayments(res.payments || []);
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
  if (payments === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader title="Student payments" subtitle="Same data as admin Payments tab" />
      <SimpleTable
        columns={[
          { key: 'student', label: 'Student', render: (r) => r.user?.name || r.studentName },
          { key: 'course', label: 'Course', render: (r) => r.course?.title || r.courseName },
          {
            key: 'amount',
            label: 'Amount',
            render: (r) => `$${Number(r.amount || 0).toFixed(2)}`,
          },
          { key: 'status', label: 'Status' },
          { key: 'method', label: 'Method', render: (r) => r.paymentMethod },
          {
            key: 'date',
            label: 'Date',
            render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
          },
        ]}
        rows={payments}
        emptyLabel="No payments."
      />
    </div>
  );
};

export default AccountantPayments;
