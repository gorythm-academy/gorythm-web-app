import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../../config/constants';
import { getAuthToken } from '../../../utils/authStorage';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import {
  statusCalendarLabel,
  TEACHER_MY_STATUS_OPTIONS,
} from '../../../constants/attendanceStatuses';
import { formatWeekdayName } from '../../../utils/academyWeek';
import { formatTime12h } from '../../../utils/formatTime12h';
import ScheduleRoomOrLink from '../../Portals/shared/ScheduleRoomOrLink';
import './LmsManagement.scss';

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

const teacherInitials = (name) => {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

const statusMeta = (status) =>
  TEACHER_MY_STATUS_OPTIONS.find((o) => o.value === status) || {
    value: status,
    label: status || '—',
    icon: 'fa-circle',
    color: '#64748b',
  };

const TABS = [
  { id: 'schedules', label: 'Class schedules' },
  { id: 'parent-links', label: 'Parent links' },
  { id: 'teacher-attendance', label: 'Teacher attendance' },
  { id: 'teacher-payroll', label: 'Teacher payroll' },
];

const PAYROLL_STATUS_FILTERS = [
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'stale', label: 'Out of date' },
];

const formatPayrollMonth = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const payrollStatusLabel = (status) => {
  if (status === 'pending_review') return 'Pending review';
  if (status === 'stale') return 'Out of date';
  if (status === 'paid') return 'Paid';
  return status || '—';
};

const payrollStatusKey = (status) => {
  if (status === 'pending_review') return 'pending';
  if (status === 'stale') return 'stale';
  if (status === 'paid') return 'paid';
  return 'unknown';
};

const formatPaidDate = (paidAt) => {
  if (!paidAt) return null;
  const d = new Date(paidAt);
  if (Number.isNaN(d.getTime())) return null;
  return {
    display: d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    weekday: d.toLocaleDateString(undefined, { weekday: 'long' }),
    iso: d.toISOString().slice(0, 10),
  };
};

const PayrollMissingBanner = ({ alerts }) => {
  if (!alerts?.length) return null;
  return (
    <div className="lms-payroll-missing-banner" role="alert">
      <i className="fas fa-exclamation-triangle" aria-hidden="true" />
      <div>
        <strong>
          {alerts.length} approved month{alerts.length === 1 ? '' : 's'} without payroll
        </strong>
        <p>Accountant must add a salary profile or generate payroll manually.</p>
        <ul>
          {alerts.map((a) => (
            <li key={a._id}>
              <strong>{a.teacher?.name || 'Teacher'}</strong> — {formatPayrollMonth(a.monthKey)}:{' '}
              {a.payrollMissingReason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const EMPTY_SCHEDULE_FORM = {
  courseId: '',
  teacherId: '',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '10:00',
  roomOrLink: '',
};

const LmsManagement = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [tab, setTab] = useState('schedules');

  const [schedules, setSchedules] = useState([]);
  const [dayLabels, setDayLabels] = useState([]);
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE_FORM);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [scheduleListCourseFilter, setScheduleListCourseFilter] = useState('');
  const [selectedScheduleIds, setSelectedScheduleIds] = useState([]);
  const [scheduleBulkBusy, setScheduleBulkBusy] = useState(false);

  const [links, setLinks] = useState([]);
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [linkForm, setLinkForm] = useState({ parentId: '', studentId: '', relation: 'guardian' });
  const [requests, setRequests] = useState([]);
  const [attendanceFilter, setAttendanceFilter] = useState('pending');
  const [dailyDays, setDailyDays] = useState([]);
  const [dailyMonth, setDailyMonth] = useState(currentMonthKey());
  const [dailyStatusFilter, setDailyStatusFilter] = useState('pending');
  const [showMonthlyRollup, setShowMonthlyRollup] = useState(false);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [payrollFilter, setPayrollFilter] = useState('paid');
  const [payrollMissingAlerts, setPayrollMissingAlerts] = useState([]);
  const [payrollAttendanceModal, setPayrollAttendanceModal] = useState(null);
  const [payrollAttendanceBusy, setPayrollAttendanceBusy] = useState(null);

  const loadCourses = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const res = await axios.get(`${API_BASE_URL}/api/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCourses(res.data?.courses || []);
    } catch {
      setCourses([]);
    }
  }, []);

  const loadTeachersForCourse = useCallback(async (courseId) => {
    if (!courseId) {
      setTeachers([]);
      return;
    }
    try {
      const res = await lmsAdminGet(`/schedules?courseId=${encodeURIComponent(courseId)}`);
      if (res.success) setTeachers(res.teachers || []);
    } catch {
      setTeachers([]);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const meta = await lmsAdminGet('/schedules');
      if (meta.success) {
        setDayLabels(meta.dayLabels || []);
      }
      if (!scheduleListCourseFilter) {
        setSchedules([]);
        return;
      }
      const path =
        scheduleListCourseFilter === 'all'
          ? '/schedules'
          : `/schedules?courseId=${encodeURIComponent(scheduleListCourseFilter)}`;
      const res = await lmsAdminGet(path);
      if (res.success) setSchedules(res.schedules || []);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [scheduleListCourseFilter, showAlert]);

  const loadLinks = useCallback(async () => {
    try {
      const res = await lmsAdminGet('/parent-links');
      if (res.success) {
        setLinks(res.links || []);
        setParents(res.parents || []);
        setStudents(res.students || []);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [showAlert]);

  const loadRequests = useCallback(async () => {
    try {
      const q = attendanceFilter === 'all' ? 'all' : attendanceFilter;
      const res = await lmsAdminGet(`/teacher-attendance-requests?status=${q}`);
      if (res.success) setRequests(res.requests || []);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [showAlert, attendanceFilter]);

  const loadDailyDays = useCallback(async () => {
    try {
      const res = await lmsAdminGet(
        `/teacher-attendance-daily?month=${encodeURIComponent(dailyMonth)}&status=${dailyStatusFilter}`
      );
      if (res.success) setDailyDays(res.days || []);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [showAlert, dailyMonth, dailyStatusFilter]);

  const loadPayrollRuns = useCallback(async () => {
    try {
      const [runsRes, alertsRes] = await Promise.all([
        lmsAdminGet('/payroll-runs?status=all'),
        lmsAdminGet('/payroll-missing-alerts'),
      ]);
      if (runsRes.success) setPayrollRuns(runsRes.runs || []);
      if (alertsRes.success) setPayrollMissingAlerts(alertsRes.alerts || []);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [showAlert]);

  const loadPayrollAlerts = useCallback(async () => {
    try {
      const res = await lmsAdminGet('/payroll-missing-alerts');
      if (res.success) setPayrollMissingAlerts(res.alerts || []);
    } catch {
      setPayrollMissingAlerts([]);
    }
  }, []);

  const openPayrollAttendance = async (runId) => {
    setPayrollAttendanceBusy(runId);
    try {
      const res = await lmsAdminGet(`/payroll-runs/${runId}/attendance`);
      if (res.success) setPayrollAttendanceModal(res);
      else showAlert(res.error || 'Failed to load attendance', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setPayrollAttendanceBusy(null);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    loadTeachersForCourse(scheduleForm.courseId);
  }, [scheduleForm.courseId, loadTeachersForCourse]);

  useEffect(() => {
    if (tab === 'schedules') loadSchedules();
    if (tab === 'parent-links') loadLinks();
    if (tab === 'teacher-attendance') {
      loadDailyDays();
      loadRequests();
      loadPayrollAlerts();
    }
    if (tab === 'teacher-payroll') loadPayrollRuns();
  }, [tab, loadSchedules, loadLinks, loadRequests, loadDailyDays, loadPayrollRuns, loadPayrollAlerts]);

  useEffect(() => {
    if (tab === 'teacher-attendance') loadDailyDays();
  }, [dailyMonth, dailyStatusFilter, tab, loadDailyDays]);

  useEffect(() => {
    if (tab === 'teacher-attendance' && showMonthlyRollup) loadRequests();
  }, [attendanceFilter, tab, showMonthlyRollup, loadRequests]);

  useEffect(() => {
    setSelectedScheduleIds([]);
  }, [scheduleListCourseFilter]);

  const resetScheduleForm = () => {
    setScheduleForm(EMPTY_SCHEDULE_FORM);
    setEditingScheduleId(null);
  };

  const startEditSchedule = (s) => {
    setEditingScheduleId(s._id);
    setScheduleForm({
      courseId: s.course?._id || s.course || '',
      teacherId: s.teacher?._id || s.teacher || '',
      dayOfWeek: s.dayOfWeek ?? 1,
      startTime: s.startTime || '09:00',
      endTime: s.endTime || '10:00',
      roomOrLink: s.roomOrLink || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveSchedule = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...scheduleForm,
        dayOfWeek: Number(scheduleForm.dayOfWeek),
      };
      const res = editingScheduleId
        ? await lmsAdminPatch(`/schedules/${editingScheduleId}`, payload)
        : await lmsAdminPost('/schedules', payload);

      if (res.success) {
        showAlert(editingScheduleId ? 'Schedule updated.' : 'Schedule added.', 'success');
        resetScheduleForm();
        loadSchedules();
      } else {
        showAlert(res.error || 'Failed', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const removeSchedule = async (id) => {
    const ok = await showConfirm({
      title: 'Remove schedule',
      message: 'Remove this class timing? Students assigned to this slot will be unassigned.',
      confirmLabel: 'Remove',
      type: 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminDelete(`/schedules/${id}`);
      if (res.success) {
        showAlert('Schedule removed.', 'success');
        if (editingScheduleId === id) resetScheduleForm();
        setSelectedScheduleIds((prev) => prev.filter((sid) => sid !== id));
        loadSchedules();
      } else {
        showAlert(res.error || 'Failed to remove', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const toggleScheduleSelection = (id) => {
    setSelectedScheduleIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const toggleAllSchedules = () => {
    if (selectedScheduleIds.length === schedules.length && schedules.length > 0) {
      setSelectedScheduleIds([]);
    } else {
      setSelectedScheduleIds(schedules.map((s) => s._id));
    }
  };

  const removeSelectedSchedules = async () => {
    if (!selectedScheduleIds.length || scheduleBulkBusy) return;
    const ok = await showConfirm({
      title: 'Remove selected schedules?',
      message: `Remove ${selectedScheduleIds.length} class timing(s)? Students on those slots will be unassigned.`,
      confirmLabel: 'Remove selected',
      type: 'warning',
    });
    if (!ok) return;

    setScheduleBulkBusy(true);
    try {
      const res = await lmsAdminPost('/schedules/bulk-delete', { ids: selectedScheduleIds });
      if (res.success) {
        showAlert(res.message || 'Schedules removed.', 'success');
        if (selectedScheduleIds.includes(editingScheduleId)) resetScheduleForm();
        setSelectedScheduleIds([]);
        loadSchedules();
      } else {
        showAlert(res.error || 'Failed to remove schedules', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setScheduleBulkBusy(false);
    }
  };

  const addLink = async (e) => {
    e.preventDefault();
    try {
      const res = await lmsAdminPost('/parent-links', linkForm);
      if (res.success) {
        showAlert('Parent linked to student.', 'success');
        loadLinks();
      } else showAlert(res.error || 'Failed', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const removeLink = async (id) => {
    const ok = await showConfirm({
      title: 'Remove link',
      message: 'Remove this parent–student link?',
      confirmLabel: 'Remove',
      type: 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminDelete(`/parent-links/${id}`);
      if (res.success) {
        showAlert('Link removed.', 'success');
        loadLinks();
      } else showAlert(res.error || 'Failed', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const reviewDailyDay = async (id, status) => {
    if (!id) return;
    const ok = await showConfirm({
      title: status === 'approved' ? 'Approve this day?' : 'Reject this day?',
      message:
        status === 'approved'
          ? 'This day will be marked approved.'
          : 'The teacher may update and resubmit this day.',
      confirmLabel: status === 'approved' ? 'Approve' : 'Reject',
      type: status === 'approved' ? 'default' : 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminPatch(`/teacher-attendance-daily/${id}`, { status });
      if (res.success) {
        showAlert(`Day ${status}.`, 'success');
        loadDailyDays();
        if (showMonthlyRollup) loadRequests();
      } else showAlert(res.error || 'Failed', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const dailyApprovalStats = useMemo(() => {
    const stats = { total: dailyDays.length, pending: 0, approved: 0, rejected: 0 };
    dailyDays.forEach((d) => {
      const key = d.approvalStatus || 'pending';
      if (stats[key] != null) stats[key] += 1;
    });
    return stats;
  }, [dailyDays]);

  const monthlyApprovalStats = useMemo(() => {
    const stats = { total: requests.length, pending: 0, approved: 0, rejected: 0 };
    requests.forEach((r) => {
      const key = r.status || 'pending';
      if (stats[key] != null) stats[key] += 1;
    });
    return stats;
  }, [requests]);

  const payrollStats = useMemo(() => {
    const stats = { total: payrollRuns.length, paid: 0, pending: 0, stale: 0 };
    payrollRuns.forEach((r) => {
      if (r.status === 'paid') stats.paid += 1;
      else if (r.status === 'pending_review') stats.pending += 1;
      else if (r.status === 'stale') stats.stale += 1;
    });
    return stats;
  }, [payrollRuns]);

  const payrollFilteredRuns = useMemo(() => {
    if (payrollFilter === 'all') return payrollRuns;
    return payrollRuns.filter((r) => r.status === payrollFilter);
  }, [payrollRuns, payrollFilter]);

  const reviewRequest = async (id, status) => {
    if (!id) {
      showAlert('Invalid request id.', 'error');
      return;
    }
    const ok = await showConfirm({
      title: status === 'approved' ? 'Approve monthly attendance?' : 'Reject attendance?',
      message:
        status === 'approved'
          ? 'Only available after the calendar month has ended. Payroll will be auto-generated for the accountant to review.'
          : 'The teacher may submit again after rejection.',
      confirmLabel: status === 'approved' ? 'Approve month' : 'Reject',
      type: status === 'approved' ? 'default' : 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminPatch(`/teacher-attendance-requests/${id}`, { status });
      if (res.success) {
        if (status === 'approved' && res.payroll) {
          showAlert(
            `Month approved. Payroll auto-generated ($${Number(res.payroll.finalSalary || 0).toFixed(2)}) — pending accountant review.`,
            'success'
          );
        } else if (status === 'approved' && res.payrollError) {
          showAlert(
            `Month approved, but payroll was not generated: ${res.payrollError}. Accountant must set salary profile or regenerate later.`,
            'warning'
          );
        } else {
          showAlert(`Attendance ${status}.`, 'success');
        }
        loadRequests();
        loadPayrollAlerts();
      } else showAlert(res.error || 'Failed', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const dayOptions = dayLabels.length
    ? dayLabels
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="lms-management">
      <h1>LMS management</h1>
      <p className="lms-management-lead">
        Class timings, parent–child links, teacher attendance approvals, and paid payroll records.
      </p>
      <div className="lms-management-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'schedules' && (
        <section className="lms-panel lms-schedules-panel">
          <div className="lms-schedule-layout">
            <div className={`lms-schedule-form-card${editingScheduleId ? ' lms-schedule-form-card--editing' : ''}`}>
              <header className="lms-schedule-form-card__head">
                <span className="lms-schedule-form-card__icon" aria-hidden="true">
                  <i className={`fas ${editingScheduleId ? 'fa-pen' : 'fa-plus'}`} />
                </span>
                <div>
                  <h2>{editingScheduleId ? 'Edit class schedule' : 'Add class schedule'}</h2>
                  <p>One row = one weekly time slot with a teacher for a course.</p>
                </div>
              </header>
              <form className="lms-schedule-form-grid" onSubmit={saveSchedule}>
                <label className="lms-schedule-field lms-schedule-field--full">
                  <span><i className="fas fa-book" /> Course</span>
                  <select
                    value={scheduleForm.courseId}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, courseId: e.target.value, teacherId: '' })
                    }
                    required
                  >
                    <option value="">Select course…</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="lms-schedule-field lms-schedule-field--full">
                  <span><i className="fas fa-chalkboard-teacher" /> Teacher</span>
                  <select
                    value={scheduleForm.teacherId}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, teacherId: e.target.value })}
                    disabled={!scheduleForm.courseId}
                  >
                    <option value="">
                      {scheduleForm.courseId
                        ? 'Default to course instructor'
                        : 'Select a course first'}
                    </option>
                    {teachers.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} ({t.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="lms-schedule-field">
                  <span><i className="fas fa-calendar-day" /> Day</span>
                  <select
                    value={scheduleForm.dayOfWeek}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, dayOfWeek: Number(e.target.value) })
                    }
                  >
                    {dayOptions.map((label, i) => (
                      <option key={label} value={i}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="lms-schedule-field">
                  <span><i className="fas fa-clock" /> Start</span>
                  <input
                    type="time"
                    value={scheduleForm.startTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                    required
                  />
                </label>
                <label className="lms-schedule-field">
                  <span><i className="fas fa-clock" /> End</span>
                  <input
                    type="time"
                    value={scheduleForm.endTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                    required
                  />
                </label>
                <label className="lms-schedule-field lms-schedule-field--full">
                  <span><i className="fas fa-link" /> Room or meeting link</span>
                  <input
                    type="text"
                    placeholder="Room 2 or https://meet…"
                    value={scheduleForm.roomOrLink}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, roomOrLink: e.target.value })}
                  />
                </label>
                <div className="lms-schedule-form-actions lms-schedule-field--full">
                  <button type="submit" className="lms-schedule-btn-primary">
                    <i className={`fas ${editingScheduleId ? 'fa-save' : 'fa-plus'}`} />
                    {editingScheduleId ? 'Save changes' : 'Add schedule'}
                  </button>
                  {editingScheduleId ? (
                    <button type="button" className="lms-schedule-btn-secondary" onClick={resetScheduleForm}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            </div>

            <div className="lms-schedule-board">
              <div className="lms-schedule-board__head">
                <div className="lms-schedule-board__title">
                  <span className="lms-schedule-board__icon" aria-hidden="true">
                    <i className="fa-solid fa-calendar-days" />
                  </span>
                  <div>
                    <h3>Class schedule list</h3>
                    <p>Filter by course, select rows, and remove in bulk.</p>
                  </div>
                </div>
                <label className="lms-field-label lms-schedule-board__filter">
                  <span>View by course</span>
                  <select
                    value={scheduleListCourseFilter}
                    onChange={(e) => setScheduleListCourseFilter(e.target.value)}
                  >
                    <option value="">Select course…</option>
                    <option value="all">All courses</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedScheduleIds.length > 0 ? (
                <div className="lms-schedule-bulk-bar">
                  <span className="lms-schedule-bulk-bar__count">
                    <i className="fas fa-check-circle" />
                    {selectedScheduleIds.length} selected
                  </span>
                  <div className="lms-schedule-bulk-bar__actions">
                    <button
                      type="button"
                      className="lms-schedule-bulk-bar__delete"
                      disabled={scheduleBulkBusy}
                      onClick={removeSelectedSchedules}
                    >
                      <i className="fas fa-trash" /> Remove selected
                    </button>
                    <button
                      type="button"
                      className="lms-schedule-bulk-bar__clear"
                      disabled={scheduleBulkBusy}
                      onClick={() => setSelectedScheduleIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}

              {!scheduleListCourseFilter ? (
                <div className="lms-schedule-board__empty">
                  <i className="fas fa-filter" />
                  <p>Select a course or &quot;All courses&quot; to view class schedules.</p>
                </div>
              ) : schedules.length === 0 ? (
                <div className="lms-schedule-board__empty">
                  <i className="fas fa-calendar-xmark" />
                  <p>No class timings for this selection. Add one using the form.</p>
                </div>
              ) : (
                <>
                  <div className="lms-schedule-board__meta">
                    <span className="lms-schedule-board__count">
                      {schedules.length} slot{schedules.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="lms-schedule-table-wrap">
                    <table className="lms-schedule-table">
                      <thead>
                        <tr>
                          <th className="lms-schedule-table__check">
                            <input
                              type="checkbox"
                              aria-label="Select all schedules"
                              checked={
                                schedules.length > 0 &&
                                selectedScheduleIds.length === schedules.length
                              }
                              onChange={toggleAllSchedules}
                            />
                          </th>
                          <th>Day</th>
                          <th>Time</th>
                          <th>Course</th>
                          <th>Teacher</th>
                          <th>Room / link</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.map((s) => (
                          <tr
                            key={s._id}
                            className={[
                              editingScheduleId === s._id ? 'lms-schedule-row--editing' : '',
                              selectedScheduleIds.includes(s._id) ? 'lms-schedule-row--selected' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <td className="lms-schedule-table__check">
                              <input
                                type="checkbox"
                                aria-label={`Select ${s.course?.title || 'schedule'}`}
                                checked={selectedScheduleIds.includes(s._id)}
                                onChange={() => toggleScheduleSelection(s._id)}
                              />
                            </td>
                            <td>
                              <span className="lms-schedule-day-badge">
                                {dayOptions[s.dayOfWeek] || s.dayOfWeek}
                              </span>
                            </td>
                            <td className="lms-schedule-time">
                              {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                            </td>
                            <td className="lms-schedule-course">{s.course?.title || '—'}</td>
                            <td className="lms-schedule-teacher">
                              <span className="lms-schedule-teacher__name">
                                {s.teacher?.name || '—'}
                              </span>
                              {s.teacher?.email ? (
                                <small>{s.teacher.email}</small>
                              ) : null}
                            </td>
                            <td>
                              <ScheduleRoomOrLink
                                value={s.roomOrLink}
                                className="lms-schedule-link"
                              />
                            </td>
                            <td className="lms-list-actions">
                              <button
                                type="button"
                                className="lms-schedule-action lms-schedule-action--edit"
                                title="Edit"
                                onClick={() => startEditSchedule(s)}
                              >
                                <i className="fas fa-pen" />
                              </button>
                              <button
                                type="button"
                                className="lms-schedule-action lms-schedule-action--delete"
                                title="Remove"
                                onClick={() => removeSchedule(s._id)}
                              >
                                <i className="fas fa-trash" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'parent-links' && (
        <section className="lms-panel">
          <form className="lms-form" onSubmit={addLink}>
            <h2>Link parent to student</h2>
            <select
              value={linkForm.parentId}
              onChange={(e) => setLinkForm({ ...linkForm, parentId: e.target.value })}
              required
            >
              <option value="">Parent</option>
              {parents.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>
            <select
              value={linkForm.studentId}
              onChange={(e) => setLinkForm({ ...linkForm, studentId: e.target.value })}
              required
            >
              <option value="">Student</option>
              {students.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} {s.studentId ? `(${s.studentId})` : ''}
                </option>
              ))}
            </select>
            <select
              value={linkForm.relation}
              onChange={(e) => setLinkForm({ ...linkForm, relation: e.target.value })}
            >
              <option value="guardian">Guardian</option>
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="other">Other</option>
            </select>
            <button type="submit">Link</button>
          </form>
          <ul className="lms-list">
            {links.map((l) => (
              <li key={l._id}>
                <span>
                  {l.parent?.name} → {l.student?.name} ({l.relation})
                </span>
                <button type="button" className="lms-link-btn" onClick={() => removeLink(l._id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'teacher-attendance' && (
        <section className="lms-panel lms-attendance-panel">
          <header className="lms-attendance-hero">
            <div className="lms-attendance-hero__icon" aria-hidden="true">
              <i className="fas fa-user-check" />
            </div>
            <div className="lms-attendance-hero__text">
              <h2>Teacher attendance approval</h2>
              <p>
                Approve daily submissions during the month. Approve the monthly rollup only after the
                month ends — payroll is then auto-generated for the accountant. Sundays are auto-counted.
              </p>
            </div>
          </header>

          <PayrollMissingBanner alerts={payrollMissingAlerts} />

          <div className="lms-attendance-stat-row">
            <div className="lms-attendance-stat lms-attendance-stat--total">
              <span className="lms-attendance-stat__value">{dailyApprovalStats.total}</span>
              <span className="lms-attendance-stat__label">Submissions</span>
            </div>
            <div className="lms-attendance-stat lms-attendance-stat--pending">
              <span className="lms-attendance-stat__value">{dailyApprovalStats.pending}</span>
              <span className="lms-attendance-stat__label">Pending</span>
            </div>
            <div className="lms-attendance-stat lms-attendance-stat--approved">
              <span className="lms-attendance-stat__value">{dailyApprovalStats.approved}</span>
              <span className="lms-attendance-stat__label">Approved</span>
            </div>
            <div className="lms-attendance-stat lms-attendance-stat--rejected">
              <span className="lms-attendance-stat__value">{dailyApprovalStats.rejected}</span>
              <span className="lms-attendance-stat__label">Rejected</span>
            </div>
          </div>

          <div className="lms-attendance-toolbar">
            <div className="lms-attendance-toolbar__filters">
              <label className="lms-attendance-field">
                <span>
                  <i className="fas fa-calendar-alt" aria-hidden="true" /> Month
                </span>
                <input
                  type="month"
                  value={dailyMonth}
                  onChange={(e) => setDailyMonth(e.target.value)}
                />
              </label>
              <label className="lms-attendance-field">
                <span>
                  <i className="fas fa-filter" aria-hidden="true" /> Approval status
                </span>
                <select
                  value={dailyStatusFilter}
                  onChange={(e) => setDailyStatusFilter(e.target.value)}
                >
                  <option value="pending">Pending approval</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="all">All</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="lms-attendance-refresh-btn"
              onClick={loadDailyDays}
            >
              <i className="fas fa-sync-alt" aria-hidden="true" /> Refresh
            </button>
          </div>

          <div className="lms-attendance-section">
            <h3 className="lms-attendance-section__title">
              <i className="fas fa-calendar-day" aria-hidden="true" /> Daily submissions
            </h3>

            {dailyDays.length === 0 ? (
              <div className="lms-attendance-empty">
                <i className="fas fa-inbox" aria-hidden="true" />
                <p>No daily attendance for this month and filter.</p>
              </div>
            ) : (
              <div className="lms-attendance-table-wrap">
                <table className="lms-attendance-list-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Teacher</th>
                      <th>Status</th>
                      <th>Notes</th>
                      <th>Approval</th>
                      <th>Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyDays.map((d) => {
                      const meta = statusMeta(d.status);
                      const approval = d.approvalStatus || 'pending';
                      return (
                        <tr key={d._id} className={`lms-attendance-list-row lms-attendance-list-row--${approval}`}>
                          <td className="lms-attendance-date-cell">
                            <strong>{d.date}</strong>
                            <span className="lms-attendance-day-name">{formatWeekdayName(d.date)}</span>
                          </td>
                          <td>
                            <div className="lms-attendance-list-teacher">
                              <span className="lms-attendance-avatar" aria-hidden="true">
                                {teacherInitials(d.teacher?.name)}
                              </span>
                              <span>
                                <strong>{d.teacher?.name || '—'}</strong>
                                <small>{d.teacher?.email || ''}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className="lms-attendance-status-badge"
                              style={{ '--badge-color': meta.color }}
                            >
                              <i className={`fas ${meta.icon}`} aria-hidden="true" />
                              {statusCalendarLabel(d.status)}
                            </span>
                          </td>
                          <td className="lms-attendance-notes-cell">{d.notes || '—'}</td>
                          <td>
                            <span className={`lms-status-pill lms-status-pill--${approval}`}>
                              {approval}
                            </span>
                          </td>
                          <td className="lms-attendance-date-cell">
                            {d.submittedAt ? (
                              <>
                                <strong>
                                  {new Date(d.submittedAt).toLocaleDateString(undefined, {
                                    dateStyle: 'medium',
                                  })}
                                </strong>
                                <span className="lms-attendance-day-name">
                                  {new Date(d.submittedAt).toLocaleDateString(undefined, {
                                    weekday: 'long',
                                  })}
                                </span>
                                <span className="lms-attendance-time">
                                  {new Date(d.submittedAt).toLocaleTimeString(undefined, {
                                    timeStyle: 'short',
                                  })}
                                </span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="lms-attendance-list-actions">
                            {approval === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  className="lms-attendance-btn lms-attendance-btn--approve"
                                  onClick={() => reviewDailyDay(d._id, 'approved')}
                                >
                                  <i className="fas fa-check" aria-hidden="true" /> Approve
                                </button>
                                <button
                                  type="button"
                                  className="lms-attendance-btn lms-attendance-btn--reject"
                                  onClick={() => reviewDailyDay(d._id, 'rejected')}
                                >
                                  <i className="fas fa-times" aria-hidden="true" /> Reject
                                </button>
                              </>
                            ) : (
                              <span className="lms-attendance-reviewed">
                                {d.reviewedBy?.name ? `By ${d.reviewedBy.name}` : 'Reviewed'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="lms-attendance-rollup">
            <button
              type="button"
              className={`lms-attendance-rollup-toggle ${showMonthlyRollup ? 'is-open' : ''}`}
              onClick={() => setShowMonthlyRollup((v) => !v)}
              aria-expanded={showMonthlyRollup}
            >
              <span>
                <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                Monthly rollup (payroll)
              </span>
              <span className="lms-attendance-rollup-toggle__meta">
                {monthlyApprovalStats.pending} pending
                <i className={`fas fa-chevron-${showMonthlyRollup ? 'up' : 'down'}`} aria-hidden="true" />
              </span>
            </button>

            {showMonthlyRollup ? (
              <div className="lms-attendance-rollup-body">
                <div className="lms-attendance-toolbar lms-attendance-toolbar--compact">
                  <label className="lms-attendance-field">
                    <span>
                      <i className="fas fa-filter" aria-hidden="true" /> Rollup status
                    </span>
                    <select
                      value={attendanceFilter}
                      onChange={(e) => setAttendanceFilter(e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="all">All</option>
                    </select>
                  </label>
                </div>

                {requests.length === 0 ? (
                  <div className="lms-attendance-empty lms-attendance-empty--compact">
                    <p>No monthly rollups for this filter.</p>
                  </div>
                ) : (
                  <div className="lms-attendance-table-wrap">
                    <table className="lms-attendance-list-table">
                      <thead>
                        <tr>
                          <th>Teacher</th>
                          <th>Month</th>
                          <th>Present</th>
                          <th>Late</th>
                          <th>Leave</th>
                          <th>Absent</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((r) => {
                          const monthStatus = r.status || 'pending';
                          return (
                            <tr
                              key={r._id}
                              className={`lms-attendance-list-row lms-attendance-list-row--${monthStatus}`}
                            >
                              <td>
                                <div className="lms-attendance-list-teacher">
                                  <span className="lms-attendance-avatar" aria-hidden="true">
                                    {teacherInitials(r.teacher?.name)}
                                  </span>
                                  <span>
                                    <strong>{r.teacher?.name || '—'}</strong>
                                    <small>{r.teacher?.email || ''}</small>
                                  </span>
                                </div>
                              </td>
                              <td className="lms-attendance-date-cell">
                                <strong>{r.monthKey}</strong>
                                <span className="lms-attendance-day-name">
                                  {formatMonthLabel(r.monthKey)}
                                </span>
                              </td>
                              <td>{r.presentDays ?? 0}</td>
                              <td>{r.lateDays ?? 0}</td>
                              <td>{r.leaveDays ?? 0}</td>
                              <td>{r.absentDays ?? 0}</td>
                              <td>
                                <span className={`lms-status-pill lms-status-pill--${monthStatus}`}>
                                  {monthStatus}
                                </span>
                              </td>
                              <td className="lms-attendance-list-actions">
                                {monthStatus === 'pending' ? (
                                  <>
                                    <button
                                      type="button"
                                      className="lms-attendance-btn lms-attendance-btn--approve"
                                      onClick={() => reviewRequest(r._id, 'approved')}
                                    >
                                      <i className="fas fa-check-double" aria-hidden="true" /> Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="lms-attendance-btn lms-attendance-btn--reject"
                                      onClick={() => reviewRequest(r._id, 'rejected')}
                                    >
                                      <i className="fas fa-times" aria-hidden="true" /> Reject
                                    </button>
                                  </>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      )}

      {tab === 'teacher-payroll' && (
        <section className="lms-panel lms-payroll-panel">
          <header className="lms-payroll-hero">
            <div className="lms-payroll-hero__icon" aria-hidden="true">
              <i className="fas fa-money-check-alt" />
            </div>
            <div className="lms-payroll-hero__text">
              <h2>Teacher payroll records</h2>
              <p>
                Payroll is auto-generated when admin approves monthly attendance. The accountant reviews,
                edits if needed, and marks runs paid — completed payments appear here by default.
              </p>
            </div>
          </header>

          <PayrollMissingBanner alerts={payrollMissingAlerts} />

          <div className="lms-payroll-stat-row">
            <div className="lms-payroll-stat lms-payroll-stat--total">
              <span className="lms-payroll-stat__value">{payrollStats.total}</span>
              <span className="lms-payroll-stat__label">Total runs</span>
            </div>
            <div className="lms-payroll-stat lms-payroll-stat--paid">
              <span className="lms-payroll-stat__value">{payrollStats.paid}</span>
              <span className="lms-payroll-stat__label">Paid</span>
            </div>
            <div className="lms-payroll-stat lms-payroll-stat--pending">
              <span className="lms-payroll-stat__value">{payrollStats.pending}</span>
              <span className="lms-payroll-stat__label">Pending review</span>
            </div>
            <div className="lms-payroll-stat lms-payroll-stat--stale">
              <span className="lms-payroll-stat__value">{payrollStats.stale}</span>
              <span className="lms-payroll-stat__label">Out of date</span>
            </div>
          </div>

          <div className="lms-payroll-toolbar">
            <div className="lms-payroll-filters" role="tablist" aria-label="Payroll status">
              {PAYROLL_STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={payrollFilter === f.value}
                  className={payrollFilter === f.value ? 'active' : ''}
                  onClick={() => setPayrollFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="lms-payroll-refresh-btn"
              onClick={loadPayrollRuns}
            >
              <i className="fas fa-sync-alt" aria-hidden="true" /> Refresh
            </button>
          </div>

          <div className="lms-payroll-section">
            <h3 className="lms-payroll-section__title">
              <i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Payroll runs
            </h3>

            {payrollFilteredRuns.length === 0 ? (
              <div className="lms-payroll-empty">
                <i className="fas fa-inbox" aria-hidden="true" />
                <p>
                  {payrollRuns.length === 0
                    ? 'No payroll runs yet. They appear after admin approves monthly attendance and the accountant processes them.'
                    : 'No payroll runs match this filter.'}
                </p>
              </div>
            ) : (
              <div className="lms-payroll-table-wrap">
                <table className="lms-payroll-list-table">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Month</th>
                      <th>Profile salary</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Deduction</th>
                      <th>Final salary</th>
                      <th>Status</th>
                      <th>Source</th>
                      <th>Paid</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollFilteredRuns.map((r) => {
                      const statusKey = payrollStatusKey(r.status);
                      const paidMeta = formatPaidDate(r.paidAt);
                      const profileSalary =
                        r.profileSalary != null ? r.profileSalary : r.monthlySalary || 0;
                      return (
                        <tr
                          key={r._id}
                          className={`lms-payroll-list-row lms-payroll-list-row--${statusKey}`}
                        >
                          <td>
                            <div className="lms-payroll-list-teacher">
                              <span className="lms-payroll-avatar" aria-hidden="true">
                                {teacherInitials(r.teacher?.name)}
                              </span>
                              <div>
                                <strong>{r.teacher?.name || '—'}</strong>
                                <small>{r.teacher?.email || ''}</small>
                              </div>
                            </div>
                          </td>
                          <td className="lms-payroll-date-cell">
                            <strong>{formatPayrollMonth(r.monthKey)}</strong>
                            <span className="lms-payroll-day-name">{r.monthKey}</span>
                          </td>
                          <td>${Number(profileSalary).toFixed(2)}</td>
                          <td>{r.presentDays ?? 0}</td>
                          <td>{r.absentDays ?? 0}</td>
                          <td className="lms-payroll-deduction">
                            −${Number(r.deduction || 0).toFixed(2)}
                          </td>
                          <td>
                            <strong className="lms-payroll-final">
                              ${Number(r.finalSalary || 0).toFixed(2)}
                            </strong>
                          </td>
                          <td>
                            <span className={`lms-payroll-status-pill lms-payroll-status-pill--${statusKey}`}>
                              {payrollStatusLabel(r.status)}
                            </span>
                            {r.status === 'stale' && r.staleReason ? (
                              <span className="lms-payroll-stale-hint" title={r.staleReason}>
                                <i className="fas fa-info-circle" aria-hidden="true" />
                              </span>
                            ) : null}
                          </td>
                          <td>
                            <div className="lms-payroll-source-flags">
                              {r.autoGenerated ? (
                                <span className="lms-payroll-source-pill">Auto-generated</span>
                              ) : (
                                <span className="lms-payroll-source-pill lms-payroll-source-pill--manual">
                                  Manual
                                </span>
                              )}
                              {r.editedByAccountant ? (
                                <span className="lms-payroll-source-pill lms-payroll-source-pill--edited">
                                  Edited
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="lms-payroll-date-cell">
                            {paidMeta ? (
                              <>
                                <strong>{paidMeta.display}</strong>
                                <span className="lms-payroll-day-name">{paidMeta.weekday}</span>
                                {r.paidBy?.name ? (
                                  <span className="lms-payroll-paid-by">by {r.paidBy.name}</span>
                                ) : null}
                              </>
                            ) : (
                              <span className="lms-payroll-unpaid">—</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="lms-payroll-attendance-btn"
                              disabled={payrollAttendanceBusy === r._id}
                              onClick={() => openPayrollAttendance(r._id)}
                            >
                              Attendance
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {payrollAttendanceModal ? (
        <div
          className="lms-payroll-modal-backdrop"
          role="presentation"
          onClick={() => setPayrollAttendanceModal(null)}
        >
          <div
            className="lms-payroll-modal"
            role="dialog"
            aria-labelledby="lms-payroll-attendance-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="lms-payroll-attendance-title">
              Attendance — {payrollAttendanceModal.run?.teacher?.name} (
              {formatPayrollMonth(payrollAttendanceModal.run?.monthKey)})
            </h3>
            {payrollAttendanceModal.attendance?.monthlyRequest ? (
              <div className="lms-payroll-attendance-summary">
                <span>Present: {payrollAttendanceModal.attendance.monthlyRequest.presentDays ?? 0}</span>
                <span>Late: {payrollAttendanceModal.attendance.monthlyRequest.lateDays ?? 0}</span>
                <span>Leave: {payrollAttendanceModal.attendance.monthlyRequest.leaveDays ?? 0}</span>
                <span>Absent: {payrollAttendanceModal.attendance.monthlyRequest.absentDays ?? 0}</span>
                <span>Status: {payrollAttendanceModal.attendance.monthlyRequest.status}</span>
              </div>
            ) : (
              <p className="lms-payroll-modal-hint">No monthly rollup on file for this month.</p>
            )}
            <div className="lms-payroll-table-wrap">
              <table className="lms-payroll-list-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Status</th>
                    <th>Admin approval</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(payrollAttendanceModal.attendance?.dailyRows || []).map((row) => (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td>{formatWeekdayName(row.date)}</td>
                      <td>{row.mark ? statusCalendarLabel(row.mark.status) : row.label || '—'}</td>
                      <td>{row.mark?.approvalStatus || '—'}</td>
                      <td>{row.mark?.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lms-payroll-modal__actions">
              <button
                type="button"
                className="lms-payroll-attendance-btn"
                onClick={() => setPayrollAttendanceModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LmsManagement;
