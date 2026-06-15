import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { statusChipClass } from '../../../constants/attendanceStatuses';
import {
  currentAcademyWeekMonday,
  formatWeekdayName,
  getAcademyWeekBounds,
  getAcademyWeeksInMonth,
  getAcademyMonthsInYear,
  toLocalDateStr,
} from '../../../utils/academyWeek';
import './StudentAttendance.scss';

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const ACADEMY_YEAR_OPTIONS = [
  { value: '2025', label: '2025' },
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
];

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
  const weeksInMonth = useMemo(() => getAcademyWeeksInMonth(selectedMonth), [selectedMonth]);
  const monthOptions = useMemo(() => getAcademyMonthsInYear(selectedYear), [selectedYear]);

  return (
    <div className="student-attendance__week-picker">
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
  return `student-attendance__status-badge ${statusChipClass(status)}`;
}

function dayCellClass(status) {
  if (!status) return 'student-attendance__day student-attendance__day--empty';
  return `student-attendance__day student-attendance__day--${status}`;
}

const StudentAttendance = () => {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [period, setPeriod] = useState('monthly');
  const [reportDate, setReportDate] = useState(() => toLocalDateStr(new Date()));
  const [viewMonth, setViewMonth] = useState(() => toLocalDateStr(new Date()).slice(0, 7));
  const [weekStart, setWeekStart] = useState(() => currentAcademyWeekMonday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingView, setLoadingView] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/attendance/courses')
      .then((res) => {
        if (res.success) setCourses(res.courses || []);
        else setError(res.error || 'Failed to load courses');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const dateParam = useMemo(() => {
    if (period === 'monthly') return viewMonth;
    if (period === 'weekly') return weekStart;
    return reportDate;
  }, [period, viewMonth, weekStart, reportDate]);

  const loadView = useCallback(() => {
    if (!courseId) {
      setData(null);
      return;
    }
    setLoadingView(true);
    const q = new URLSearchParams({
      courseId,
      period,
      date: dateParam,
    });
    portalGet(`/student/attendance/view?${q}`)
      .then((res) => {
        if (res.success) setData(res);
        else setError(res.error || 'Failed to load attendance');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingView(false));
  }, [courseId, period, dateParam]);

  useEffect(() => {
    if (!loading) loadView();
  }, [loadView, loading]);

  const selectedCourse = courses.find((c) => String(c._id) === String(courseId));
  const summary = data?.summary || {};

  if (error && !courses.length) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page student-attendance">
      <PortalPageHeader
        title="My attendance"
        subtitle="View attendance by course — daily, weekly, or monthly."
      />

      <div className="student-attendance__hero">
        <div className="student-attendance__hero-icon" aria-hidden="true">
          <i className="fas fa-user-check" />
        </div>
        <div>
          <h2>Course attendance</h2>
          <p>
            {courses.length
              ? 'Select a course below. If you are enrolled in multiple courses, switch the dropdown to see each one separately.'
              : 'No active course enrollments yet.'}
          </p>
        </div>
      </div>

      <section className="student-attendance__panel">
        <div className="student-attendance__filters">
          <label className="student-attendance__field">
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
                <div className="student-attendance__field">
                  <span>Week</span>
                  <WeekPicker weekStart={weekStart} onWeekStartChange={setWeekStart} />
                </div>
              ) : (
                <label className="student-attendance__field">
                  <span>{period === 'monthly' ? 'Month' : 'Date'}</span>
                  <input
                    type={period === 'monthly' ? 'month' : 'date'}
                    value={period === 'monthly' ? viewMonth : reportDate}
                    onChange={(e) =>
                      period === 'monthly' ? setViewMonth(e.target.value) : setReportDate(e.target.value)
                    }
                  />
                </label>
              )}
              <PeriodToggle value={period} onChange={setPeriod} />
            </>
          ) : null}
        </div>

        {!courseId ? (
          <p className="student-attendance__empty">Select a course to view your attendance records.</p>
        ) : loadingView ? (
          <PortalLoading label="Loading attendance…" />
        ) : (
          <>
            {selectedCourse ? (
              <p className="student-attendance__rate">
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

            <div className="student-attendance__kpis portal-attendance-day-summary portal-attendance-period-kpis">
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

            {(data?.calendarRows || []).length > 0 && period !== 'daily' ? (
              <div className="student-attendance__calendar">
                {data.calendarRows.map((row) => (
                  <div key={row.date} className={dayCellClass(row.status)} title={row.notes || undefined}>
                    <span className="student-attendance__day-date">
                      {new Date(row.date + 'T12:00:00').toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="student-attendance__day-status">
                      {row.status || (formatWeekdayName(row.date) === 'Sunday' ? 'Weekend' : '—')}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="student-attendance__list-wrap">
              <table className="student-attendance__table">
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
                <p className="student-attendance__empty">No attendance records in this period.</p>
              ) : null}
            </div>
          </>
        )}
      </section>

      {error && courseId ? <PortalAlert type="error">{error}</PortalAlert> : null}
    </div>
  );
};

export default StudentAttendance;
