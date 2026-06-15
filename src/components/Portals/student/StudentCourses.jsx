import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, FeeBadge } from '../shared/PortalUi';

const StudentCourses = () => {
  const [enrollments, setEnrollments] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/courses')
      .then((res) => {
        if (res.success) setEnrollments(res.enrollments || []);
        else setError(res.error || 'Failed to load courses');
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

  const rows = enrollments.filter((e) => e.course);

  return (
    <div className="portal-page">
      <PortalPageHeader title="My Courses" subtitle="Only courses you are enrolled in" />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-book" />
        </div>
        <div>
          <h2>Your enrollments</h2>
          <p>Active and completed courses linked to your student account.</p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <h2>Course list</h2>
        </div>
        <div className="portal-panel__body">
          {rows.length === 0 ? (
            <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
              No enrolled courses yet. Contact admin to enroll.
            </p>
          ) : (
            <div className="portal-data-table-wrap">
              <table className="portal-data-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Category</th>
                    <th>Enrollment</th>
                    <th>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e._id}>
                      <td>
                        <strong>{e.course?.title || '—'}</strong>
                      </td>
                      <td>{e.course?.category || '—'}</td>
                      <td>
                        <span className={`portal-status-pill portal-status-pill--${e.status === 'active' ? 'submitted' : 'pending'}`}>
                          {e.status}
                        </span>
                      </td>
                      <td>
                        <FeeBadge status={e.paymentStatus} />
                      </td>
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

export default StudentCourses;
