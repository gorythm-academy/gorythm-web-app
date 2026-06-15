import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import {
  STUDENT_MARK_ATTENDANCE_STATUS_OPTIONS,
  statusChipClass,
} from '../../../constants/attendanceStatuses';
import {
  getAcademyWeekBounds,
  formatAcademyWeekLabel,
  currentAcademyWeekMonday,
  getAcademyYearOptions,
  getAcademyMonthsInYear,
  getAcademyWeeksInMonth,
  toLocalDateStr,
  todayLocalDateStr,
  isFutureLocalDate,
} from '../../../utils/academyWeek';

const PERIOD_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const studentKey = (id) => {
  if (id == null || id === '') return '';
  if (typeof id === 'object') return portalDocId(id);
  return String(id).trim();
};

const formatNameRoll = (name, rollNumber) => {
  if (!name || name === '—') return '—';
  return rollNumber ? `${name} (${rollNumber})` : name;
};

const attendancePercent = (row) => {
  if (!row?.total) return '—';
  const attended = (row.present || 0) + (row.late || 0);
  return `${Math.round((attended / row.total) * 100)}%`;
};

const isSunday = (dateStr) => {
  if (!dateStr) return false;
  return new Date(`${dateStr}T12:00:00`).getDay() === 0;
};

const formatPeriodLabel = (period, startDate, endDate) => {
  if (!startDate) return '';
  if (period === 'daily') {
    const label = new Date(`${startDate}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return isSunday(startDate) ? `${label} (academy weekend — no attendance marking)` : label;
  }
  if (period === 'weekly') {
    return `Week of: ${formatAcademyWeekLabel(startDate, endDate)}`;
  }
  if (!endDate || startDate === endDate) return startDate;
  const start = new Date(`${startDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const end = new Date(`${endDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${start} – ${end}`;
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
      <label className="portal-field-label">
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
      <label className="portal-field-label">
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
      <label className="portal-field-label">
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

const TeacherAttendance = () => {
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(searchParams.get('course') || '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState([]);
  const [rosterCount, setRosterCount] = useState(0);
  const [marks, setMarks] = useState({});
  const [notes, setNotes] = useState({});
  const [msg, setMsg] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [viewError, setViewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState({ status: 'present', notes: '' });

  const [viewCourseId, setViewCourseId] = useState(searchParams.get('course') || '');
  const [viewPeriod, setViewPeriod] = useState('daily');
  const [viewDate, setViewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summaryRows, setSummaryRows] = useState([]);
  const [reportRecords, setReportRecords] = useState([]);
  const [periodMeta, setPeriodMeta] = useState({
    startDate: '',
    endDate: '',
    weekendDaysInPeriod: null,
  });
  const [viewLoading, setViewLoading] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const viewRequestRef = useRef(0);
  const selectAllRecordsRef = useRef(null);
  const saveNoticeTimerRef = useRef(null);

  const showSaveNotice = useCallback((text) => {
    setSaveNotice(text);
    if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
    saveNoticeTimerRef.current = setTimeout(() => setSaveNotice(''), 5000);
  }, []);

  const loadRoster = useCallback(() => {
    if (!courseId) {
      setRoster([]);
      setRosterCount(0);
      return;
    }
    portalGet(`/teacher/attendance/roster?courseId=${encodeURIComponent(courseId)}&date=${encodeURIComponent(date)}`)
      .then((res) => {
        if (res.success) {
          const students = res.students || [];
          setRoster(students);
          setRosterCount(res.count ?? students.length);
          const statusInit = {};
          const notesInit = {};
          students.forEach((s) => {
            const sid = portalDocId(s);
            const savedStatus = s.record?.status || 'present';
            statusInit[sid] = savedStatus === 'weekend' ? 'present' : savedStatus;
            notesInit[sid] = s.record?.notes || '';
          });
          setMarks(statusInit);
          setNotes(notesInit);
        }
      })
      .catch(() => {
        setRoster([]);
        setRosterCount(0);
      });
  }, [courseId, date]);

  const loadAttendanceView = useCallback(() => {
    if (!viewCourseId) {
      setSummaryRows([]);
      setReportRecords([]);
      setPeriodMeta({ startDate: '', endDate: '', weekendDaysInPeriod: null });
      setViewError('');
      setViewLoading(false);
      return;
    }

    if (viewPeriod === 'daily' && !String(viewDate || '').trim()) {
      setSummaryRows([]);
      setReportRecords([]);
      setPeriodMeta({ startDate: '', endDate: '', weekendDaysInPeriod: null });
      setViewError('');
      setViewLoading(false);
      return;
    }

    const requestId = viewRequestRef.current + 1;
    viewRequestRef.current = requestId;
    setViewLoading(true);
    setViewError('');

    const base = `courseId=${encodeURIComponent(viewCourseId)}&period=${encodeURIComponent(viewPeriod)}&date=${encodeURIComponent(viewDate)}`;

    portalGet(`/teacher/attendance/view?${base}`)
      .then((res) => {
        if (requestId !== viewRequestRef.current) return;
        if (res.success) {
          setSummaryRows(res.rows || []);
          setReportRecords(res.records || []);
          setPeriodMeta({
            startDate: res.startDate || '',
            endDate: res.endDate || '',
            weekendDaysInPeriod:
              viewPeriod === 'monthly' && res.weekendDaysInPeriod != null
                ? res.weekendDaysInPeriod
                : null,
          });
          setViewError('');
        } else {
          setSummaryRows([]);
          setReportRecords([]);
          setPeriodMeta({ startDate: '', endDate: '', weekendDaysInPeriod: null });
          setViewError(res.error || 'Failed to load attendance');
        }
      })
      .catch((err) => {
        if (requestId !== viewRequestRef.current) return;
        setSummaryRows([]);
        setReportRecords([]);
        setPeriodMeta({ startDate: '', endDate: '', weekendDaysInPeriod: null });
        setViewError(err.message || 'Failed to load attendance');
      })
      .finally(() => {
        if (requestId === viewRequestRef.current) setViewLoading(false);
      });
  }, [viewCourseId, viewPeriod, viewDate]);

  useEffect(() => {
    portalGet('/teacher/courses')
      .then((cRes) => {
        if (cRes.success) setCourses(cRes.courses || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    setSaveNotice('');
    if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
  }, [courseId, date]);

  useEffect(
    () => () => {
      if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
    },
    []
  );

  useEffect(() => {
    loadAttendanceView();
  }, [loadAttendanceView]);

  useEffect(() => {
    setExpandedStudentId(null);
    setSelectedRecordIds([]);
  }, [viewCourseId, viewPeriod, viewDate]);

  const daySummary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, weekend: 0 };
    roster.forEach((s) => {
      const st = marks[portalDocId(s)] || 'present';
      if (counts[st] != null) counts[st] += 1;
    });
    return counts;
  }, [roster, marks]);

  const reportByStudent = useMemo(() => {
    const map = {};
    reportRecords.forEach((r) => {
      const sid = studentKey(r.student?._id || r.student);
      if (!sid) return;
      if (!map[sid]) map[sid] = [];
      map[sid].push(r);
    });
    Object.values(map).forEach((list) => {
      list.sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    return map;
  }, [reportRecords]);

  const dailyRows = useMemo(() => {
    if (viewPeriod !== 'daily' || !String(viewDate || '').trim()) return [];
    const dayKey = periodMeta.startDate || viewDate;
    return summaryRows.map((row) => {
      const sid = studentKey(row.studentId);
      const records = reportByStudent[sid] || [];
      const record =
        records.find((r) => toLocalDateStr(new Date(r.date)) === dayKey) || null;
      return { ...row, record };
    });
  }, [viewPeriod, viewDate, periodMeta.startDate, summaryRows, reportByStudent]);

  const periodKpis = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, weekend: 0 };
    summaryRows.forEach((row) => {
      counts.present += row.present || 0;
      counts.absent += row.absent || 0;
      counts.late += row.late || 0;
      counts.leave += row.leave || 0;
      counts.holiday += row.holiday || 0;
      counts.weekend += row.weekend || 0;
    });
    return counts;
  }, [summaryRows]);

  const deletableRecordIds = useMemo(
    () =>
      reportRecords
        .map((record) => portalDocId(record))
        .filter(Boolean),
    [reportRecords]
  );

  const allRecordsSelected =
    deletableRecordIds.length > 0 &&
    deletableRecordIds.every((id) => selectedRecordIds.includes(id));
  const someRecordsSelected = deletableRecordIds.some((id) => selectedRecordIds.includes(id));

  useEffect(() => {
    if (selectAllRecordsRef.current) {
      selectAllRecordsRef.current.indeterminate = someRecordsSelected && !allRecordsSelected;
    }
  }, [someRecordsSelected, allRecordsSelected]);

  const periodLabel =
    viewPeriod === 'daily' && !String(viewDate || '').trim()
      ? ''
      : formatPeriodLabel(viewPeriod, periodMeta.startDate, periodMeta.endDate);
  const summaryTableCols = viewPeriod === 'daily' ? 5 : 8;
  const showReportRecords = Boolean(
    viewCourseId && !(viewPeriod === 'daily' && !String(viewDate || '').trim())
  );
  const markDateIsSunday = isSunday(date);
  const markDateIsFuture = isFutureLocalDate(date);
  const canMarkOnDate = !markDateIsSunday && !markDateIsFuture;
  const markDateLabel = useMemo(() => {
    if (!date) return '';
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [date]);
  const markedStudentsCount = useMemo(
    () => roster.filter((s) => s.record).length,
    [roster]
  );
  const dayAlreadyMarked = Boolean(
    courseId && roster.length && canMarkOnDate && markedStudentsCount > 0
  );

  const handleViewPeriodChange = (period) => {
    setViewPeriod(period);
    if (period === 'weekly') {
      setViewDate(currentAcademyWeekMonday());
    }
  };

  const handleWeekStartChange = (monday) => {
    setViewDate(monday);
  };

  const buildPayload = (studentIds) =>
    studentIds
      .filter(Boolean)
      .map((studentId) => ({
        studentId,
        status: marks[studentId] || 'present',
        notes: notes[studentId] || '',
        date,
      }));

  const submitAttendance = async (e) => {
    e.preventDefault();
    setMsg('');
    setSaveNotice('');
    if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
    if (!courseId) {
      setMsg('Select a course first.');
      return;
    }
    if (markDateIsFuture) {
      setMsg('Attendance cannot be marked for future dates.');
      return;
    }
    if (markDateIsSunday) {
      setMsg('Sunday is the academy weekend. Attendance cannot be marked on this day.');
      return;
    }
    const ids = roster.map((s) => portalDocId(s)).filter(Boolean);
    if (!ids.length) {
      setMsg('No students on this course roster.');
      return;
    }
    try {
      const res = await portalPost('/teacher/attendance', {
        courseId,
        records: buildPayload(ids),
      });
      if (res.success) {
        showSaveNotice('Attendance saved successfully.');
        setViewCourseId(courseId);
        setViewDate(date);
        setViewPeriod('daily');
        loadRoster();
        loadAttendanceView();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message || 'Failed to save attendance');
    }
  };

  const openEditRecord = (record) => {
    setEditRecord(record);
    const status = record.status || 'present';
    setEditForm({
      status: status === 'weekend' ? 'present' : status,
      notes: record.notes || '',
    });
  };

  const saveEditRecord = async (e) => {
    e.preventDefault();
    if (!editRecord) return;
    const recordId = portalDocId(editRecord);
    if (!recordId) {
      setMsg('Record id missing — refresh and try again.');
      return;
    }
    try {
      await portalPatch(`/teacher/attendance/${recordId}`, {
        status: editForm.status,
        notes: editForm.notes,
      });
      setEditRecord(null);
      setMsg('Attendance record updated.');
      loadRoster();
      loadAttendanceView();
    } catch (err) {
      setMsg(err.message || 'Failed to update record');
    }
  };

  const toggleRecordSelection = (recordId) => {
    if (!recordId) return;
    setSelectedRecordIds((prev) =>
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId]
    );
  };

  const toggleSelectAllRecords = () => {
    setSelectedRecordIds(allRecordsSelected ? [] : [...deletableRecordIds]);
  };

  const deleteRecord = async (record) => {
    const recordId = portalDocId(record);
    if (!recordId) {
      setMsg('Record id missing — refresh and try again.');
      return;
    }
    if (!window.confirm('Delete this attendance record? This cannot be undone.')) return;
    try {
      await portalDelete(`/teacher/attendance/${recordId}`);
      setMsg('Attendance record deleted.');
      setSelectedRecordIds((prev) => prev.filter((id) => id !== recordId));
      if (editRecord && portalDocId(editRecord) === recordId) setEditRecord(null);
      loadRoster();
      loadAttendanceView();
    } catch (err) {
      setMsg(err.message || 'Failed to delete record');
    }
  };

  const deleteSelectedRecords = async () => {
    if (!selectedRecordIds.length) return;
    const idsToDelete = [...selectedRecordIds];
    const count = idsToDelete.length;
    if (
      !window.confirm(
        `Delete ${count} attendance record${count === 1 ? '' : 's'}? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const res = await portalPost('/teacher/attendance/bulk-delete', { ids: idsToDelete });
      const deletedCount = res.deletedCount ?? count;
      const editingId = editRecord ? portalDocId(editRecord) : '';
      setSelectedRecordIds([]);
      setMsg(`${deletedCount} attendance record${deletedCount === 1 ? '' : 's'} deleted.`);
      if (editingId && idsToDelete.includes(editingId)) setEditRecord(null);
      loadRoster();
      loadAttendanceView();
    } catch (err) {
      setMsg(err.message || 'Failed to delete records');
    }
  };

  const toggleStudentDetails = (studentId) => {
    const sid = studentKey(studentId);
    setExpandedStudentId((prev) => (prev === sid ? null : sid));
  };

  const studentDetailRecords = (studentId) => reportByStudent[studentKey(studentId)] || [];

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page portal-teacher-attendance">
      <PortalPageHeader
        title="Students attendance"
        subtitle="Mark daily attendance, then review records by day, week, or month."
      />

      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}

      <form className="portal-card portal-form-card" onSubmit={submitAttendance} autoComplete="off">
        <h3>Mark attendance</h3>

        <label className="portal-field-label">
          <span>Course</span>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={portalDocId(c)} value={portalDocId(c)}>
                {c.title}
              </option>
            ))}
          </select>
        </label>

        <label className="portal-field-label">
          <span>Attendance date</span>
          <input
            type="date"
            value={date}
            max={todayLocalDateStr()}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>

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
              <span>Student name</span>
              <span>Status</span>
              <span>Notes (optional)</span>
            </div>
            <div className="portal-attendance-grid">
              {roster.map((s) => {
                const sid = portalDocId(s);
                return (
                  <div key={sid} className="portal-attendance-row portal-attendance-row--cols">
                    <span className="portal-attendance-student-name">
                      {formatNameRoll(s.name, s.studentId)}
                    </span>
                    <select
                      aria-label={`Status for ${s.name}`}
                      value={marks[sid] || 'present'}
                      onChange={(e) => setMarks({ ...marks, [sid]: e.target.value })}
                    >
                      {STUDENT_MARK_ATTENDANCE_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label={`Notes for ${s.name}`}
                      placeholder="Note (optional)"
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
          Save daily attendance for entire class
        </button>
        {saveNotice ? (
          <p className="portal-attendance-save-success" role="status" aria-live="polite">
            {saveNotice}
          </p>
        ) : null}
      </form>

      <section className="portal-content-section portal-attendance-report-section">
        <h2 className="portal-content-section-title">Attendance report</h2>
        <p className="portal-attendance-report-hint">
          {!viewCourseId
            ? 'Select a course to view attendance records.'
            : viewPeriod === 'daily' && !String(viewDate || '').trim()
              ? 'Select a date to view attendance for that day.'
              : periodLabel || 'Select a course to view attendance records.'}
        </p>
        {viewError ? <PortalAlert type="error">{viewError}</PortalAlert> : null}

        <div className="portal-attendance-filter-bar">
          <label className="portal-field-label">
            <span>Course</span>
            <select value={viewCourseId} onChange={(e) => setViewCourseId(e.target.value)}>
              <option value="">Select course</option>
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
            <label className="portal-field-label">
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
                Select all ({deletableRecordIds.length})
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
                    <th>Attendance %</th>
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
                      <td>{attendancePercent(row)}</td>
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
                <h3>Edit attendance</h3>
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
                <i className="fas fa-save" /> Save changes
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
};

export default TeacherAttendance;
