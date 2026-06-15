import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { portalGet, portalPost } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import {
  TEACHER_MY_STATUS_OPTIONS,
  statusCalendarLabel,
  statusChipClass,
} from '../../../constants/attendanceStatuses';
import {
  todayLocalDateStr,
  isFutureLocalDate,
  isAcademyWeekendDate,
  formatWeekdayName,
  getAcademyWeekBounds,
  formatAcademyWeekLabel,
  currentAcademyWeekMonday,
  getAcademyYearOptions,
  getAcademyMonthsInYear,
  getAcademyWeeksInMonth,
} from '../../../utils/academyWeek';
import './TeacherMyAttendance.scss';

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const ACADEMY_YEAR_OPTIONS = getAcademyYearOptions();

const formatDisplayDate = (isoDate) => {
  if (!isoDate) return '';
  try {
    return new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
};

const currentMonthKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const payrollStatusMeta = (record) => {
  if (!record || record.approvalStatus !== 'approved') return null;
  if (record.payrollMissingReason) {
    return { label: 'Payroll issue', className: 'portal-attendance-chip--absent', detail: record.payrollMissingReason };
  }
  const payroll = record.payroll;
  if (!payroll) {
    return { label: 'Payroll processing', className: 'portal-attendance-chip--muted', detail: null };
  }
  if (payroll.status === 'paid') {
    return {
      label: `Paid $${Number(payroll.finalSalary || 0).toFixed(2)}`,
      className: 'portal-attendance-chip--present',
      detail: payroll.paidAt ? `Paid on ${new Date(payroll.paidAt).toLocaleDateString()}` : null,
    };
  }
  if (payroll.status === 'stale') {
    return { label: 'Payroll updating', className: 'portal-attendance-chip--late', detail: null };
  }
  return {
    label: `Pending payment ($${Number(payroll.finalSalary || 0).toFixed(2)})`,
    className: 'portal-attendance-chip--holiday',
    detail: null,
  };
};

const countStatusTotals = (rows) => {
  const counts = { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, weekend: 0 };
  rows.forEach((r) => {
    if (counts[r.status] != null) counts[r.status] += 1;
  });
  return counts;
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
      <label className="portal-field-label">
        <span>Year</span>
        <select value={selectedYear} onChange={(e) => handleYearChange(e.target.value)}>
          {yearOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="portal-field-label">
        <span>Month</span>
        <select
          value={selectedMonth}
          onChange={(e) => selectWeekForMonth(e.target.value)}
          disabled={!monthOptions.length}
        >
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="portal-field-label">
        <span>Week</span>
        <select
          value={monday}
          onChange={(e) => onWeekStartChange(e.target.value)}
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

const SubmissionsTable = ({ rows, loading, emptyMessage }) => (
  <div className="portal-attendance-records-table-wrap">
    <table className="portal-attendance-records-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Status</th>
          <th>Notes</th>
          <th>Approval</th>
          <th>Submitted</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={5} className="portal-empty-cell">
              Loading…
            </td>
          </tr>
        ) : rows.length ? (
          rows.map((r) => (
            <tr key={r._id || r.date}>
              <td>
                <strong>{r.date}</strong>
                <br />
                <small>{formatWeekdayName(r.date)}</small>
              </td>
              <td>
                <span className={`portal-attendance-chip ${statusChipClass(r.status)}`}>
                  {statusCalendarLabel(r.status)}
                </span>
              </td>
              <td>{r.notes || '—'}</td>
              <td>
                <span className="portal-attendance-chip portal-attendance-chip--muted">
                  {r.approvalStatus || 'pending'}
                </span>
              </td>
              <td>
                {r.submittedAt
                  ? new Date(r.submittedAt).toLocaleString(undefined, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : '—'}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5} className="portal-empty-cell">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const TeacherMyAttendance = () => {
  const [monthlyRecords, setMonthlyRecords] = useState([]);
  const [dailySubmissions, setDailySubmissions] = useState([]);
  const [viewMonth, setViewMonth] = useState(currentMonthKey());
  const [calendarDays, setCalendarDays] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [status, setStatus] = useState('present');
  const [notes, setNotes] = useState('');
  const [existingForDay, setExistingForDay] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [reportPeriod, setReportPeriod] = useState('daily');
  const [reportDate, setReportDate] = useState(todayLocalDateStr());
  const [reportWeekStart, setReportWeekStart] = useState(currentAcademyWeekMonday());

  const monthRequestRef = useRef(0);
  const dayRequestRef = useRef(0);
  const hasInitialLoadRef = useRef(false);
  const saveNoticeTimerRef = useRef(null);

  const maxDate = todayLocalDateStr();
  const selectedDateIsFuture = isFutureLocalDate(selectedDate);
  const selectedDateIsSunday = isAcademyWeekendDate(selectedDate);

  const showSaveNotice = useCallback((text) => {
    setSaveNotice(text);
    if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
    saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(''), 5000);
  }, []);

  const syncViewMonthForDate = useCallback((dateStr) => {
    if (!dateStr) return;
    const dayMonth = dateStr.slice(0, 7);
    setViewMonth((prev) => (dayMonth && dayMonth !== prev ? dayMonth : prev));
  }, []);

  const loadMonthly = useCallback((month) => {
    const requestId = monthRequestRef.current + 1;
    monthRequestRef.current = requestId;
    if (hasInitialLoadRef.current) setLoadingMonth(true);
    else setLoading(true);
    setLoadError('');

    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    return portalGet(`/teacher/my-attendance${q}`)
      .then((res) => {
        if (requestId !== monthRequestRef.current) return;
        if (res.success) {
          setMonthlyRecords(res.monthlyRecords || []);
          setDailySubmissions(res.dailySubmissions || []);
          setCalendarDays(res.monthCalendar?.days || []);
          if (res.viewMonth) setViewMonth(res.viewMonth);
          setLoadError('');
        } else {
          setLoadError(res.error || 'Failed to load attendance');
        }
      })
      .catch((err) => {
        if (requestId !== monthRequestRef.current) return;
        setLoadError(err.message || 'Failed to load attendance');
      })
      .finally(() => {
        if (requestId !== monthRequestRef.current) return;
        setLoading(false);
        setLoadingMonth(false);
        hasInitialLoadRef.current = true;
      });
  }, []);

  const loadDayForDate = useCallback((dateStr, monthForQuery) => {
    if (!dateStr) {
      setExistingForDay(null);
      setStatus('present');
      setNotes('');
      return;
    }

    const requestId = dayRequestRef.current + 1;
    dayRequestRef.current = requestId;
    setLoadingDay(true);

    portalGet(
      `/teacher/my-attendance?date=${encodeURIComponent(dateStr)}&month=${encodeURIComponent(monthForQuery)}`
    )
      .then((res) => {
        if (requestId !== dayRequestRef.current) return;
        if (res.success) {
          const rec = res.selectedDayRecord;
          setExistingForDay(rec || null);
          if (rec) {
            setStatus(rec.status || 'present');
            setNotes(rec.notes || '');
          } else {
            setStatus('present');
            setNotes('');
          }
        } else {
          setErrorMsg(res.error || 'Failed to load day details');
        }
      })
      .catch((err) => {
        if (requestId !== dayRequestRef.current) return;
        setErrorMsg(err.message || 'Failed to load day details');
      })
      .finally(() => {
        if (requestId === dayRequestRef.current) setLoadingDay(false);
      });
  }, []);

  useEffect(() => {
    loadMonthly(viewMonth);
  }, [loadMonthly, viewMonth]);

  useEffect(() => {
    const monthForQuery = selectedDate ? selectedDate.slice(0, 7) : viewMonth;
    loadDayForDate(selectedDate, monthForQuery);
  }, [selectedDate, viewMonth, loadDayForDate]);

  useEffect(() => {
    if (reportPeriod === 'weekly' && reportWeekStart) {
      const month = reportWeekStart.slice(0, 7);
      if (month !== viewMonth) setViewMonth(month);
    }
  }, [reportPeriod, reportWeekStart, viewMonth]);

  useEffect(
    () => () => {
      if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
    },
    []
  );

  const viewMonthRecord = useMemo(
    () => monthlyRecords.find((r) => r.monthKey === viewMonth) || null,
    [monthlyRecords, viewMonth]
  );

  const viewMonthLabel = useMemo(() => formatMonthLabel(viewMonth), [viewMonth]);

  const marksByDate = useMemo(() => {
    const map = {};
    dailySubmissions.forEach((row) => {
      map[row.date] = row;
    });
    return map;
  }, [dailySubmissions]);

  const reportDailyRows = useMemo(() => {
    if (!reportDate) return [];
    return dailySubmissions.filter((r) => r.date === reportDate);
  }, [dailySubmissions, reportDate]);

  const reportWeekBounds = useMemo(
    () => getAcademyWeekBounds(reportWeekStart),
    [reportWeekStart]
  );

  const reportWeekRows = useMemo(
    () =>
      dailySubmissions.filter(
        (r) => r.date >= reportWeekBounds.monday && r.date <= reportWeekBounds.saturday
      ),
    [dailySubmissions, reportWeekBounds]
  );

  const reportWeekKpis = useMemo(() => countStatusTotals(reportWeekRows), [reportWeekRows]);
  const reportDailyKpis = useMemo(() => countStatusTotals(reportDailyRows), [reportDailyRows]);

  const reportPeriodLabel = useMemo(() => {
    if (reportPeriod === 'daily' && reportDate) {
      return formatDisplayDate(reportDate);
    }
    if (reportPeriod === 'weekly') {
      return `Week of: ${formatAcademyWeekLabel(reportWeekBounds.monday, reportWeekBounds.saturday)}`;
    }
    if (reportPeriod === 'monthly') {
      return viewMonthLabel;
    }
    return '';
  }, [reportPeriod, reportDate, reportWeekBounds, viewMonthLabel]);

  const selectCalendarDay = (day) => {
    if (!day?.date || day.dayType === 'weekend') return;
    if (isFutureLocalDate(day.date)) return;
    setErrorMsg('');
    setInfoMsg('');
    setSelectedDate(day.date);
    setReportDate(day.date);
    syncViewMonthForDate(day.date);
  };

  const handleReportPeriodChange = (period) => {
    setReportPeriod(period);
    if (period === 'weekly') {
      setReportWeekStart(currentAcademyWeekMonday());
    }
    if (period === 'daily' && !reportDate) {
      setReportDate(todayLocalDateStr());
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setSaveNotice('');
    if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);

    if (!selectedDate) {
      setInfoMsg('Please select a date first.');
      return;
    }
    if (isFutureLocalDate(selectedDate)) {
      setInfoMsg('Attendance cannot be marked for future dates.');
      return;
    }
    if (isAcademyWeekendDate(selectedDate)) {
      setInfoMsg('Sunday is academy weekend. This day is counted automatically.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await portalPost('/teacher/my-attendance', {
        date: selectedDate,
        status,
        notes,
      });
      if (res.success) {
        showSaveNotice(res.message || 'Attendance saved successfully.');
        setMonthlyRecords(res.monthlyRecords || []);
        setExistingForDay(res.record || null);
        setReportDate(selectedDate);
        loadMonthly(viewMonth);
      } else {
        setErrorMsg(res.error || 'Failed to submit attendance');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit attendance');
    } finally {
      setSubmitting(false);
    }
  };

  const showMarkingPanel = Boolean(selectedDate) && !selectedDateIsFuture && !selectedDateIsSunday;
  const canSubmit = showMarkingPanel && !loadingDay && !submitting;

  if (loading) {
    return (
      <div className="portal-page teacher-my-attendance">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-my-attendance">
      <PortalPageHeader
        title="My attendance"
        subtitle="Mark each day, then review your records by day, week, or month."
      />

      {loadError ? <PortalAlert type="error">{loadError}</PortalAlert> : null}
      {errorMsg ? <PortalAlert type="error">{errorMsg}</PortalAlert> : null}
      {infoMsg ? <PortalAlert type="info">{infoMsg}</PortalAlert> : null}

      <form className="my-attendance-daily-card" onSubmit={submit} autoComplete="off">
        <div className="my-attendance-daily-card__head">
          <div className="my-attendance-daily-card__icon" aria-hidden="true">
            <i className="fas fa-calendar-check" />
          </div>
          <div>
            <h3>Daily attendance</h3>
            <p>Choose a date, set your status, and submit for admin approval.</p>
          </div>
        </div>

        <div className="my-attendance-date-picker">
          <label htmlFor="my-attendance-month">Which day?</label>
          <div className="my-attendance-picker-layout">
            <div className="my-attendance-picker-layout__calendar">
          <div className="my-attendance-calendar-section my-attendance-picker-calendar">
            <div className="my-attendance-calendar-head">
              <label htmlFor="my-attendance-month">
                Month
                <input
                  id="my-attendance-month"
                  type="month"
                  value={viewMonth}
                  max={currentMonthKey()}
                  onChange={(e) => setViewMonth(e.target.value)}
                />
              </label>
            </div>
            <p className="my-attendance-calendar-meta">
              <i className="fas fa-info-circle" aria-hidden="true" />
              Sundays are locked as academy weekend (auto-counted). Tap a weekday to mark attendance.
            </p>
            {loadingMonth ? (
              <p className="portal-empty">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading calendar…
              </p>
            ) : (
              <div className="my-attendance-calendar-grid" role="grid" aria-label="Select attendance day">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="my-attendance-calendar-dow">
                    {d}
                  </div>
                ))}
                {calendarDays.length
                  ? Array(calendarDays[0].dayOfWeek ?? 0)
                      .fill(null)
                      .map((_, i) => (
                        <div
                          key={`pad-${i}`}
                          className="my-attendance-cal-day my-attendance-cal-day--pad"
                        />
                      ))
                  : null}
                {calendarDays.map((day) => {
                  const dayNum = day.date?.slice(8, 10);
                  const marked = marksByDate[day.date];
                  const markedStatus = marked?.status;
                  const approvalStatus = marked?.approvalStatus || (marked ? 'pending' : null);
                  const isSunday = day.dayType === 'weekend';
                  const isFuture = isFutureLocalDate(day.date);
                  const isSelected = selectedDate === day.date;
                  const calType =
                    !markedStatus && day.dayType === 'holiday' ? 'holiday' : isSunday ? 'weekend' : null;
                  const cellClass = [
                    'my-attendance-cal-day',
                    markedStatus ? `is-marked is-marked--${markedStatus}` : '',
                    approvalStatus === 'rejected' ? 'is-approval--rejected' : '',
                    calType ? `my-attendance-cal-day--${calType}` : '',
                    isSelected ? 'is-selected' : '',
                    isFuture ? 'is-future' : '',
                    isSunday ? 'is-locked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  if (isSunday) {
                    return (
                      <div
                        key={day.date}
                        className={cellClass}
                        role="gridcell"
                        aria-label={`${day.date}, Sunday, academy weekend, not selectable`}
                        title="Sunday — academy weekend (auto-counted)"
                      >
                        <span className="my-attendance-cal-day__label my-attendance-cal-day__label--muted">
                          Weekend
                        </span>
                        <span className="my-attendance-cal-day__num">{Number(dayNum)}</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={isFuture}
                      className={cellClass}
                      role="gridcell"
                      onClick={() => selectCalendarDay(day)}
                      title={
                        isFuture
                          ? 'Future dates cannot be marked'
                          : markedStatus
                            ? approvalStatus === 'rejected'
                              ? `${statusCalendarLabel(markedStatus)} — Rejected`
                              : statusCalendarLabel(markedStatus)
                            : day.label
                      }
                    >
                      {markedStatus ? (
                        <>
                          <span className="my-attendance-cal-day__label">
                            {statusCalendarLabel(markedStatus)}
                          </span>
                          {approvalStatus === 'rejected' ? (
                            <span className="my-attendance-cal-day__approval my-attendance-cal-day__approval--rejected">
                              Rejected
                            </span>
                          ) : null}
                        </>
                      ) : day.dayType === 'holiday' ? (
                        <span className="my-attendance-cal-day__label my-attendance-cal-day__label--muted">
                          Holiday
                        </span>
                      ) : null}
                      <span className="my-attendance-cal-day__num">{Number(dayNum)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
            </div>

            <div className="my-attendance-picker-layout__side">
        {selectedDateIsFuture ? (
          <PortalAlert type="info">
            Attendance cannot be marked for upcoming dates. Choose today or an earlier date.
          </PortalAlert>
        ) : null}

        {selectedDateIsSunday ? (
          <PortalAlert type="info">
            Sunday is academy weekend. This day is counted automatically — no submission is required.
          </PortalAlert>
        ) : null}

        {!selectedDate && !selectedDateIsFuture && !selectedDateIsSunday ? (
          <p className="my-attendance-picker-placeholder">
            <i className="fas fa-hand-pointer" aria-hidden="true" />
            Select a weekday from the calendar to mark your attendance.
          </p>
        ) : null}

        {showMarkingPanel ? (
          <div className="my-attendance-mark-panel">
            {loadingDay ? (
              <p className="portal-empty">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading this day…
              </p>
            ) : (
              <>
                <p className="my-attendance-selected-date">
                  <i className="fas fa-calendar-day" aria-hidden="true" />
                  {formatDisplayDate(selectedDate)}
                  {existingForDay ? (
                    <span
                      className={`portal-attendance-chip ${statusChipClass(existingForDay.status)}`}
                    >
                      {existingForDay.approvalStatus || 'pending'}
                    </span>
                  ) : null}
                </p>

                <p className="my-attendance-notes">
                  <span>Your status for this day</span>
                </p>
                <div
                  className={`my-attendance-status-grid my-attendance-status-grid--${TEACHER_MY_STATUS_OPTIONS.length}`}
                >
                  {TEACHER_MY_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`my-attendance-status-card ${status === opt.value ? 'is-active' : ''}`}
                      style={{ '--status-color': opt.color }}
                      onClick={() => setStatus(opt.value)}
                      disabled={submitting}
                    >
                      <i className={`fas ${opt.icon}`} style={{ color: opt.color }} aria-hidden="true" />
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="my-attendance-notes">
                  <label htmlFor="my-attendance-notes">Notes (optional)</label>
                  <textarea
                    id="my-attendance-notes"
                    rows={3}
                    placeholder="Reason for leave, late arrival, etc."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <button type="submit" className="my-attendance-save-btn" disabled={!canSubmit}>
                  <i className="fas fa-paper-plane" aria-hidden="true" />
                  {submitting
                    ? 'Saving…'
                    : existingForDay
                      ? 'Update & resubmit for approval'
                      : 'Submit daily attendance'}
                </button>
                {saveNotice ? (
                  <p className="portal-attendance-save-success" role="status" aria-live="polite">
                    {saveNotice}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
            </div>
          </div>
        </div>
      </form>

      <section className="portal-content-section portal-attendance-report-section my-attendance-records-section">
        <h2 className="portal-content-section-title">Attendance report</h2>
        <p className="portal-attendance-report-hint">
          {reportPeriodLabel || 'Review your submitted attendance.'}
        </p>

        <div className="portal-attendance-filter-bar">
          {reportPeriod === 'weekly' ? (
            <WeekPicker weekStart={reportWeekStart} onWeekStartChange={setReportWeekStart} />
          ) : (
            <label className="portal-field-label">
              <span>{reportPeriod === 'monthly' ? 'Month' : 'Date'}</span>
              <input
                type={reportPeriod === 'monthly' ? 'month' : 'date'}
                value={reportPeriod === 'monthly' ? viewMonth : reportDate}
                max={reportPeriod === 'monthly' ? undefined : maxDate}
                onChange={(e) => {
                  const next = e.target.value;
                  if (reportPeriod === 'monthly') {
                    setViewMonth(next);
                  } else {
                    setReportDate(next);
                    if (next && !isFutureLocalDate(next) && !isAcademyWeekendDate(next)) {
                      syncViewMonthForDate(next);
                    }
                  }
                }}
              />
            </label>
          )}
          <PeriodToggle value={reportPeriod} onChange={handleReportPeriodChange} />
        </div>

        {reportPeriod === 'daily' && reportDailyRows.length ? (
          <div className="portal-attendance-day-summary portal-attendance-period-kpis">
            <span className="portal-attendance-chip portal-attendance-chip--present">
              Present: {reportDailyKpis.present}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--absent">
              Absent: {reportDailyKpis.absent}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--late">
              Late: {reportDailyKpis.late}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--leave">
              Leave: {reportDailyKpis.leave}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--holiday">
              Holiday: {reportDailyKpis.holiday}
            </span>
          </div>
        ) : null}

        {reportPeriod === 'weekly' && reportWeekRows.length ? (
          <div className="portal-attendance-day-summary portal-attendance-period-kpis">
            <span className="portal-attendance-chip portal-attendance-chip--present">
              Present: {reportWeekKpis.present}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--absent">
              Absent: {reportWeekKpis.absent}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--late">
              Late: {reportWeekKpis.late}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--leave">
              Leave: {reportWeekKpis.leave}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--holiday">
              Holiday: {reportWeekKpis.holiday}
            </span>
          </div>
        ) : null}

        {reportPeriod === 'monthly' && viewMonthRecord ? (
          <div className="portal-attendance-day-summary portal-attendance-period-kpis">
            {payrollStatusMeta(viewMonthRecord) ? (
              <span
                className={`portal-attendance-chip ${payrollStatusMeta(viewMonthRecord).className} teacher-payroll-chip`}
                title={payrollStatusMeta(viewMonthRecord).detail || undefined}
              >
                Payroll: {payrollStatusMeta(viewMonthRecord).label}
              </span>
            ) : null}
            <span className="portal-attendance-chip portal-attendance-chip--present">
              Present: {viewMonthRecord.presentDays ?? 0}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--late">
              Late: {viewMonthRecord.lateDays ?? 0}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--absent">
              Absent: {viewMonthRecord.absentDays ?? 0}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--leave">
              Leave: {viewMonthRecord.leaveDays ?? 0}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--holiday">
              Holiday: {viewMonthRecord.holidayDays ?? 0}
            </span>
            <span className="portal-attendance-chip portal-attendance-chip--weekend">
              Weekend days: {viewMonthRecord.weekendDays ?? 0}
            </span>
          </div>
        ) : null}

        {reportPeriod === 'daily' ? (
          <SubmissionsTable
            rows={reportDailyRows}
            loading={loadingMonth}
            emptyMessage={
              reportDate ? 'No submission for this date.' : 'Select a date to view attendance.'
            }
          />
        ) : null}

        {reportPeriod === 'weekly' ? (
          <SubmissionsTable
            rows={reportWeekRows}
            loading={loadingMonth}
            emptyMessage="No submissions in this week yet."
          />
        ) : null}

        {reportPeriod === 'monthly' ? (
          <>
            <SubmissionsTable
              rows={dailySubmissions}
              loading={loadingMonth}
              emptyMessage={`No daily submissions for ${viewMonthLabel} yet.`}
            />

            <div className="portal-attendance-records-table-wrap">
              <table className="portal-attendance-records-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Working days</th>
                    <th>Present</th>
                    <th>Late</th>
                    <th>Leave</th>
                    <th>Absent (deduct)</th>
                    <th>Holiday</th>
                    <th>Weekend</th>
                    <th>Month rollup</th>
                    <th>Payroll</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMonth ? (
                    <tr>
                      <td colSpan={10} className="portal-empty-cell">
                        Loading…
                      </td>
                    </tr>
                  ) : viewMonthRecord ? (
                    <tr>
                      <td>{viewMonthRecord.monthKey}</td>
                      <td>{viewMonthRecord.expectedWorkingDays ?? '—'}</td>
                      <td>{viewMonthRecord.presentDays ?? 0}</td>
                      <td>{viewMonthRecord.lateDays ?? 0}</td>
                      <td>{viewMonthRecord.leaveDays ?? 0}</td>
                      <td>{viewMonthRecord.absentDays ?? 0}</td>
                      <td>{viewMonthRecord.holidayDays ?? 0}</td>
                      <td>{viewMonthRecord.weekendDays ?? 0}</td>
                      <td>
                        <span className="portal-attendance-chip portal-attendance-chip--muted">
                          {viewMonthRecord.approvalStatus || 'pending'}
                        </span>
                      </td>
                      <td>
                        {payrollStatusMeta(viewMonthRecord) ? (
                          <span
                            className={`portal-attendance-chip ${payrollStatusMeta(viewMonthRecord).className}`}
                            title={payrollStatusMeta(viewMonthRecord).detail || undefined}
                          >
                            {payrollStatusMeta(viewMonthRecord).label}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={10} className="portal-empty-cell">
                        No monthly record for {viewMonthLabel} yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
};

export default TeacherMyAttendance;
