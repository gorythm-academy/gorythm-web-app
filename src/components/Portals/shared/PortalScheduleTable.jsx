import React from 'react';
import { Link } from 'react-router-dom';
import ScheduleRoomOrLink from './ScheduleRoomOrLink';
import ScheduleClock, { useScheduleClock } from '../../shared/ScheduleClock';

function StudentSlotCells({ schedule, dayLabels }) {
  const clock = useScheduleClock(schedule, 'student');
  const day = clock?.primary.day || dayLabels[schedule.dayOfWeek] || schedule.dayOfWeek;
  return (
    <>
      <td>
        <span className="student-schedule__day-badge">{day}</span>
        {clock?.dayNote ? <span className="student-schedule__day-note">{clock.dayNote}</span> : null}
      </td>
      <td className="student-schedule__time">
        <ScheduleClock slot={schedule} audience="student" hideDay clock={clock} />
      </td>
    </>
  );
}

export default function PortalScheduleTable({ rows, dayLabels, feesPath = '/student/fees' }) {
  return (
    <div className="student-schedule__table-wrap">
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
          {rows.map((row) => (
            <tr
              key={row.enrollmentId || row.course?._id}
              className={row.feeLocked ? 'student-schedule__row--locked' : undefined}
            >
              <td className="student-schedule__course">{row.course?.title || '—'}</td>
              {row.feeLocked ? (
                <td colSpan={4} className="student-schedule__locked-note">
                  <i className="fas fa-lock" aria-hidden="true" /> Pay to unlock class time{' '}
                  <Link to={feesPath} className="student-schedule__locked-link">
                    Go to Fees →
                  </Link>
                </td>
              ) : row.hasTimeslot && row.schedule ? (
                <>
                  <StudentSlotCells schedule={row.schedule} dayLabels={dayLabels} />
                  <td className="student-schedule__teacher">{row.schedule?.teacher?.name || '—'}</td>
                  <td>
                    {row.schedule?.roomOrLink ? (
                      <ScheduleRoomOrLink value={row.schedule.roomOrLink} className="student-schedule__join" />
                    ) : (
                      '—'
                    )}
                  </td>
                </>
              ) : (
                <td colSpan={4}>
                  <span className="student-schedule__no-slot">Class time not set yet</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
