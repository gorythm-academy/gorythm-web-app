import React, { useMemo } from 'react';
import './ScheduleWeekView.scss';

const DEFAULT_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Weekly schedule grid grouped by day (0 = Sunday).
 */
export function ScheduleWeekView({ schedules = [], dayLabels = DEFAULT_DAYS }) {
  const labels = dayLabels.length >= 7 ? dayLabels : DEFAULT_DAYS;

  const byDay = useMemo(() => {
    const map = {};
    for (let d = 0; d < 7; d += 1) map[d] = [];
    for (const s of schedules) {
      const d = Number(s.dayOfWeek);
      if (d >= 0 && d <= 6) map[d].push(s);
    }
    for (let d = 0; d < 7; d += 1) {
      map[d].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
    }
    return map;
  }, [schedules]);

  const today = new Date().getDay();

  if (!schedules.length) {
    return <p className="schedule-week-empty">No class timings scheduled yet.</p>;
  }

  return (
    <div className="schedule-week" role="region" aria-label="Weekly class schedule">
      {labels.map((label, dayIndex) => {
        const items = byDay[dayIndex] || [];
        if (!items.length) return null;
        return (
          <section
            key={label}
            className={`schedule-week-day${dayIndex === today ? ' schedule-week-day--today' : ''}`}
          >
            <h3 className="schedule-week-day-title">
              {label}
              {dayIndex === today ? <span className="schedule-week-today">Today</span> : null}
            </h3>
            <ul className="schedule-week-list">
              {items.map((s) => (
                <li key={s._id} className="schedule-week-item">
                  <span className="schedule-week-time">
                    {s.startTime} – {s.endTime}
                  </span>
                  <span className="schedule-week-course">{s.course?.title || 'Course'}</span>
                  {s.teacher?.name ? (
                    <span className="schedule-week-meta">{s.teacher.name}</span>
                  ) : null}
                  {s.roomOrLink ? (
                    <span className="schedule-week-room">{s.roomOrLink}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default ScheduleWeekView;
