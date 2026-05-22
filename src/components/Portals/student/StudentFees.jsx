import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, FeeBadge, SimpleTable } from '../shared/PortalUi';

const StudentFees = () => {
  const [enrollments, setEnrollments] = useState(null);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/fees')
      .then((res) => {
        if (res.success) {
          setEnrollments(res.enrollments || []);
          setPayments(res.payments || []);
        } else setError(res.error || 'Failed to load fees');
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
  if (enrollments === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="Fees"
        subtitle="Status reflects actual payments (paid, pending, failed, refunded) — not enrollment alone."
      />
      <h3>By enrollment</h3>
      <SimpleTable
        columns={[
          { key: 'course', label: 'Course', render: (r) => r.course?.title || '—' },
          {
            key: 'price',
            label: 'Course price',
            render: (r) =>
              r.course?.price != null ? `$${Number(r.course.price).toFixed(2)}` : '—',
          },
          { key: 'paymentStatus', label: 'Fee status', render: (r) => <FeeBadge status={r.paymentStatus} /> },
          { key: 'status', label: 'Enrollment' },
        ]}
        rows={enrollments.filter((e) => e.course)}
        emptyLabel="No enrollments."
      />
      <h3 style={{ marginTop: '1.5rem' }}>Payment history</h3>
      <SimpleTable
        columns={[
          { key: 'courseName', label: 'Course', render: (r) => r.course?.title || r.courseName },
          { key: 'amount', label: 'Amount', render: (r) => `$${Number(r.amount || 0).toFixed(2)}` },
          { key: 'status', label: 'Status' },
          {
            key: 'date',
            label: 'Date',
            render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
          },
        ]}
        rows={payments}
        emptyLabel="No payments recorded."
      />
    </div>
  );
};

export default StudentFees;
