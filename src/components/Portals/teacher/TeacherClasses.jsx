import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet, readPortalCache } from '../shared/portalApi';
import { PortalDataSection, PortalPageHeader } from '../shared/PortalUi';
import { formatTime12h } from '../../../utils/formatTime12h';
import ScheduleRoomOrLink from '../shared/ScheduleRoomOrLink';
import { portalDocId } from '../../../utils/portalDocId';
import './TeacherClasses.scss';

const TeacherClasses = () => {
  const [schedules, setSchedules] = useState(() => {
    const cached = readPortalCache('/teacher/schedule');
    return cached ? (cached.schedules || []) : null;
  });
  const [dayLabels, setDayLabels] = useState(() => readPortalCache('/teacher/schedule')?.dayLabels || []);
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

  const loading = schedules === null;
  const rows = schedules || [];

  return (
    <div className="portal-page teacher-classes">
      <PortalPageHeader
        title="My Classes"
        subtitle="View your class schedule for assigned courses."
      />

      <div className="portal-hero portal-hero--teacher">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-chalkboard" />
        </div>
        <div>
          <h2>Weekly Class Schedule</h2>
          <p>
            Admin sets your course timings here. Use "Take attendance" on a class to jump straight to that
            course in Attendance, or use Assignments, Resources, and Quizzes for coursework.
          </p>
        </div>
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Class Schedule</h2>
            <p>
              {loading
                ? 'Loading your weekly classes…'
                : rows.length
                  ? `${rows.length} class${rows.length === 1 ? '' : 'es'} this week`
                  : 'No timings set yet'}
            </p>
          </div>
        </div>
        <div className="portal-panel__body">
          <PortalDataSection loading={loading} error={error} loadingLabel="Loading class schedule…">
            {rows.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                No class timings are listed yet. Please contact the academy to add your class times.
              </p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table teacher-classes__table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Time</th>
                      <th>Course</th>
                      <th>Room / Link</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const courseId = portalDocId(r.course);
                      return (
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
                          <td>
                            {courseId ? (
                              <Link
                                to={`/teacher/attendance?course=${courseId}`}
                                className="teacher-classes__attendance-link"
                              >
                                <i className="fas fa-user-check" aria-hidden="true" /> Take attendance
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PortalDataSection>
        </div>
      </div>
    </div>
  );
};

export default TeacherClasses;
