import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, FeeBadge, SimpleTable } from '../shared/PortalUi';

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

  const rows = enrollments
    .filter((e) => e.course)
    .map((e) => ({
      _id: e._id,
      title: e.course?.title || '—',
      category: e.course?.category || '—',
      status: e.status,
      fee: e.paymentStatus,
    }));

  return (
    <div className="portal-page">
      <PortalPageHeader title="My Courses" subtitle="Only courses you are enrolled in" />
      <SimpleTable
        columns={[
          { key: 'title', label: 'Course' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Enrollment' },
          { key: 'fee', label: 'Fee', render: (r) => <FeeBadge status={r.fee} /> },
        ]}
        rows={rows}
        emptyLabel="No enrolled courses yet. Contact admin to enroll."
      />
    </div>
  );
};

export default StudentCourses;
