import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import ScheduleRoomOrLink from '../shared/ScheduleRoomOrLink';
import { formatTime12h } from '../../../utils/formatTime12h';
import '../student/StudentSchedule.scss';

const ParentSchedule = () => {
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [schedules, setSchedules] = useState(null);
  const [dayLabels, setDayLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  useEffect(() => {
    portalGet('/parent/children')
      .then((res) => {
        if (res.success) {
          const list = res.children || [];
          setChildren(list);
          if (list[0]?.student?._id) setSelectedId(list[0].student._id);
        } else setError(res.error || 'Failed to load children');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSchedules([]);
      setScheduleError('');
      return;
    }
    setScheduleLoading(true);
    setScheduleError('');
    setSchedules(null);
    portalGet(`/parent/children/${selectedId}/schedule`)
      .then((res) => {
        if (res.success) {
          setSchedules(res.schedules || []);
          setDayLabels(res.dayLabels || []);
        } else {
          setSchedules([]);
          setScheduleError(res.error || 'Failed to load schedule');
        }
      })
      .catch((err) => {
        setSchedules([]);
        setScheduleError(err.message || 'Failed to load schedule');
      })
      .finally(() => setScheduleLoading(false));
  }, [selectedId]);

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }

  const selectedChild = children.find((c) => String(c.student?._id) === String(selectedId));

  return (
    <div className="portal-page student-schedule">
      <PortalPageHeader
        title="Class Schedules"
        subtitle="Read-only view of each child’s assigned course, teacher, and class times."
      />

      {children.length === 0 ? (
        <p className="student-schedule__empty">No children linked to your account yet.</p>
      ) : (
        <>
          <div className="portal-child-tabs">
            {children.map((link) => {
              const id = link.student?._id;
              if (!id) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className={selectedId === id ? 'active' : ''}
                  onClick={() => setSelectedId(id)}
                >
                  {link.student?.name}
                </button>
              );
            })}
          </div>

          <div className="student-schedule__hero">
            <div className="student-schedule__hero-icon" aria-hidden="true">
              <i className="fa-solid fa-calendar-week" />
            </div>
            <div>
              <h2>
                {selectedChild?.student?.name
                  ? `${selectedChild.student.name}'s timetable`
                  : 'Class timetable'}
              </h2>
              <p>
                {scheduleLoading || schedules === null
                  ? 'Loading…'
                  : schedules.length
                    ? `${schedules.length} class${schedules.length === 1 ? '' : 'es'} scheduled.`
                    : 'No class timeslot assigned yet for this child.'}
              </p>
            </div>
          </div>

          {scheduleError ? <PortalAlert type="error">{scheduleError}</PortalAlert> : null}

          <div className="student-schedule__table-panel">
            {scheduleLoading || schedules === null ? (
              <PortalLoading />
            ) : schedules.length === 0 ? (
              <p className="student-schedule__empty">
                No class timeslot assigned yet. The academy assigns a slot when enrolling.
              </p>
            ) : (
              <table className="student-schedule__table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Course</th>
                    <th>Teacher</th>
                    <th>Room / Link</th>
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
        </>
      )}
    </div>
  );
};

export default ParentSchedule;
