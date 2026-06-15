import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import ScheduleRoomOrLink from '../shared/ScheduleRoomOrLink';
import { formatTime12h } from '../../../utils/formatTime12h';
import './StudentSchedule.scss';

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
    <div className="portal-page student-schedule">
      <PortalPageHeader
        title="Classes schedules"
        subtitle="Your class timings and meeting links for enrolled courses."
      />

      <div className="student-schedule__hero">
        <div className="student-schedule__hero-icon" aria-hidden="true">
          <i className="fa-solid fa-calendar-week" />
        </div>
        <div>
          <h2>Your class timetable</h2>
          <p>
            {schedules.length
              ? `${schedules.length} class${schedules.length === 1 ? '' : 'es'} scheduled. Click Join meeting to open class links.`
              : 'No class timeslot assigned yet. Admin will assign your class schedule after enrollment.'}
          </p>
        </div>
      </div>

      <div className="student-schedule__table-panel">
        {schedules.length === 0 ? (
          <p className="student-schedule__empty">No class timeslot assigned yet. Contact the academy if you expect a schedule.</p>
        ) : (
          <table className="student-schedule__table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Time</th>
                <th>Course</th>
                <th>Teacher</th>
                <th>Room / link</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((r) => (
                <tr key={r._id}>
                  <td>
                    <span className="student-schedule__day-badge">
                      {dayLabels[r.dayOfWeek] || r.dayOfWeek}
                    </span>
                  </td>
                  <td className="student-schedule__time">
                    {formatTime12h(r.startTime)} – {formatTime12h(r.endTime)}
                  </td>
                  <td className="student-schedule__course">{r.course?.title || '—'}</td>
                  <td className="student-schedule__teacher">{r.teacher?.name || '—'}</td>
                  <td>
                    <ScheduleRoomOrLink value={r.roomOrLink} className="student-schedule__join" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StudentSchedule;
