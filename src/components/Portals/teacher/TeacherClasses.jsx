import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { formatTime12h } from '../../../utils/formatTime12h';
import ScheduleRoomOrLink from '../shared/ScheduleRoomOrLink';
import './TeacherClasses.scss';

const TeacherClasses = () => {
  const [schedules, setSchedules] = useState(null);
  const [dayLabels, setDayLabels] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/teacher/schedule')
      .then((res) => {
        if (res.success) {
          setSchedules(res.schedules || []);
          setDayLabels(res.dayLabels || []);
        } else setError(res.error || 'Failed to load schedule');
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
    <div className="portal-page teacher-classes">
      <PortalPageHeader
        title="My classes"
        subtitle="View your class schedule for assigned courses."
      />

      <div className="portal-hero portal-hero--teacher">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-chalkboard" />
        </div>
        <div>
          <h2>Weekly class schedule</h2>
          <p>
            Admin sets your course timings here. Use Attendance to mark students, Assignments and Resources for
            homework, and Quizzes for assessments.
          </p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Class schedule</h2>
            <p>
              {schedules.length
                ? `${schedules.length} class${schedules.length === 1 ? '' : 'es'} this week`
                : 'No timings set yet'}
            </p>
          </div>
        </div>
        <div className="portal-panel__body">
          {schedules.length === 0 ? (
            <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
              No class timings set yet. Ask admin to add schedules in LMS.
            </p>
          ) : (
            <div className="portal-data-table-wrap">
              <table className="portal-data-table teacher-classes__table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Course</th>
                    <th>Room / link</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <span className="teacher-classes__day-badge">
                          {dayLabels[r.dayOfWeek] || r.dayOfWeek}
                        </span>
                      </td>
                      <td className="teacher-classes__time">
                        {formatTime12h(r.startTime)} – {formatTime12h(r.endTime)}
                      </td>
                      <td className="teacher-classes__course">{r.course?.title || '—'}</td>
                      <td>
                        <ScheduleRoomOrLink value={r.roomOrLink} className="teacher-classes__join" />
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

export default TeacherClasses;
