import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import ScheduleWeekView from '../shared/ScheduleWeekView';

const StudentSchedule = () => {
  const [schedules, setSchedules] = useState(null);
  const [dayLabels, setDayLabels] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/schedule')
      .then((res) => {
        if (res.success) {
          setSchedules(res.schedules || []);
          setDayLabels(res.dayLabels || []);
        } else setError(res.error || 'Failed to load');
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
  if (schedules === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader title="Class schedule" />
      <ScheduleWeekView schedules={schedules} dayLabels={dayLabels} />
      <h3 style={{ marginTop: '1.5rem' }}>Full list</h3>
      <SimpleTable
        columns={[
          { key: 'day', label: 'Day', render: (r) => dayLabels[r.dayOfWeek] || r.dayOfWeek },
          { key: 'time', label: 'Time', render: (r) => `${r.startTime} – ${r.endTime}` },
          { key: 'course', label: 'Course', render: (r) => r.course?.title },
          { key: 'teacher', label: 'Teacher', render: (r) => r.teacher?.name },
          { key: 'room', label: 'Room / link', render: (r) => r.roomOrLink || '—' },
        ]}
        rows={schedules}
        emptyLabel="No class timings set yet."
      />
    </div>
  );
};

export default StudentSchedule;
