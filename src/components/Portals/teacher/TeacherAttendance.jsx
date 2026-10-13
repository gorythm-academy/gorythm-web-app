import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import { PortalDataSection, PortalPageHeader } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import '../student/StudentAttendance.scss';
import { formatAcademyWeekLabel, currentAcademyWeekMonday, toLocalDateStr, isFutureLocalDate } from '../../../utils/academyWeek';
import { TeacherAttendanceView } from './TeacherAttendanceView';

const studentKey = (id) => {
  if (id == null || id === '') return '';
  if (typeof id === 'object') return portalDocId(id);
  return String(id).trim();
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
  const [rosterError, setRosterError] = useState('');
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
          setRosterError('');
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
        } else {
          setRoster([]);
          setRosterCount(0);
          setRosterError(res.error || 'Failed to load class roster');
        }
      })
      .catch((err) => {
        setRoster([]);
        setRosterCount(0);
        setRosterError(err.message || 'Failed to load class roster');
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

  const [coursesLoadError, setCoursesLoadError] = useState('');

  useEffect(() => {
    portalGet('/teacher/courses')
      .then((cRes) => {
        if (cRes.success) setCourses(cRes.courses || []);
        else setCoursesLoadError(cRes.error || 'Failed to load courses');
      })
      .catch((err) => setCoursesLoadError(err.message || 'Failed to load courses'))
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
  const summaryTableCols = viewPeriod === 'daily' ? 5 : 7;
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
        <section className="student-attendance__panel">
          <PortalDataSection loading loadingLabel="Loading courses…" />
        </section>
      </div>
    );
  }

  return (
        <TeacherAttendanceView
            state={{
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
            }}
        />
    );
};

export default TeacherAttendance;
