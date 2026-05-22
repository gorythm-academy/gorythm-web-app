import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';

const StudentAttendance = () => {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/attendance')
      .then((res) => {
        if (res.success) setRecords(res.records || []);
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
  if (records === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length;
  const rate = records.length ? Math.round((present / records.length) * 100) : 0;

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="My attendance"
        subtitle={records.length ? `Overall rate (recent records): ${rate}%` : 'Attendance marked by your teachers'}
      />
      <SimpleTable
        columns={[
          { key: 'course', label: 'Course', render: (r) => r.course?.title },
          { key: 'status', label: 'Status', render: (r) => r.status },
          { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
          { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
        ]}
        rows={records}
        emptyLabel="No attendance records yet."
      />
    </div>
  );
};

export default StudentAttendance;
