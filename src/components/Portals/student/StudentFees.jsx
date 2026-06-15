import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, FeeBadge } from '../shared/PortalUi';

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

  const enrollmentRows = enrollments.filter((e) => e.course);

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="Fees"
        subtitle="Status reflects actual payments (paid, pending, failed, refunded) — not enrollment alone."
      />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-file-invoice-dollar" />
        </div>
        <div>
          <h2>Fee overview</h2>
          <p>Enrollment fee status and your payment history in one place.</p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <div>
            <h2>By enrollment</h2>
            <p>Course price and payment status per enrollment</p>
          </div>
        </div>
        <div className="portal-panel__body">
          {enrollmentRows.length === 0 ? (
            <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
              No enrollments.
            </p>
          ) : (
            <div className="portal-data-table-wrap">
              <table className="portal-data-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Course price</th>
                    <th>Fee status</th>
                    <th>Enrollment</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollmentRows.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <strong>{r.course?.title || '—'}</strong>
                      </td>
                      <td>{r.course?.price != null ? `$${Number(r.course.price).toFixed(2)}` : '—'}</td>
                      <td>
                        <FeeBadge status={r.paymentStatus} />
                      </td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Payment history</h2>
            <p>Recorded payments for your enrollments</p>
          </div>
        </div>
        <div className="portal-panel__body">
          {payments.length === 0 ? (
            <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
              No payments recorded.
            </p>
          ) : (
            <div className="portal-data-table-wrap">
              <table className="portal-data-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((r) => (
                    <tr key={r._id}>
                      <td>{r.course?.title || r.courseName || '—'}</td>
                      <td>${Number(r.amount || 0).toFixed(2)}</td>
                      <td>{r.status}</td>
                      <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentFees;
