import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalDataSection, PortalPageHeader } from '../shared/PortalUi';
import PortalScheduleTable from '../shared/PortalScheduleTable';
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

  const loading = timetable === null;
  const rows = timetable || [];
  const paidRows = rows.filter((row) => !row.feeLocked);
  const slottedCount = paidRows.filter((row) => row.hasTimeslot).length;
  const unpaidCount = rows.length - paidRows.length;

  return (
    <div className="portal-page student-schedule">
      <PortalPageHeader
        title="Class Schedules"
        subtitle="Paid courses show class times. Unpaid courses stay listed until the fee is received."
      />

      <div className="student-schedule__hero">
        <div className="student-schedule__hero-icon" aria-hidden="true">
          <i className="fa-solid fa-calendar-week" />
        </div>
        <div>
          <h2>Weekly Timetable</h2>
          <p>
            {loading
              ? 'Loading class times…'
              : rows.length
                ? `${paidRows.length} paid course${paidRows.length === 1 ? '' : 's'}${
                    slottedCount ? `, ${slottedCount} with a class time` : ''
                  }${unpaidCount ? `. ${unpaidCount} waiting for the fee.` : '.'}`
                : 'Your class timetable will appear here after a course is added.'}
          </p>
        </div>
      </div>

      <div className="student-schedule__table-panel">
        <PortalDataSection loading={loading} error={error} loadingLabel="Loading schedule…">
          {rows.length === 0 ? (
            <p className="student-schedule__empty">
              Your class timetable will appear here after a course is added.
            </p>
          ) : (
            <PortalScheduleTable rows={rows} dayLabels={dayLabels} feesPath="/student/fees" />
          )}
        </PortalDataSection>
      </div>
    </div>
  );
};

export default StudentSchedule;
