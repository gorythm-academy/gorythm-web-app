import { useMemo } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import { STUDENT_MARK_ATTENDANCE_STATUS_OPTIONS, statusChipClass } from '../../../constants/attendanceStatuses';
import { getAcademyWeekBounds, currentAcademyWeekMonday, getAcademyYearOptions, getAcademyMonthsInYear, getAcademyWeeksInMonth, todayLocalDateStr } from '../../../utils/academyWeek';

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const formatNameRoll = (name, rollNumber) => {
  if (!name || name === '—') return '—';
  return rollNumber ? `${name} (${rollNumber})` : name;
};

const ACADEMY_YEAR_OPTIONS = getAcademyYearOptions();

const WeekPicker = ({ weekStart, onWeekStartChange }) => {
  const { monday } = getAcademyWeekBounds(weekStart);
  const selectedYear = monday.slice(0, 4);
  const selectedMonth = monday.slice(0, 7);

  const yearOptions = useMemo(() => {
    if (ACADEMY_YEAR_OPTIONS.some((opt) => opt.value === selectedYear)) {
      return ACADEMY_YEAR_OPTIONS;
    }
    return [...ACADEMY_YEAR_OPTIONS, { value: selectedYear, label: selectedYear }].sort((a, b) =>
      a.value.localeCompare(b.value)
    );
  }, [selectedYear]);

  const monthOptions = useMemo(() => {
    const months = getAcademyMonthsInYear(selectedYear);
    if (months.some((opt) => opt.value === selectedMonth)) return months;
    const [, monthPart] = selectedMonth.split('-');
    const monthNum = Number(monthPart);
    if (!monthNum) return months;
    const label = new Date(Number(selectedYear), monthNum - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
    });
    return [...months, { value: selectedMonth, label }].sort((a, b) =>
      a.value.localeCompare(b.value)
    );
  }, [selectedYear, selectedMonth]);

  const weeksInMonth = useMemo(() => getAcademyWeeksInMonth(selectedMonth), [selectedMonth]);

  const selectWeekForMonth = (monthKey, preferredMonday = monday) => {
    const weeks = getAcademyWeeksInMonth(monthKey);
    if (!weeks.length) return;
    const currentMonday = currentAcademyWeekMonday();
    if (monthKey === currentMonday.slice(0, 7)) {
      const currentWeek = weeks.find((w) => w.monday === currentMonday);
      if (currentWeek) {
        onWeekStartChange(currentWeek.monday);
        return;
      }
    }
    const keepWeek = weeks.find((w) => w.monday === preferredMonday);
    onWeekStartChange(keepWeek ? keepWeek.monday : weeks[0].monday);
  };

  const handleYearChange = (year) => {
    const months = getAcademyMonthsInYear(year);
    if (!months.length) return;
    const currentMonday = currentAcademyWeekMonday();
    const currentYear = currentMonday.slice(0, 4);
    const currentMonth = currentMonday.slice(0, 7);
    if (year === currentYear && months.some((m) => m.value === currentMonth)) {
      selectWeekForMonth(currentMonth, currentMonday);
      return;
    }
    const [, monthPart] = selectedMonth.split('-');
    const sameMonth = months.find((m) => m.value.endsWith(`-${monthPart}`));
    selectWeekForMonth(sameMonth ? sameMonth.value : months[0].value);
  };

  return (
    <div className="portal-week-picker-fields">
      <label className="portal-field-label portal-field-label--calendar">
        <span>Year</span>
        <select
          value={selectedYear}
          onChange={(e) => handleYearChange(e.target.value)}
          aria-label="Attendance report year"
        >
          {yearOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="portal-field-label portal-field-label--calendar">
        <span>Month</span>
        <select
          value={selectedMonth}
          onChange={(e) => selectWeekForMonth(e.target.value)}
          aria-label="Attendance report month"
          disabled={!monthOptions.length}
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="portal-field-label portal-field-label--calendar">
        <span>Week</span>
        <select
          value={monday}
          onChange={(e) => onWeekStartChange(e.target.value)}
          aria-label="Week of month"
          disabled={!weeksInMonth.length}
        >
          {weeksInMonth.map((week, index) => (
            <option key={week.monday} value={week.monday}>
              Week {index + 1}: {week.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

const PeriodToggle = ({ value, onChange }) => (
  <div className="portal-attendance-period-tabs" role="tablist" aria-label="Attendance period">
    {PERIOD_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        role="tab"
        aria-selected={value === opt.value}
        className={value === opt.value ? 'is-active' : ''}
        onClick={() => onChange(opt.value)}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export function TeacherAttendanceView({ state }) {
  const {
    coursesLoadError,
    msg,
    submitAttendance,
    courseId,
    setCourseId,
    courses,
    date,
    setDate,
    markDateIsFuture,
    markDateIsSunday,
    dayAlreadyMarked,
    markDateLabel,
    markedStudentsCount,
    roster,
    canMarkOnDate,
    rosterCount,
    daySummary,
    marks,
    setMarks,
    notes,
    setNotes,
    saveNotice,
    viewCourseId,
    viewPeriod,
    viewDate,
    periodLabel,
    rosterError,
    viewError,
    setViewCourseId,
    handleWeekStartChange,
    setViewDate,
    handleViewPeriodChange,
    summaryRows,
    periodKpis,
    periodMeta,
    showReportRecords,
    deletableRecordIds,
    selectAllRecordsRef,
    allRecordsSelected,
    toggleSelectAllRecords,
    selectedRecordIds,
    deleteSelectedRecords,
    viewLoading,
    summaryTableCols,
    dailyRows,
    toggleRecordSelection,
    openEditRecord,
    deleteRecord,
    expandedStudentId,
    studentDetailRecords,
    toggleStudentDetails,
    editRecord,
    setEditRecord,
    saveEditRecord,
    editForm,
    setEditForm,
    studentKey,
  } = state;

  return (
<div className="portal-page portal-teacher-attendance student-attendance">
      <PortalPageHeader
        title="Students Attendance"
        subtitle="Mark daily attendance, then review records by day, week, or month."
      />

      <div className="student-attendance__hero">
        <div className="student-attendance__hero-icon" aria-hidden="true">
          <i className="fas fa-user-check" />
        </div>
        <div>
          <h2>Course Attendance</h2>
          <p>Select a course and a date, then mark the class. Review daily, weekly, or monthly records below.</p>
        </div>
      </div>

      {coursesLoadError ? <PortalAlert type="error">{coursesLoadError}</PortalAlert> : null}
      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}

      <section className="student-attendance__panel">
      <form className="portal-form-card portal-attendance-mark-form" onSubmit={submitAttendance} autoComplete="off">
        <h3>Mark Attendance</h3>

        <div className="portal-attendance-filter-bar">
          <label className="portal-field-label portal-field-label--course">
            <span>Course <RequiredMark /></span>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
              <option value="">Select Course</option>
              {courses.map((c) => (
                <option key={portalDocId(c)} value={portalDocId(c)}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>

          <label className="portal-field-label portal-field-label--calendar">
            <span>Attendance Date <RequiredMark /></span>
            <input
              type="date"
              value={date}
              max={todayLocalDateStr()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        </div>

        {markDateIsFuture ? (
          <PortalAlert type="info">
            Attendance cannot be marked for upcoming dates. Choose today or an earlier date.
          </PortalAlert>
        ) : null}

        {markDateIsSunday ? (
          <PortalAlert type="info">
            Sunday is the academy weekend. Student attendance cannot be marked on this day. Choose Monday–Saturday
            to mark attendance, or use the report below to review past records.
          </PortalAlert>
        ) : null}

        {dayAlreadyMarked ? (
          <PortalAlert type="info">
            Attendance is already marked for {markDateLabel}
            {markedStudentsCount < roster.length
              ? ` (${markedStudentsCount} of ${roster.length} students).`
              : '.'}{' '}
            Update statuses below and save to change records.
          </PortalAlert>
        ) : null}

        {courseId && roster.length && canMarkOnDate ? (
          <p className="portal-attendance-roster-count">
            <i className="fas fa-users" aria-hidden="true" /> {rosterCount} active student
            {rosterCount === 1 ? '' : 's'} on course roster
          </p>
        ) : null}

        {roster.length && canMarkOnDate ? (
          <div className="portal-attendance-day-summary">
            <span className="portal-attendance-chip portal-attendance-chip--present">
              Present: {daySummary.present}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--absent">
              Absent: {daySummary.absent}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--late">
              Late: {daySummary.late}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--leave">
              Leave: {daySummary.leave}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--holiday">
              Holiday: {daySummary.holiday}
            </span>
          </div>
        ) : null}

        {roster.length && canMarkOnDate ? (
          <>
            <div className="portal-attendance-grid-header">
              <span>Student Name</span>
              <span>Status</span>
              <span>Notes (Optional)</span>
            </div>
            <div className="portal-attendance-grid">
              {roster.map((s) => {
                const sid = portalDocId(s);
                return (
                  <div key={sid} className="portal-attendance-row portal-attendance-row--cols">
                    <span className="portal-attendance-student-name">
                      {formatNameRoll(s.name, s.studentId)}
                    </span>
                    <fieldset
                      className="portal-attendance-status-radio-group"
                      aria-label={`Status for ${s.name}`}
                    >
                      {STUDENT_MARK_ATTENDANCE_STATUS_OPTIONS.map((o) => {
                        const checked = (marks[sid] || 'present') === o.value;
                        return (
                          <label
                            key={o.value}
                            className={`portal-attendance-status-radio portal-attendance-status-radio--${o.value}${
                              checked ? ' is-active' : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name={`status-${sid}`}
                              value={o.value}
                              checked={checked}
                              onChange={() => setMarks({ ...marks, [sid]: o.value })}
                            />
                            {o.label}
                          </label>
                        );
                      })}
                    </fieldset>
                    <input
                      type="text"
                      aria-label={`Notes for ${s.name}`}
                      placeholder="Note (Optional)"
                      value={notes[sid] || ''}
                      onChange={(e) => setNotes({ ...notes, [sid]: e.target.value })}
                    />
                  </div>
                );
              })}
            </div>
          </>
        ) : markDateIsFuture && courseId ? (
          <p className="portal-empty">Marking is disabled for future dates.</p>
        ) : markDateIsSunday && courseId ? (
          <p className="portal-empty">Marking is disabled on Sunday.</p>
        ) : courseId ? (
          <p className="portal-empty">No active students on this course yet.</p>
        ) : (
          <p className="portal-empty">Select a course to load students.</p>
        )}

        <button type="submit" disabled={!courseId || !roster.length || !canMarkOnDate}>
          Save Daily Attendance for Entire Class
        </button>
        {saveNotice ? (
          <p className="portal-attendance-save-success" role="status" aria-live="polite">
            {saveNotice}
          </p>
        ) : null}
      </form>

      <section className="portal-content-section portal-attendance-report-section">
        <h2 className="portal-content-section-title">Attendance Report</h2>
        <p className="portal-attendance-report-hint">
          {!viewCourseId
            ? 'Select a course to view attendance records.'
            : viewPeriod === 'daily' && !String(viewDate || '').trim()
              ? 'Select a date to view attendance for that day.'
              : periodLabel || 'Select a course to view attendance records.'}
        </p>
        {rosterError ? <PortalAlert type="error">{rosterError}</PortalAlert> : null}
        {viewError ? <PortalAlert type="error">{viewError}</PortalAlert> : null}

        <div className="portal-attendance-filter-bar">
          <label className="portal-field-label portal-field-label--course">
            <span>Course</span>
            <select value={viewCourseId} onChange={(e) => setViewCourseId(e.target.value)}>
              <option value="">Select Course</option>
              {courses.map((c) => (
                <option key={portalDocId(c)} value={portalDocId(c)}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          {viewPeriod === 'weekly' ? (
            <WeekPicker weekStart={viewDate} onWeekStartChange={handleWeekStartChange} />
          ) : (
            <label className="portal-field-label portal-field-label--calendar">
              <span>{viewPeriod === 'monthly' ? 'Month' : 'Date'}</span>
              <input
                type={viewPeriod === 'monthly' ? 'month' : 'date'}
                value={viewPeriod === 'monthly' ? viewDate.slice(0, 7) : viewDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setViewDate(viewPeriod === 'monthly' ? `${next}-01` : next);
                }}
              />
            </label>
          )}
          <PeriodToggle value={viewPeriod} onChange={handleViewPeriodChange} />
        </div>

        {viewCourseId && summaryRows.length ? (
          <div className="portal-attendance-day-summary portal-attendance-period-kpis">
            <span className="portal-attendance-chip portal-attendance-chip--present">
              Present: {periodKpis.present}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--absent">
              Absent: {periodKpis.absent}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--late">
              Late: {periodKpis.late}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--leave">
              Leave: {periodKpis.leave}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--holiday">
              Holiday: {periodKpis.holiday}
            </span>
            {viewPeriod === 'monthly' && periodMeta.weekendDaysInPeriod != null ? (
              <span className="portal-attendance-chip portal-attendance-chip--weekend">
                Weekend days: {periodMeta.weekendDaysInPeriod}
              </span>
            ) : null}
          </div>
        ) : null}

        {showReportRecords && deletableRecordIds.length ? (
          <div className="portal-attendance-records-toolbar">
            <label className="portal-attendance-check portal-attendance-check--header">
              <input
                ref={selectAllRecordsRef}
                type="checkbox"
                checked={allRecordsSelected}
                onChange={toggleSelectAllRecords}
                aria-label="Select all attendance records in this period"
              />
              <span>
                Select All ({deletableRecordIds.length})
              </span>
            </label>
            {selectedRecordIds.length ? (
              <button
                type="button"
                className="portal-btn-danger"
                onClick={deleteSelectedRecords}
              >
                Delete selected ({selectedRecordIds.length})
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="portal-attendance-records-table-wrap">
          <table className="portal-attendance-records-table">
            <thead>
              <tr>
                {viewPeriod === 'daily' ? (
                  <th className="portal-attendance-records-table__check" aria-label="Select" />
                ) : null}
                <th>Student</th>
                {viewPeriod === 'daily' ? (
                  <>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </>
                ) : (
                  <>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Late</th>
                    <th>Leave</th>
                    <th>Total</th>
                    <th aria-label="Details" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {viewLoading ? (
                <tr>
                  <td colSpan={summaryTableCols} className="portal-empty-cell">
                    Loading…
                  </td>
                </tr>
              ) : !viewCourseId ? (
                <tr>
                  <td colSpan={summaryTableCols} className="portal-empty-cell">
                    Select a course to view attendance.
                  </td>
                </tr>
              ) : viewPeriod === 'daily' && !String(viewDate || '').trim() ? (
                <tr>
                  <td colSpan={summaryTableCols} className="portal-empty-cell">
                    Select a date to view attendance.
                  </td>
                </tr>
              ) : viewPeriod === 'daily' ? (
                dailyRows.length ? (
                  dailyRows.map((row) => {
                    const record = row.record;
                    const rowKey = studentKey(row.studentId);
                    const recordId = record ? portalDocId(record) : '';
                    const isSelected = recordId && selectedRecordIds.includes(recordId);
                    return (
                      <tr key={rowKey} className={isSelected ? 'is-selected' : ''}>
                        <td className="portal-attendance-records-table__check">
                          {record ? (
                            <label className="portal-attendance-check">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleRecordSelection(recordId)}
                                aria-label={`Select attendance for ${row.name}`}
                              />
                            </label>
                          ) : null}
                        </td>
                        <td>{formatNameRoll(row.name, row.rollNumber)}</td>
                        <td>
                          {record ? (
                            <span className={`portal-attendance-chip ${statusChipClass(record.status)}`}>
                              {record.status}
                            </span>
                          ) : (
                            <span className="portal-attendance-chip portal-attendance-chip--muted">
                              Not marked
                            </span>
                          )}
                        </td>
                        <td>{record?.notes || '—'}</td>
                        <td>
                          {record ? (
                            <span className="portal-table-actions">
                              <button
                                type="button"
                                className="portal-btn-link"
                                onClick={() => openEditRecord(record)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="portal-btn-link portal-btn-link--danger"
                                onClick={() => deleteRecord(record)}
                              >
                                Delete
                              </button>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={summaryTableCols} className="portal-empty-cell">
                      No active students on this course.
                    </td>
                  </tr>
                )
              ) : summaryRows.length ? (
                summaryRows.flatMap((row) => {
                  const sid = studentKey(row.studentId);
                  const isExpanded = expandedStudentId === sid;
                  const details = studentDetailRecords(sid);
                  const mainRow = (
                    <tr key={sid}>
                      <td>{formatNameRoll(row.name, row.rollNumber)}</td>
                      <td>{row.present}</td>
                      <td>{row.absent}</td>
                      <td>{row.late}</td>
                      <td>{row.leave}</td>
                      <td>{row.total}</td>
                      <td>
                        <button
                          type="button"
                          className={`portal-attendance-details-btn${
                            isExpanded ? ' is-expanded' : ''
                          }`}
                          onClick={() => toggleStudentDetails(row.studentId)}
                          aria-expanded={isExpanded}
                        >
                          <i
                            className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-list-ul'}`}
                            aria-hidden="true"
                          />
                          {isExpanded ? 'Hide details' : 'Details'}
                        </button>
                      </td>
                    </tr>
                  );
                  if (!isExpanded) return [mainRow];
                  const detailRow = (
                    <tr key={`${sid}-details`} className="portal-attendance-detail-row">
                      <td colSpan={summaryTableCols}>
                        {details.length ? (
                          <div className="portal-attendance-detail-panel">
                            <div className="portal-attendance-detail-list-header">
                              <span>Select</span>
                              <span>Date</span>
                              <span>Status</span>
                              <span>Actions</span>
                            </div>
                            <ul className="portal-attendance-detail-list portal-attendance-detail-list--compact">
                              {details.map((r) => {
                                const detailId = portalDocId(r);
                                const detailSelected =
                                  detailId && selectedRecordIds.includes(detailId);
                                const dateLabel = new Date(r.date).toLocaleDateString(undefined, {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                });
                                return (
                                  <li
                                    key={detailId}
                                    className={detailSelected ? 'is-selected' : ''}
                                  >
                                    <label className="portal-attendance-check">
                                      <input
                                        type="checkbox"
                                        checked={detailSelected}
                                        onChange={() => toggleRecordSelection(detailId)}
                                        aria-label={`Select attendance on ${dateLabel}`}
                                      />
                                    </label>
                                    <span className="portal-attendance-detail-date">{dateLabel}</span>
                                    <span
                                      className={`portal-attendance-chip ${statusChipClass(r.status)}`}
                                    >
                                      {r.status}
                                    </span>
                                    <span className="portal-table-actions portal-attendance-detail-actions">
                                      <button
                                        type="button"
                                        className="portal-btn-link"
                                        onClick={() => openEditRecord(r)}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="portal-btn-link portal-btn-link--danger"
                                        onClick={() => deleteRecord(r)}
                                      >
                                        Delete
                                      </button>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : (
                          <p className="portal-empty">No daily records in this period.</p>
                        )}
                      </td>
                    </tr>
                  );
                  return [mainRow, detailRow];
                })
              ) : (
                <tr>
                  <td colSpan={summaryTableCols} className="portal-empty-cell">
                    No active students on this course.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </section>

      {editRecord ? (
        <div
          className="portal-attendance-modal-backdrop"
          role="presentation"
          onClick={() => setEditRecord(null)}
        >
          <form
            className="portal-attendance-modal"
            onSubmit={saveEditRecord}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="portal-attendance-modal__head">
              <div className="portal-attendance-modal__icon" aria-hidden="true">
                <i className="fas fa-user-edit" />
              </div>
              <div>
                <h3>Edit Attendance</h3>
                <p>{editRecord.student?.name}</p>
                <small>
                  {editRecord.course?.title} · {new Date(editRecord.date).toLocaleDateString()}
                </small>
              </div>
              <button
                type="button"
                className="portal-attendance-modal__close"
                aria-label="Close"
                onClick={() => setEditRecord(null)}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="portal-attendance-modal__status-grid">
              {STUDENT_MARK_ATTENDANCE_STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`portal-attendance-modal__status-btn ${
                    editForm.status === o.value ? 'is-active' : ''
                  }`}
                  onClick={() => setEditForm((f) => ({ ...f, status: o.value }))}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="portal-field-label">
              <span>Notes</span>
              <textarea
                rows={3}
                placeholder="Optional note for this record"
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <div className="portal-attendance-modal__actions">
              <button type="submit" className="portal-attendance-modal__save">
                <i className="fas fa-save" /> Save Changes
              </button>
              <button
                type="button"
                className="portal-btn-secondary"
                onClick={() => setEditRecord(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
