import React, { useEffect, useState } from 'react';
import { portalGet, readPortalCache } from '../shared/portalApi';
import { PortalDataSection, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { StudentIdLine } from '../shared/StudentIdentity';
import PortalScheduleTable from '../shared/PortalScheduleTable';
import '../student/StudentSchedule.scss';

const ParentSchedule = () => {
  const [children, setChildren] = useState(() => readPortalCache('/parent/children')?.children || []);
  const [selectedId, setSelectedId] = useState(
    () => readPortalCache('/parent/children')?.children?.[0]?.student?._id || ''
  );
  const [timetable, setTimetable] = useState(null);
  const [dayLabels, setDayLabels] = useState([]);
  const [loading, setLoading] = useState(() => !readPortalCache('/parent/children'));
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
      setTimetable([]);
      setScheduleError('');
      return;
    }
    const schedulePath = `/parent/children/${selectedId}/schedule`;
    const cachedSchedule = readPortalCache(schedulePath);
    if (cachedSchedule) {
      setTimetable(cachedSchedule.timetable || []);
      setDayLabels(cachedSchedule.dayLabels || []);
      setScheduleLoading(false);
    } else {
      setScheduleLoading(true);
      setTimetable(null);
    }
    setScheduleError('');
    portalGet(schedulePath)
      .then((res) => {
        if (res.success) {
          setTimetable(res.timetable || []);
          setDayLabels(res.dayLabels || []);
        } else {
          setTimetable([]);
          setScheduleError(res.error || 'Failed to load schedule');
        }
      })
      .catch((err) => {
        setTimetable([]);
        setScheduleError(err.message || 'Failed to load schedule');
      })
      .finally(() => setScheduleLoading(false));
  }, [selectedId]);

  const selectedChild = children.find((c) => String(c.student?._id) === String(selectedId));
  const rows = timetable || [];
  const paidRows = rows.filter((row) => !row.feeLocked);
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
          <h2>Family timetables</h2>
          <p>Select a child to view their class days, times, and room or meeting link.</p>
        </div>
      </div>

      <PortalDataSection loading={loading} error={error} loadingLabel="Loading children…">
        {children.length === 0 ? (
          <p className="student-schedule__empty">No children are linked to this account yet. Please contact the academy to connect your child's profile.</p>
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
                {selectedChild ? <StudentIdLine studentId={selectedChild.student?.studentId} /> : null}
                <p>
                  {scheduleLoading || timetable === null
                    ? 'Loading class schedule…'
                    : rows.length
                      ? `${paidRows.length} paid course${paidRows.length === 1 ? '' : 's'}${
                          unpaidCount ? `. ${unpaidCount} waiting for the fee.` : '.'
                        }`
                      : 'Class times will appear here after the academy adds a course for this child.'}
                </p>
              </div>
            </div>

            {scheduleError ? <PortalAlert type="error">{scheduleError}</PortalAlert> : null}

            <div className="student-schedule__table-panel">
              {scheduleLoading || timetable === null ? (
                <PortalDataSection loading loadingLabel="Loading schedule…" />
              ) : rows.length === 0 ? (
                <p className="student-schedule__empty">
                  Class times will appear here after the academy adds a course for this child.
                </p>
              ) : (
                <PortalScheduleTable rows={rows} dayLabels={dayLabels} feesPath="/parent/billing" />
              )}
            </div>
          </>
        )}
      </PortalDataSection>
    </div>
  );
};

export default ParentSchedule;
