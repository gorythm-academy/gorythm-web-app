import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../../../config/constants';
import { getAuthToken } from '../../../utils/authStorage';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../utils/lmsAdminApi';
import { fetchLmsTabBadges, invalidateLmsTabBadgesCache } from '../../../hooks/useAdminPortalBadges';
import { ADMIN_LMS_ATTENDANCE_UPDATED_EVENT } from '../../../utils/adminEvents';
import { useAdminDialog } from '../AdminDialogContext';
import { DEFAULT_ACADEMY_TIMEZONE } from '../../../utils/scheduleTimezone';
import { sortPublishedCourses } from '../../../utils/studentAdminValidation';
import PayrollMonthAttendanceModal from '../../shared/PayrollMonthAttendanceModal';
import { useAdminSearch } from '../../../hooks/useAdminSearch';
import { filterByKeywordSearch } from '../../../utils/adminSearch';
import SchedulesTab from './LmsManagement/SchedulesTab';
import ParentLinksTab from './LmsManagement/ParentLinksTab';
import TeacherAttendanceTab from './LmsManagement/TeacherAttendanceTab';
import TeacherPayrollTab from './LmsManagement/TeacherPayrollTab';
import { formatPayrollMonth, formatRelationLabel } from './LmsManagement/lmsHelpers';
import './LmsManagement.scss';

const PARENT_LINKS_PAGE_SIZE = 20;
const LINK_PICKER_LIMIT = 500;

const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Karachi',
  'Europe/Amsterdam',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
];

const scheduleTimeToMinutes = (timeStr) => {
  const parts = String(timeStr || '').split(':');
  if (parts.length < 2) return NaN;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
};

const scheduleTimeError = (startTime, endTime) => {
  if (!startTime || !endTime) return 'Start and end time are required.';
  const start = scheduleTimeToMinutes(startTime);
  const end = scheduleTimeToMinutes(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Invalid time format.';
  if (end <= start) return 'End time must be after start time.';
  return null;
};

const currentMonthKey = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

const TABS = [
  { id: 'schedules', label: 'Class Schedules' },
  { id: 'parent-links', label: 'Parent Links' },
  { id: 'teacher-attendance', label: 'Teacher Attendance Approvals' },
  { id: 'teacher-payroll', label: 'Teacher Payroll Records' },
];

const LMS_TAB_IDS = TABS.map((t) => t.id);

const EMPTY_SCHEDULE_FORM = {
  courseId: '',
  teacherId: '',
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '10:00',
  timezone: DEFAULT_ACADEMY_TIMEZONE,
  roomOrLink: '',
};

const EMPTY_LINK_FORM = { parentId: '', studentId: '', relation: 'guardian' };
const LmsManagement = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const fromUrl = searchParams.get('tab');
    return LMS_TAB_IDS.includes(fromUrl) ? fromUrl : 'schedules';
  });

  const selectTab = useCallback(
    (tabId) => {
      if (!LMS_TAB_IDS.includes(tabId)) return;
      setTab(tabId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === 'schedules') next.delete('tab');
          else next.set('tab', tabId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const fromUrl = searchParams.get('tab');
    if (fromUrl && LMS_TAB_IDS.includes(fromUrl) && fromUrl !== tab) {
      setTab(fromUrl);
    }
  }, [searchParams, tab]);

  const [schedules, setSchedules] = useState([]);
  const [academyTimezone, setAcademyTimezone] = useState(DEFAULT_ACADEMY_TIMEZONE);
  const [dayLabels, setDayLabels] = useState([]);
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE_FORM);
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [scheduleListCourseFilter, setScheduleListCourseFilter] = useState('all');
  const [selectedScheduleIds, setSelectedScheduleIds] = useState([]);
  const [scheduleBulkBusy, setScheduleBulkBusy] = useState(false);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  const [links, setLinks] = useState([]);
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const parentLinkListSearch = useAdminSearch();
  const scheduleListSearch = useAdminSearch();
  const attendanceListSearch = useAdminSearch();
  const payrollListSearch = useAdminSearch();
  const [pickersLoading, setPickersLoading] = useState(false);
  const [linkForm, setLinkForm] = useState(EMPTY_LINK_FORM);
  const [parentLinksPage, setParentLinksPage] = useState(1);
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [editLinkForm, setEditLinkForm] = useState({
    parentId: '',
    studentId: '',
    relation: 'guardian',
  });
  const [editLinkSaving, setEditLinkSaving] = useState(false);
  const [linksLoading, setLinksLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [attendanceFilter, setAttendanceFilter] = useState('pending');
  const [dailyDays, setDailyDays] = useState([]);
  const [dailyMonth, setDailyMonth] = useState(currentMonthKey());
  const [dailyStatusFilter, setDailyStatusFilter] = useState('pending');
  const [dailyTeacherFilter, setDailyTeacherFilter] = useState('');
  const [dailyTeachers, setDailyTeachers] = useState([]);
  const [showMonthlyRollup, setShowMonthlyRollup] = useState(false);
  const [rollupDismissedMonth, setRollupDismissedMonth] = useState(null);
  const [rollupLoading, setRollupLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [monthlyDrilldownBusy, setMonthlyDrilldownBusy] = useState(null);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [payrollFilter, setPayrollFilter] = useState('paid');
  const [payrollMissingAlerts, setPayrollMissingAlerts] = useState([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollAttendanceModal, setPayrollAttendanceModal] = useState(null);
  const [payrollAttendanceBusy, setPayrollAttendanceBusy] = useState(null);
  const [payrollDeleteBusy, setPayrollDeleteBusy] = useState(null);
  const [attendanceFeedback, setAttendanceFeedback] = useState('');
  const [monthlyRollupNotice, setMonthlyRollupNotice] = useState('');
  const [attendanceBadgeCount, setAttendanceBadgeCount] = useState(0);
  const [payrollBadgeCount, setPayrollBadgeCount] = useState(0);
  const [pendingAttendanceSummary, setPendingAttendanceSummary] = useState([]);
  const [pendingMonthlySummary, setPendingMonthlySummary] = useState([]);
  const attendanceFocusInitializedRef = useRef(false);

  const loadCourses = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) return;
      const res = await axios.get(`${API_BASE_URL}/api/courses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCourses(sortPublishedCourses(res.data?.courses || []));
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
    setSchedulesLoading(true);
    try {
      const path =
        scheduleListCourseFilter === 'all'
          ? '/schedules'
          : `/schedules?courseId=${encodeURIComponent(scheduleListCourseFilter)}`;
      const res = await lmsAdminGet(path);
      if (res.success) {
        setDayLabels(res.dayLabels || []);
        setSchedules(res.schedules || []);
        if (res.academyTimezone) setAcademyTimezone(res.academyTimezone);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setSchedulesLoading(false);
    }
  }, [scheduleListCourseFilter, showAlert]);

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      const res = await lmsAdminGet('/parent-links?linksOnly=1');
      if (res.success) {
        setLinks(res.links || []);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLinksLoading(false);
    }
  }, [showAlert]);

  const fetchLinkPickers = useCallback(async (parentSearch = '', studentSearch = '') => {
    const token = getAuthToken();
    if (!token) return;
    setPickersLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [parentRes, studentRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/users`, {
          headers,
          params: {
            segment: 'parents',
            limit: LINK_PICKER_LIMIT,
            search: parentSearch.trim() || undefined,
            sortBy: 'name',
            sortOrder: 'asc',
          },
        }),
        axios.get(`${API_BASE_URL}/api/users`, {
          headers,
          params: {
            segment: 'students',
            limit: LINK_PICKER_LIMIT,
            search: studentSearch.trim() || undefined,
            sortBy: 'name',
            sortOrder: 'asc',
          },
        }),
      ]);
      if (parentRes.data?.success) {
        setParents((parentRes.data.users || []).filter((u) => u.role === 'parent'));
      }
      if (studentRes.data?.success) {
        setStudents((studentRes.data.users || []).filter((u) => u.role === 'student'));
      }
    } catch {
      setParents([]);
      setStudents([]);
    } finally {
      setPickersLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRollupLoading(true);
    try {
      const q = attendanceFilter === 'all' ? 'all' : attendanceFilter;
      const res = await lmsAdminGet(
        `/teacher-attendance-requests?status=${q}&month=${encodeURIComponent(dailyMonth)}`
      );
      if (res.success) setRequests(res.requests || []);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setRollupLoading(false);
    }
  }, [showAlert, attendanceFilter, dailyMonth]);

  const loadDailyTeachers = useCallback(async () => {
    try {
      const res = await lmsAdminGet(
        `/teacher-attendance-daily/teachers?month=${encodeURIComponent(dailyMonth)}`
      );
      if (res.success) setDailyTeachers(res.teachers || []);
      else setDailyTeachers([]);
    } catch {
      setDailyTeachers([]);
    }
  }, [dailyMonth]);

  const loadDailyDays = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const teacherQ = dailyTeacherFilter
        ? `&teacherId=${encodeURIComponent(dailyTeacherFilter)}`
        : '';
      const res = await lmsAdminGet(
        `/teacher-attendance-daily?month=${encodeURIComponent(dailyMonth)}&status=${dailyStatusFilter}${teacherQ}`
      );
      if (res.success) setDailyDays(res.days || []);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setAttendanceLoading(false);
    }
  }, [showAlert, dailyMonth, dailyStatusFilter, dailyTeacherFilter]);

  const loadPayrollRuns = useCallback(async () => {
    setPayrollLoading(true);
    try {
      const runsRes = await lmsAdminGet('/payroll-runs?status=all');
      if (runsRes.success) setPayrollRuns(runsRes.runs || []);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setPayrollLoading(false);
    }
  }, [showAlert]);

  const loadLmsTabBadges = useCallback(async (options = {}) => {
    try {
      const [badges, alertsRes] = await Promise.all([
        fetchLmsTabBadges(options),
        lmsAdminGet('/payroll-missing-alerts'),
      ]);
      setAttendanceBadgeCount(Number(badges.lmsAttendanceBreakdown.attendance) || 0);
      setPayrollBadgeCount(Number(badges.lmsAttendanceBreakdown.payroll) || 0);
      if (!alertsRes.success) {
        showAlert(alertsRes.error || 'Could not load payroll alerts.', 'error');
        return;
      }
      setPayrollMissingAlerts(alertsRes.alerts || []);
    } catch (err) {
      showAlert(err?.message || 'Could not load LMS badge counts.', 'error');
    }
  }, [showAlert]);

  const loadPendingAttendanceSummary = useCallback(async () => {
    try {
      const res = await lmsAdminGet('/teacher-attendance-daily/pending-summary');
      if (res.success) {
        setPendingAttendanceSummary(res.items || []);
        setPendingMonthlySummary(res.monthlyItems || []);
      } else {
        setPendingAttendanceSummary([]);
        setPendingMonthlySummary([]);
      }
    } catch {
      setPendingAttendanceSummary([]);
      setPendingMonthlySummary([]);
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

  const openMonthlyDrilldown = async (requestId) => {
    setMonthlyDrilldownBusy(requestId);
    try {
      const res = await lmsAdminGet(`/teacher-attendance-requests/${requestId}/daily`);
      if (!res.success) {
        showAlert(res.error || 'Failed to load daily attendance', 'error');
        return;
      }
      setPayrollAttendanceModal({
        variant: 'rollup',
        run: {
          teacher: res.request?.teacher,
          monthKey: res.monthKey,
        },
        attendance: {
          monthlyRequest: res.request,
          dailyRows: res.dailyLog || [],
        },
      });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setMonthlyDrilldownBusy(null);
    }
  };

  const deletePayrollRun = async (run) => {
    if (run.status === 'paid') {
      showAlert('Paid payroll runs cannot be deleted.', 'error');
      return;
    }
    const label = run.teacher?.name || run.teacherName || 'this teacher';
    const ok = await showConfirm({
      title: 'Delete payroll run',
      message: `Delete payroll for ${label} (${run.monthKey})? This cannot be undone.`,
      confirmLabel: 'Delete',
      type: 'warning',
    });
    if (!ok) return;
    setPayrollDeleteBusy(run._id);
    try {
      const res = await lmsAdminDelete(`/payroll-runs/${run._id}`);
      if (res.success) {
        showAlert('Payroll run deleted.', 'success');
        loadPayrollRuns();
        loadLmsTabBadges();
      } else {
        showAlert(res.error || 'Failed to delete payroll run', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setPayrollDeleteBusy(null);
    }
  };

  const refreshAttendanceTab = useCallback(() => {
    loadDailyTeachers();
    loadDailyDays();
    loadRequests();
    loadPendingAttendanceSummary();
    loadLmsTabBadges();
  }, [loadDailyTeachers, loadDailyDays, loadRequests, loadPendingAttendanceSummary, loadLmsTabBadges]);

  useEffect(() => {
    loadLmsTabBadges();
  }, [loadLmsTabBadges]);

  useEffect(() => {
    if (tab === 'schedules') loadCourses();
  }, [tab, loadCourses]);

  useEffect(() => {
    const onBadgesUpdated = () => loadLmsTabBadges();
    window.addEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onBadgesUpdated);
    return () => window.removeEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onBadgesUpdated);
  }, [loadLmsTabBadges]);

  useEffect(() => {
    loadTeachersForCourse(scheduleForm.courseId);
  }, [scheduleForm.courseId, loadTeachersForCourse]);

  useEffect(() => {
    if (tab === 'schedules') loadSchedules();
    if (tab === 'parent-links') loadLinks();
    if (tab === 'teacher-attendance') {
      loadLmsTabBadges();
      loadPendingAttendanceSummary();
    }
    if (tab === 'teacher-payroll') {
      loadPayrollRuns();
      loadLmsTabBadges();
    }
  }, [tab, loadSchedules, loadLinks, loadPayrollRuns, loadLmsTabBadges, loadPendingAttendanceSummary]);

  useEffect(() => {
    if (tab === 'parent-links') fetchLinkPickers('', '');
  }, [tab, fetchLinkPickers]);

  useEffect(() => {
    setParentLinksPage(1);
  }, [parentLinkListSearch.debouncedSearch]);

  useEffect(() => {
    if (tab === 'teacher-attendance') loadRequests();
  }, [dailyMonth, attendanceFilter, tab, loadRequests]);

  useEffect(() => {
    if (tab === 'teacher-attendance') loadDailyDays();
  }, [dailyMonth, dailyStatusFilter, dailyTeacherFilter, tab, loadDailyDays]);

  useEffect(() => {
    if (tab === 'teacher-attendance') loadDailyTeachers();
  }, [dailyMonth, tab, loadDailyTeachers]);

  useEffect(() => {
    if (tab !== 'teacher-attendance') return;
    if (!dailyTeacherFilter) return;
    const stillVisible = dailyTeachers.some((t) => String(t._id) === String(dailyTeacherFilter));
    if (!stillVisible) setDailyTeacherFilter('');
  }, [dailyTeachers, dailyTeacherFilter, tab]);

  useEffect(() => {
    if (tab !== 'teacher-attendance') return;
    if (rollupDismissedMonth === dailyMonth) return;
    const pendingForMonth = requests.some(
      (r) => r.status === 'pending' && r.monthKey === dailyMonth
    );
    if (pendingForMonth) setShowMonthlyRollup(true);
  }, [tab, requests, dailyMonth, rollupDismissedMonth]);

  useEffect(() => {
    if (tab !== 'teacher-attendance') return;
    if (attendanceFocusInitializedRef.current) return;
    if (!pendingMonthlySummary.length && !pendingAttendanceSummary.length) return;

    const currentMonthDaily = pendingAttendanceSummary.filter((item) => item.monthKey === dailyMonth);
    const currentMonthMonthly = pendingMonthlySummary.filter((item) => item.monthKey === dailyMonth);

    if (currentMonthDaily.length === 0 && pendingMonthlySummary.length > 0) {
      const target = pendingMonthlySummary[0];
      setDailyMonth(target.monthKey);
      setAttendanceFilter('pending');
      setShowMonthlyRollup(true);
      setRollupDismissedMonth(null);
      if (target.teacherId) setDailyTeacherFilter(String(target.teacherId));
    } else if (currentMonthDaily.length === 0 && currentMonthMonthly.length === 0 && pendingAttendanceSummary.length > 0) {
      const target = pendingAttendanceSummary[0];
      setDailyMonth(target.monthKey);
      setDailyStatusFilter('pending');
      setRollupDismissedMonth(null);
      if (target.teacherId) setDailyTeacherFilter(String(target.teacherId));
    }

    attendanceFocusInitializedRef.current = true;
  }, [tab, pendingAttendanceSummary, pendingMonthlySummary, dailyMonth]);

  useEffect(() => {
    setSelectedScheduleIds([]);
  }, [scheduleListCourseFilter]);

  useEffect(() => {
    if (!attendanceFeedback) return undefined;
    const timer = window.setTimeout(() => setAttendanceFeedback(''), 4000);
    return () => window.clearTimeout(timer);
  }, [attendanceFeedback]);

  useEffect(() => {
    if (!monthlyRollupNotice) return undefined;
    const timer = window.setTimeout(() => setMonthlyRollupNotice(''), 8000);
    return () => window.clearTimeout(timer);
  }, [monthlyRollupNotice]);

  const notifyAttendanceUpdated = () => {
    invalidateLmsTabBadgesCache();
    window.dispatchEvent(new Event(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT));
    loadLmsTabBadges({ force: true });
  };

  const setAttendanceNotice = (message) => {
    setAttendanceFeedback(message);
  };

  const setMonthlyRollupNoticeMsg = (message) => {
    setMonthlyRollupNotice(message);
    if (message) {
      setRollupDismissedMonth(null);
      setShowMonthlyRollup(true);
    }
  };

  const monthlyRollupBlockAlerts = useMemo(
    () =>
      requests
        .filter((r) => r.status === 'pending' && r.approvalBlockReason)
        .map((r) => ({
          id: r._id,
          teacherName: r.teacher?.name || 'Teacher',
          monthKey: r.monthKey,
          reason: r.approvalBlockReason,
        })),
    [requests]
  );

  const resetScheduleForm = () => {
    setScheduleForm({ ...EMPTY_SCHEDULE_FORM, timezone: academyTimezone });
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
      timezone: s.timezone || academyTimezone,
      roomOrLink: s.roomOrLink || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveSchedule = async (e) => {
    e.preventDefault();
    const timeErr = scheduleTimeError(scheduleForm.startTime, scheduleForm.endTime);
    if (timeErr) {
      showAlert(timeErr, 'error');
      return;
    }
    if (scheduleForm.courseId && !scheduleForm.teacherId && teachers.length === 0) {
      showAlert(
        'No teacher available for this course. Assign a course instructor or select a teacher.',
        'error'
      );
      return;
    }
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
        showAlert(
          res.created === false ? 'Parent link updated.' : 'Parent linked to student.',
          'success'
        );
        setLinkForm(EMPTY_LINK_FORM);
        if (res.link) {
          setLinks((prev) => {
            const without = prev.filter((l) => String(l._id) !== String(res.link._id));
            return [res.link, ...without];
          });
        } else {
          loadLinks();
        }
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
        setLinks((prev) => prev.filter((l) => String(l._id) !== String(id)));
        if (String(editingLinkId) === String(id)) {
          setEditingLinkId(null);
        }
      } else showAlert(res.error || 'Failed', 'error');
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const startEditLink = (link) => {
    const parentId = String(link.parent?._id || link.parent || '');
    const studentId = String(link.student?._id || link.student || '');
    setEditingLinkId(link._id);
    setEditLinkForm({
      parentId,
      studentId,
      relation: link.relation || 'guardian',
    });
    // Keep current people in picker lists while editing
    if (link.parent && !parents.some((p) => String(p._id) === parentId)) {
      setParents((prev) => [link.parent, ...prev]);
    }
    if (link.student && !students.some((s) => String(s._id) === studentId)) {
      setStudents((prev) => [link.student, ...prev]);
    }
  };

  const cancelEditLink = () => {
    setEditingLinkId(null);
    setEditLinkForm({ parentId: '', studentId: '', relation: 'guardian' });
  };

  const saveEditLink = async (linkId) => {
    if (!linkId || editLinkSaving) return;
    if (!editLinkForm.parentId || !editLinkForm.studentId) {
      showAlert('Parent and student are required.', 'error');
      return;
    }
    setEditLinkSaving(true);
    try {
      const res = await lmsAdminPatch(`/parent-links/${linkId}`, {
        parentId: editLinkForm.parentId,
        studentId: editLinkForm.studentId,
        relation: editLinkForm.relation,
      });
      if (res.success && res.link) {
        showAlert('Parent link updated.', 'success');
        setLinks((prev) =>
          prev.map((l) => (String(l._id) === String(linkId) ? res.link : l))
        );
        setEditingLinkId(null);
        setEditLinkForm({ parentId: '', studentId: '', relation: 'guardian' });
      } else {
        showAlert(res.error || 'Failed to update link', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setEditLinkSaving(false);
    }
  };

  const reviewDailyDay = async (id, status) => {
    if (!id) return;
    try {
      const res = await lmsAdminPatch(`/teacher-attendance-daily/${id}`, { status });
      if (res.success) {
        const label =
          status === 'approved' ? 'Day approved.' : status === 'rejected' ? 'Day rejected.' : 'Day reopened.';
        setAttendanceNotice(label);
        loadDailyDays();
        loadDailyTeachers();
        if (showMonthlyRollup) loadRequests();
        notifyAttendanceUpdated();
        loadPendingAttendanceSummary();
      } else {
        setAttendanceNotice(res.error || 'Failed to update day.');
      }
    } catch (err) {
      setAttendanceNotice(err.message);
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
    const stats = { total: payrollRuns.length, paid: 0, pending: 0, stale: 0, rejected: 0 };
    payrollRuns.forEach((r) => {
      if (r.status === 'paid') stats.paid += 1;
      else if (r.status === 'pending_review') stats.pending += 1;
      else if (r.status === 'stale') stats.stale += 1;
      else if (r.status === 'rejected') stats.rejected += 1;
    });
    return stats;
  }, [payrollRuns]);

  const payrollFilteredRuns = useMemo(() => {
    const byStatus =
      payrollFilter === 'all'
        ? payrollRuns
        : payrollRuns.filter((r) => r.status === payrollFilter);
    return filterByKeywordSearch(byStatus, payrollListSearch.debouncedSearch, (r) => [
      r.teacher?.name,
      r.teacherName,
      r.teacher?.email,
      r.monthKey,
      r.status,
      r.source,
    ]);
  }, [payrollRuns, payrollFilter, payrollListSearch.debouncedSearch]);

  const reviewRequest = async (id, status) => {
    if (!id) {
      setMonthlyRollupNoticeMsg('Invalid request id.');
      return;
    }
    try {
      const res = await lmsAdminPatch(`/teacher-attendance-requests/${id}`, { status });
      if (res.success) {
        if (status === 'approved' && res.payroll) {
          setMonthlyRollupNoticeMsg(
            `Month approved. Payroll auto-generated ($${Number(res.payroll.finalSalary || 0).toFixed(2)}).`
          );
        } else if (status === 'approved' && res.payrollError) {
          setMonthlyRollupNoticeMsg(
            `Month approved, but payroll was not generated: ${res.payrollError}. Use Retry payroll or ask accountant to generate it.`
          );
        } else if (status === 'approved') {
          setMonthlyRollupNoticeMsg('Month approved successfully.');
        } else if (status === 'rejected') {
          setMonthlyRollupNoticeMsg('Month rejected.');
        } else {
          setMonthlyRollupNoticeMsg('Month reopened for review.');
        }
        loadRequests();
        loadLmsTabBadges();
        notifyAttendanceUpdated();
      } else {
        setMonthlyRollupNoticeMsg(res.error || 'Failed to update month.');
      }
    } catch (err) {
      setMonthlyRollupNoticeMsg(err.message);
    }
  };

  const retryPayroll = async (requestId) => {
    try {
      const res = await lmsAdminPost(`/teacher-attendance-requests/${requestId}/retry-payroll`, {});
      if (res.success) {
        setMonthlyRollupNoticeMsg(
          `Payroll generated ($${Number(res.payroll?.finalSalary || 0).toFixed(2)}) — pending accountant review.`
        );
        loadRequests();
        loadPayrollRuns();
        loadLmsTabBadges();
      } else {
        setMonthlyRollupNoticeMsg(res.error || 'Failed to generate payroll.');
      }
    } catch (err) {
      setMonthlyRollupNoticeMsg(err.message);
    }
  };

  const payrollTabBadgeCount = payrollBadgeCount;

  const jumpToPendingAttendance = (item) => {
    if (!item) return;
    selectTab('teacher-attendance');
    setDailyMonth(item.monthKey);
    setRollupDismissedMonth(null);
    setDailyTeacherFilter(String(item.teacherId || item.teacher?._id || ''));
    setDailyStatusFilter('pending');
    setShowMonthlyRollup(true);
  };

  const jumpToPendingMonthlyRollup = (item) => {
    if (!item) return;
    selectTab('teacher-attendance');
    setDailyMonth(item.monthKey);
    setRollupDismissedMonth(null);
    setDailyTeacherFilter(String(item.teacherId || item.teacher?._id || ''));
    setAttendanceFilter('pending');
    setShowMonthlyRollup(true);
  };

  const lmsTabBadgeCount = (tabId) => {
    if (tabId === 'teacher-attendance') return attendanceBadgeCount;
    if (tabId === 'teacher-payroll') return payrollTabBadgeCount;
    return 0;
  };

  const dayOptions = useMemo(
    () =>
      dayLabels.length
        ? dayLabels
        : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    [dayLabels]
  );

  const timezoneOptions = useMemo(() => {
    const options = new Set(COMMON_TIMEZONES);
    const current = scheduleForm.timezone || browserTimezone();
    if (current) options.add(current);
    return [...options];
  }, [scheduleForm.timezone]);

  /** Published (active) courses only; keep current selection visible when editing legacy slots. */
  const scheduleCourseOptions = useMemo(() => {
    if (!scheduleForm.courseId) return courses;
    const selectedId = String(scheduleForm.courseId);
    if (courses.some((c) => String(c._id) === selectedId)) return courses;
    const slot = schedules.find((s) => String(s.course?._id || s.course) === selectedId);
    const title = slot?.course?.title;
    if (!title) return courses;
    return [{ _id: scheduleForm.courseId, title }, ...courses];
  }, [courses, scheduleForm.courseId, schedules]);

  const filteredSchedules = useMemo(
    () =>
      filterByKeywordSearch(schedules, scheduleListSearch.debouncedSearch, (s) => [
        s.course?.title,
        s.teacher?.name,
        s.teacher?.email,
        dayOptions[s.dayOfWeek],
        s.startTime,
        s.endTime,
        s.timezone,
        s.roomOrLink,
      ]),
    [schedules, scheduleListSearch.debouncedSearch, dayOptions]
  );

  const filteredDailyDays = useMemo(
    () =>
      filterByKeywordSearch(dailyDays, attendanceListSearch.debouncedSearch, (d) => [
        d.date,
        d.teacher?.name,
        d.teacherName,
        d.approvalStatus,
        d.status,
        d.notes,
        d.teacherNotes,
      ]),
    [dailyDays, attendanceListSearch.debouncedSearch]
  );

  const filteredParentLinks = useMemo(
    () =>
      filterByKeywordSearch(links, parentLinkListSearch.debouncedSearch, (l) => [
        l.parent?.name,
        l.parent?.email,
        l.student?.name,
        l.student?.studentId,
        l.student?.email,
        l.relation,
        formatRelationLabel(l.relation),
      ]),
    [links, parentLinkListSearch.debouncedSearch]
  );

  const parentLinksTotalPages = Math.max(
    1,
    Math.ceil(filteredParentLinks.length / PARENT_LINKS_PAGE_SIZE)
  );

  const pagedParentLinks = useMemo(() => {
    const start = (parentLinksPage - 1) * PARENT_LINKS_PAGE_SIZE;
    return filteredParentLinks.slice(start, start + PARENT_LINKS_PAGE_SIZE);
  }, [filteredParentLinks, parentLinksPage]);

  const tabPanelId = (tabId) => `lms-tabpanel-${tabId}`;

  return (
    <div className="lms-management">
      <h1>LMS Management</h1>
      <p className="lms-management-lead">
        Class timings, parent–child links, teacher attendance approvals, and paid payroll records.
      </p>
      <div className="lms-management-tabs" role="tablist" aria-label="LMS sections">
        {TABS.map((t) => {
          const badge = lmsTabBadgeCount(t.id);
          const selected = tab === t.id;
          return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`lms-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={tabPanelId(t.id)}
            className={selected ? 'active' : ''}
            onClick={() => selectTab(t.id)}
            aria-label={badge > 0 ? `${t.label}, ${badge} pending` : t.label}
          >
            <span>{t.label}</span>
            {badge > 0 ? (
              <span className="lms-tab-badge" aria-hidden="true">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </button>
        );
        })}
      </div>

      {tab === 'schedules' && (
        <SchedulesTab
          panelId={tabPanelId('schedules')}
          editingScheduleId={editingScheduleId}
          scheduleForm={scheduleForm}
          setScheduleForm={setScheduleForm}
          saveSchedule={saveSchedule}
          scheduleCourseOptions={scheduleCourseOptions}
          teachers={teachers}
          dayOptions={dayOptions}
          timezoneOptions={timezoneOptions}
          resetScheduleForm={resetScheduleForm}
          scheduleListSearch={scheduleListSearch}
          scheduleListCourseFilter={scheduleListCourseFilter}
          setScheduleListCourseFilter={setScheduleListCourseFilter}
          schedulesLoading={schedulesLoading}
          filteredSchedules={filteredSchedules}
          schedules={schedules}
          selectedScheduleIds={selectedScheduleIds}
          setSelectedScheduleIds={setSelectedScheduleIds}
          scheduleBulkBusy={scheduleBulkBusy}
          removeSelectedSchedules={removeSelectedSchedules}
          toggleScheduleSelection={toggleScheduleSelection}
          startEditSchedule={startEditSchedule}
          removeSchedule={removeSchedule}
        />
      )}

      {tab === 'parent-links' && (
        <ParentLinksTab
          panelId={tabPanelId('parent-links')}
          addLink={addLink}
          linkForm={linkForm}
          setLinkForm={setLinkForm}
          pickersLoading={pickersLoading}
          parents={parents}
          students={students}
          parentLinkListSearch={parentLinkListSearch}
          filteredParentLinks={filteredParentLinks}
          linksLoading={linksLoading}
          links={links}
          pagedParentLinks={pagedParentLinks}
          editingLinkId={editingLinkId}
          editLinkForm={editLinkForm}
          setEditLinkForm={setEditLinkForm}
          editLinkSaving={editLinkSaving}
          saveEditLink={saveEditLink}
          cancelEditLink={cancelEditLink}
          startEditLink={startEditLink}
          removeLink={removeLink}
          formatRelationLabel={formatRelationLabel}
          parentLinksTotalPages={parentLinksTotalPages}
          parentLinksPage={parentLinksPage}
          setParentLinksPage={setParentLinksPage}
        />
      )}

      {tab === 'teacher-attendance' && (
        <TeacherAttendanceTab
          panelId={tabPanelId('teacher-attendance')}
          payrollMissingAlerts={payrollMissingAlerts}
          attendanceFeedback={attendanceFeedback}
          pendingAttendanceSummary={pendingAttendanceSummary}
          pendingMonthlySummary={pendingMonthlySummary}
          jumpToPendingAttendance={jumpToPendingAttendance}
          jumpToPendingMonthlyRollup={jumpToPendingMonthlyRollup}
          dailyApprovalStats={dailyApprovalStats}
          dailyMonth={dailyMonth}
          setDailyMonth={setDailyMonth}
          dailyTeacherFilter={dailyTeacherFilter}
          setDailyTeacherFilter={setDailyTeacherFilter}
          dailyTeachers={dailyTeachers}
          dailyStatusFilter={dailyStatusFilter}
          setDailyStatusFilter={setDailyStatusFilter}
          refreshAttendanceTab={refreshAttendanceTab}
          attendanceListSearch={attendanceListSearch}
          attendanceLoading={attendanceLoading}
          filteredDailyDays={filteredDailyDays}
          dailyDays={dailyDays}
          reviewDailyDay={reviewDailyDay}
          showMonthlyRollup={showMonthlyRollup}
          setShowMonthlyRollup={setShowMonthlyRollup}
          setRollupDismissedMonth={setRollupDismissedMonth}
          monthlyApprovalStats={monthlyApprovalStats}
          attendanceFilter={attendanceFilter}
          setAttendanceFilter={setAttendanceFilter}
          monthlyRollupNotice={monthlyRollupNotice}
          monthlyRollupBlockAlerts={monthlyRollupBlockAlerts}
          rollupLoading={rollupLoading}
          requests={requests}
          monthlyDrilldownBusy={monthlyDrilldownBusy}
          openMonthlyDrilldown={openMonthlyDrilldown}
          reviewRequest={reviewRequest}
          retryPayroll={retryPayroll}
        />
      )}

      {tab === 'teacher-payroll' && (
        <TeacherPayrollTab
          panelId={tabPanelId('teacher-payroll')}
          payrollMissingAlerts={payrollMissingAlerts}
          payrollStats={payrollStats}
          payrollListSearch={payrollListSearch}
          payrollFilter={payrollFilter}
          setPayrollFilter={setPayrollFilter}
          loadPayrollRuns={loadPayrollRuns}
          payrollLoading={payrollLoading}
          payrollFilteredRuns={payrollFilteredRuns}
          payrollRuns={payrollRuns}
          payrollAttendanceBusy={payrollAttendanceBusy}
          payrollDeleteBusy={payrollDeleteBusy}
          openPayrollAttendance={openPayrollAttendance}
          deletePayrollRun={deletePayrollRun}
        />
      )}
      <PayrollMonthAttendanceModal
        data={payrollAttendanceModal}
        onClose={() => setPayrollAttendanceModal(null)}
        formatMonth={formatPayrollMonth}
      />
    </div>
  );
};

export default LmsManagement;
