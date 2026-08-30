import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import ScheduleRoomOrLink from '../shared/ScheduleRoomOrLink';
import { formatTime12h } from '../../../utils/formatTime12h';
import './StudentSchedule.scss';

const StudentSchedule = () => {
  const [timetable, setTimetable] = useState(null);
  const [dayLabels, setDayLabels] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/schedule')
      .then((res) => {
        if (res.success) {
          setTimetable(res.timetable || []);
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
  if (timetable === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  const slottedCount = timetable.filter((row) => row.hasTimeslot).length;

  return (
    <div className="portal-page student-schedule">
      <PortalPageHeader
        title="Class Schedules"
        subtitle="Paid enrollments only — same courses as your Fees tab when marked Paid."
      />

      <div className="student-schedule__hero">
        <div className="student-schedule__hero-icon" aria-hidden="true">
          <i className="fa-solid fa-calendar-week" />
        </div>
        <div>
          <h2>Weekly Timetable</h2>
          <p>
            {timetable.length
              ? `${timetable.length} paid course${timetable.length === 1 ? '' : 's'}. ${slottedCount} with a class timeslot assigned.`
              : 'No paid enrollments yet. Courses appear here once fee status is Paid in Fees.'}
          </p>
        </div>
      </div>

      <div className="student-schedule__table-panel">
        {timetable.length === 0 ? (
          <p className="student-schedule__empty">
            No paid courses yet. After your fee is marked Paid, your class schedule will appear here.
          </p>
        ) : (
          <table className="student-schedule__table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Day</th>
                <th>Time</th>
                <th>Teacher</th>
                <th>Room / Link</th>
              </tr>
            </thead>
            <tbody>
              {timetable.map((row) => (
                <tr key={row.enrollmentId || row.course?._id}>
                  <td className="student-schedule__course">{row.course?.title || '—'}</td>
                  <td>
                    {row.hasTimeslot && row.schedule ? (
                      <span className="student-schedule__day-badge">
                        {dayLabels[row.schedule.dayOfWeek] || row.schedule.dayOfWeek}
                      </span>
                    ) : (
                      <span className="student-schedule__no-slot">No slot assigned yet</span>
                    )}
                  </td>
                  <td className="student-schedule__time">
                    {row.hasTimeslot && row.schedule ? (
                      <>
                        {formatTime12h(row.schedule.startTime)} – {formatTime12h(row.schedule.endTime)}
                      </>
                    ) : (
                      <span className="student-schedule__no-slot">—</span>
                    )}
                  </td>
                  <td className="student-schedule__teacher">{row.schedule?.teacher?.name || '—'}</td>
                  <td>
                    {row.hasTimeslot && row.schedule?.roomOrLink ? (
                      <ScheduleRoomOrLink value={row.schedule.roomOrLink} className="student-schedule__join" />
                    ) : (
                      '—'
                    )}
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
