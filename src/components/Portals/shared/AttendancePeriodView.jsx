import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { portalGet } from './portalApi';
import { PortalLoading } from './PortalUi';
import { statusChipClass } from '../../../constants/attendanceStatuses';
import {
  currentAcademyWeekMonday,
  formatWeekdayName,
  getAcademyWeekBounds,
  getAcademyWeeksInMonth,
  getAcademyMonthsInYear,
  isAcademyWeekendDate,
  parseLocalDate,
  toLocalDateStr,
} from '../../../utils/academyWeek';
import './AttendancePeriodView.scss';

const ALL_PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const SUMMARY_STATUS_ROWS = [
  { key: 'present', label: 'Present' },
  { key: 'absent', label: 'Absent' },
  { key: 'late', label: 'Late' },
  { key: 'leave', label: 'Leave' },
  { key: 'holiday', label: 'Holiday' },
];

const ACADEMY_YEAR_OPTIONS = [
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
];

const PeriodToggle = ({ value, onChange, options }) => (
  <div className="portal-attendance-period-tabs" role="tablist" aria-label="Attendance period">
    {options.map((opt) => (
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
  const weeksInMonth = useMemo(() => getAcademyWeeksInMonth(selectedMonth), [selectedMonth]);
  const monthOptions = useMemo(() => getAcademyMonthsInYear(selectedYear), [selectedYear]);

  return (
    <div className="attendance-period-view__week-picker">
      <select value={selectedYear} onChange={(e) => onWeekStartChange(`${e.target.value}-01-01`)}>
        {ACADEMY_YEAR_OPTIONS.map((y) => (
          <option key={y.value} value={y.value}>
            {y.label}
          </option>
        ))}
      </select>
      <select
        value={selectedMonth}
        onChange={(e) => {
          const weeks = getAcademyWeeksInMonth(e.target.value);
          onWeekStartChange(weeks[0]?.monday || e.target.value);
        }}
      >
        {monthOptions.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select value={monday} onChange={(e) => onWeekStartChange(e.target.value)}>
        {weeksInMonth.map((w) => (
          <option key={w.monday} value={w.monday}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
};

function statusBadgeClass(status) {
  if (!status) return '';
  return `attendance-period-view__status-badge ${statusChipClass(status)}`;
}

function dayCellClass(status) {
  if (!status) return 'attendance-period-view__day attendance-period-view__day--empty';
  return `attendance-period-view__day attendance-period-view__day--${status}`;
}

const CALENDAR_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function previousDateKey(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d) return '';
  d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
}

function datesInclusive(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) return [];
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function buildAcademyCalendarLayout(calendarRows, period, startDate, endDate) {
  const byDate = Object.fromEntries((calendarRows || []).map((r) => [r.date, r]));

  if (period === 'weekly' && startDate) {
    const sunday = previousDateKey(startDate);
    const weekDates = [sunday, ...(calendarRows || []).map((r) => r.date)];
    return { padding: 0, cells: weekDates.map((date) => ({ date, row: byDate[date] || null })) };
  }

  if (!startDate || !endDate) return { padding: 0, cells: [] };

  const monthDates = datesInclusive(startDate, endDate);
  const firstDow = parseLocalDate(startDate)?.getDay() ?? 0;
  return {
    padding: firstDow,
    cells: monthDates.map((date) => ({ date, row: byDate[date] || null })),
  };
}

function statusLabel(status, date) {
  if (status) return status;
  if (isAcademyWeekendDate(date)) return 'Weekend';
  return '—';
}

const AttendanceSummaryTable = ({ summary, weekendDays }) => (
  <div className="attendance-period-view__list-wrap">
    <table className="attendance-period-view__table attendance-period-view__table--summary-horizontal">
      <thead>
        <tr>
          {SUMMARY_STATUS_ROWS.map(({ key, label }) => (
            <th key={key}>{label}</th>
          ))}
          <th>Total marked</th>
          {weekendDays != null ? <th>Weekend days</th> : null}
        </tr>
      </thead>
      <tbody>
        <tr>
          {SUMMARY_STATUS_ROWS.map(({ key }) => (
            <td key={key}>
              <strong>{summary[key] ?? 0}</strong>
            </td>
          ))}
          <td>
            <strong>{summary.total ?? 0}</strong>
          </td>
          {weekendDays != null ? <td>{weekendDays}</td> : null}
        </tr>
      </tbody>
    </table>
  </div>
);

const AttendanceAcademyCalendar = ({ calendarRows, period, startDate, endDate }) => {
  const { padding, cells } = useMemo(
    () => buildAcademyCalendarLayout(calendarRows, period, startDate, endDate),
    [calendarRows, period, startDate, endDate]
  );

  if (!cells.length) return null;

  return (
    <div className="attendance-period-view__calendar-section">
      <div className="attendance-period-view__calendar-grid" role="grid" aria-label="Attendance calendar">
        {CALENDAR_DOW.map((d) => (
          <div key={d} className="attendance-period-view__calendar-dow">
            {d}
          </div>
        ))}
        {Array.from({ length: padding }, (_, i) => (
          <div key={`pad-${i}`} className="attendance-period-view__cal-day attendance-period-view__cal-day--pad" />
        ))}
        {cells.map(({ date, row }) => {
          const isWeekend = isAcademyWeekendDate(date);
          const status = row?.status || null;
          const dayNum = Number(date.slice(8, 10));
          const cellClass = [
            'attendance-period-view__cal-day',
            isWeekend ? 'attendance-period-view__cal-day--weekend' : '',
            status ? `attendance-period-view__cal-day--${status}` : '',
            !status && !isWeekend ? 'attendance-period-view__cal-day--empty' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={date}
              className={cellClass}
              role="gridcell"
              title={row?.notes || undefined}
              aria-label={`${date}, ${statusLabel(status, date)}`}
            >
              <span className="attendance-period-view__cal-day-label">{statusLabel(status, date)}</span>
              <span className="attendance-period-view__cal-day-num">{dayNum}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AttendancePeriodView = ({
  coursesUrl,
  viewUrl,
  emptyCoursesHint = 'No active course enrollments.',
  allowedPeriods = ['daily', 'weekly', 'monthly'],
  summaryOnly = false,
}) => {
  const periodOptions = useMemo(
    () => ALL_PERIOD_OPTIONS.filter((opt) => allowedPeriods.includes(opt.value)),
    [allowedPeriods]
  );
  const defaultPeriod = periodOptions[periodOptions.length - 1]?.value || 'monthly';
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [period, setPeriod] = useState(defaultPeriod);
  const [reportDate, setReportDate] = useState(() => toLocalDateStr(new Date()));
  const [viewMonth, setViewMonth] = useState(() => toLocalDateStr(new Date()).slice(0, 7));
  const [weekStart, setWeekStart] = useState(() => currentAcademyWeekMonday());
  const [data, setData] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingView, setLoadingView] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!periodOptions.some((opt) => opt.value === period)) {
      setPeriod(defaultPeriod);
    }
  }, [period, periodOptions, defaultPeriod]);

  useEffect(() => {
    if (!coursesUrl) {
      setCourses([]);
      setCourseId('');
      setLoadingCourses(false);
      return;
    }
    setLoadingCourses(true);
    setError('');
    portalGet(coursesUrl)
      .then((res) => {
        if (res.success) {
          const list = res.courses || [];
          setCourses(list);
          setCourseId((prev) => {
            if (prev && list.some((c) => String(c._id) === String(prev))) return prev;
            return list[0]?._id || '';
          });
        } else setError(res.error || 'Failed to load courses');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCourses(false));
  }, [coursesUrl]);

  const dateParam = useMemo(() => {
    if (period === 'monthly') return viewMonth;
    if (period === 'weekly') return weekStart;
    return reportDate;
  }, [period, viewMonth, weekStart, reportDate]);

  const loadView = useCallback(() => {
    if (!courseId || !viewUrl) {
      setData(null);
      return;
    }
    setLoadingView(true);
    const q = new URLSearchParams({
      courseId,
      period,
      date: dateParam,
    });
    portalGet(`${viewUrl}?${q}`)
      .then((res) => {
        if (res.success) {
          setData(res);
          setError('');
        } else setError(res.error || 'Failed to load attendance');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingView(false));
  }, [courseId, period, dateParam, viewUrl]);

  useEffect(() => {
    if (!loadingCourses) loadView();
  }, [loadView, loadingCourses]);

  const selectedCourse = courses.find((c) => String(c._id) === String(courseId));
  const summary = data?.summary || {};

  if (loadingCourses) {
    return <PortalLoading label="Loading courses…" />;
  }

  return (
    <div className="attendance-period-view">
      <div className="attendance-period-view__filters">
        <label className="attendance-period-view__field">
          <span>Course</span>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>

        {courseId ? (
          <>
            {period === 'weekly' ? (
              <div className="attendance-period-view__field">
                <span>Week</span>
                <WeekPicker weekStart={weekStart} onWeekStartChange={setWeekStart} />
              </div>
            ) : period === 'monthly' ? (
              <label className="attendance-period-view__field">
                <span>Month</span>
                <input type="month" value={viewMonth} onChange={(e) => setViewMonth(e.target.value)} />
              </label>
            ) : (
              <label className="attendance-period-view__field">
                <span>Date</span>
                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
              </label>
            )}
            <PeriodToggle value={period} onChange={setPeriod} options={periodOptions} />
          </>
        ) : null}
      </div>

      {!courses.length ? (
        <p className="attendance-period-view__empty">{emptyCoursesHint}</p>
      ) : !courseId ? (
        <p className="attendance-period-view__empty">Select a course to view attendance records.</p>
      ) : loadingView ? (
        <PortalLoading label="Loading attendance…" />
      ) : (
        <>
          {selectedCourse ? (
            <p className="attendance-period-view__rate">
              <i className="fas fa-chart-line" aria-hidden="true" />
              {selectedCourse.title} — attendance rate: {summary.presentRate ?? 0}%
              {data?.startDate && data?.endDate ? (
                <span style={{ fontWeight: 500, opacity: 0.85 }}>
                  {' '}
                  ({data.startDate} → {data.endDate})
                </span>
              ) : null}
            </p>
          ) : null}

          {!summaryOnly ? (
            <div className="attendance-period-view__kpis portal-attendance-day-summary portal-attendance-period-kpis">
              <span className="portal-attendance-chip portal-attendance-chip--present">
                Present: {summary.present ?? 0}
              </span>
              <span className="portal-attendance-chip portal-attendance-chip--absent">
                Absent: {summary.absent ?? 0}
              </span>
              <span className="portal-attendance-chip portal-attendance-chip--late">
                Late: {summary.late ?? 0}
              </span>
              <span className="portal-attendance-chip portal-attendance-chip--leave">
                Leave: {summary.leave ?? 0}
              </span>
              <span className="portal-attendance-chip portal-attendance-chip--holiday">
                Holiday: {summary.holiday ?? 0}
              </span>
              {period === 'monthly' && data?.weekendDaysInPeriod != null ? (
                <span className="portal-attendance-chip portal-attendance-chip--weekend">
                  Weekend days: {data.weekendDaysInPeriod}
                </span>
              ) : null}
            </div>
          ) : null}

          {summaryOnly ? (
            <AttendanceAcademyCalendar
              calendarRows={data?.calendarRows}
              period={period}
              startDate={data?.startDate}
              endDate={data?.endDate}
            />
          ) : (data?.calendarRows || []).length > 0 && period !== 'daily' ? (
            <div className="attendance-period-view__calendar">
              {data.calendarRows.map((row) => (
                <div key={row.date} className={dayCellClass(row.status)} title={row.notes || undefined}>
                  <span className="attendance-period-view__day-date">
                    {new Date(row.date + 'T12:00:00').toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="attendance-period-view__day-status">
                    {row.status || (formatWeekdayName(row.date) === 'Sunday' ? 'Weekend' : '—')}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {summaryOnly ? (
            <AttendanceSummaryTable
              summary={summary}
              weekendDays={period === 'monthly' ? data?.weekendDaysInPeriod : null}
            />
          ) : (
            <div className="attendance-period-view__list-wrap">
              <table className="attendance-period-view__table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.records || []).map((r) => (
                    <tr key={r._id}>
                      <td>{new Date(r.date).toLocaleDateString()}</td>
                      <td>{formatWeekdayName(r.date)}</td>
                      <td>
                        <span className={statusBadgeClass(r.status)}>{r.status}</span>
                      </td>
                      <td>{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.records?.length ? (
                <p className="attendance-period-view__empty">No attendance records in this period.</p>
              ) : null}
            </div>
          )}
        </>
      )}

      {error ? <p className="attendance-period-view__error">{error}</p> : null}
    </div>
  );
};

export default AttendancePeriodView;
