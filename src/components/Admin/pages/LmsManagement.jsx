import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../../config/constants';
import { getAuthToken } from '../../../utils/authStorage';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import './LmsManagement.scss';

const TABS = [
  { id: 'schedules', label: 'Class schedules' },
  { id: 'parent-links', label: 'Parent links' },
  { id: 'teacher-attendance', label: 'Teacher attendance' },
];

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

  const [links, setLinks] = useState([]);
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [linkForm, setLinkForm] = useState({ parentId: '', studentId: '', relation: 'guardian' });
  const [requests, setRequests] = useState([]);
  const [attendanceFilter, setAttendanceFilter] = useState('pending');
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [dailyLog, setDailyLog] = useState(null);
  const [dailyLogLoading, setDailyLogLoading] = useState(false);

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

  const loadSchedules = useCallback(async () => {
    try {
      const res = await lmsAdminGet('/schedules');
      if (res.success) {
        setSchedules(res.schedules || []);
        setDayLabels(res.dayLabels || []);
        setTeachers(res.teachers || []);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [showAlert]);

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

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (tab === 'schedules') loadSchedules();
    if (tab === 'parent-links') loadLinks();
    if (tab === 'teacher-attendance') loadRequests();
  }, [tab, loadSchedules, loadLinks, loadRequests]);

  useEffect(() => {
    if (tab === 'teacher-attendance') loadRequests();
  }, [attendanceFilter, tab, loadRequests]);

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
      message: 'Remove this class timing?',
      confirmLabel: 'Remove',
      type: 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminDelete(`/schedules/${id}`);
      if (res.success) {
        showAlert('Schedule removed.', 'success');
        if (editingScheduleId === id) resetScheduleForm();
        loadSchedules();
      } else {
        showAlert(res.error || 'Failed to remove', 'error');
      }
    } catch (err) {
      showAlert(err.message, 'error');
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

  const loadDailyLog = async (requestId) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      setDailyLog(null);
      return;
    }
    setExpandedRequestId(requestId);
    setDailyLogLoading(true);
    try {
      const res = await lmsAdminGet(`/teacher-attendance-requests/${requestId}/daily`);
      if (res.success) setDailyLog(res);
      else {
        showAlert(res.error || 'Failed to load daily log', 'error');
        setExpandedRequestId(null);
      }
    } catch (err) {
      showAlert(err.message, 'error');
      setExpandedRequestId(null);
    } finally {
      setDailyLogLoading(false);
    }
  };

  const reviewRequest = async (id, status) => {
    if (!id) {
      showAlert('Invalid request id.', 'error');
      return;
    }
    const ok = await showConfirm({
      title: status === 'approved' ? 'Approve attendance?' : 'Reject attendance?',
      message:
        status === 'approved'
          ? 'This will record the monthly totals for payroll.'
          : 'The teacher may submit again after rejection.',
      confirmLabel: status === 'approved' ? 'Approve' : 'Reject',
      type: status === 'approved' ? 'default' : 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminPatch(`/teacher-attendance-requests/${id}`, { status });
      if (res.success) {
        showAlert(`Attendance ${status}.`, 'success');
        loadRequests();
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
        Class timings, parent–child links, and teacher attendance approvals.
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
        <section className="lms-panel">
          <form className="lms-form" onSubmit={saveSchedule}>
            <h2>{editingScheduleId ? 'Edit class schedule' : 'Add class schedule'}</h2>
            <select
              value={scheduleForm.courseId}
              onChange={(e) => setScheduleForm({ ...scheduleForm, courseId: e.target.value })}
              required
            >
              <option value="">Course</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              value={scheduleForm.teacherId}
              onChange={(e) => setScheduleForm({ ...scheduleForm, teacherId: e.target.value })}
            >
              <option value="">Teacher (defaults to course instructor)</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({t.email})
                </option>
              ))}
            </select>
            <label className="lms-field-label">
              Day
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
            <label className="lms-field-label">
              Start time
              <input
                type="time"
                value={scheduleForm.startTime}
                onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                required
              />
            </label>
            <label className="lms-field-label">
              End time
              <input
                type="time"
                value={scheduleForm.endTime}
                onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                required
              />
            </label>
            <input
              placeholder="Room or meeting link"
              value={scheduleForm.roomOrLink}
              onChange={(e) => setScheduleForm({ ...scheduleForm, roomOrLink: e.target.value })}
            />
            <div className="lms-form-actions">
              <button type="submit">{editingScheduleId ? 'Save changes' : 'Add'}</button>
              {editingScheduleId ? (
                <button type="button" className="lms-btn-secondary" onClick={resetScheduleForm}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
          <ul className="lms-list">
            {schedules.map((s) => (
              <li key={s._id} className={editingScheduleId === s._id ? 'lms-list-item--editing' : ''}>
                <span>
                  <strong>{s.course?.title || 'Course'}</strong> — {dayOptions[s.dayOfWeek] || s.dayOfWeek}{' '}
                  {s.startTime}–{s.endTime}
                  {s.teacher?.name ? ` · ${s.teacher.name}` : ''}
                  {s.roomOrLink ? ` · ${s.roomOrLink}` : ''}
                </span>
                <span className="lms-list-actions">
                  <button type="button" className="lms-btn-edit" onClick={() => startEditSchedule(s)}>
                    Edit
                  </button>
                  <button type="button" className="lms-link-btn" onClick={() => removeSchedule(s._id)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {schedules.length === 0 ? <p className="lms-empty">No class timings yet.</p> : null}
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
          <div className="lms-panel-head">
            <h2>Teacher attendance (monthly approval)</h2>
            <p className="lms-hint">
              Teachers mark daily attendance; each save rolls up to a monthly request here. Managers and
              super-admins can approve or reject.
            </p>
          </div>
          <div className="lms-attendance-filters">
            <label>
              Show
              <select
                value={attendanceFilter}
                onChange={(e) => setAttendanceFilter(e.target.value)}
              >
                <option value="pending">Pending approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </label>
            <button type="button" className="btn-secondary" onClick={loadRequests}>
              <i className="fas fa-sync-alt" /> Refresh
            </button>
          </div>
          <div className="lms-attendance-table-wrap">
            <table className="lms-attendance-table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Month</th>
                  <th>Working days</th>
                  <th>Present</th>
                  <th>Leave</th>
                  <th>Absent</th>
                  <th>Holiday</th>
                  <th>Weekend</th>
                  <th>Report absent</th>
                  <th>Late</th>
                  <th>Days marked</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <React.Fragment key={r._id}>
                    <tr>
                      <td>
                        <strong>{r.teacher?.name || '—'}</strong>
                        <br />
                        <small>{r.teacher?.email || ''}</small>
                      </td>
                      <td>{r.monthKey}</td>
                      <td>{r.expectedWorkingDays > 0 ? r.expectedWorkingDays : '—'}</td>
                      <td>{r.presentDays ?? 0}</td>
                      <td>{r.leaveDays ?? 0}</td>
                      <td>{r.absentDays ?? 0}</td>
                      <td>{r.holidayDays ?? 0}</td>
                      <td>{r.weekendDays ?? 0}</td>
                      <td>{r.reportAbsentDays ?? 0}</td>
                      <td>{r.lateDays ?? 0}</td>
                      <td>{r.daysMarked ?? 0}</td>
                      <td>
                        <span className={`lms-status-pill lms-status-pill--${r.status || 'pending'}`}>
                          {r.status || 'pending'}
                        </span>
                      </td>
                      <td>
                        {r.submittedAt
                          ? new Date(r.submittedAt).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : r.updatedAt
                            ? new Date(r.updatedAt).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })
                            : '—'}
                      </td>
                      <td className="lms-attendance-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => loadDailyLog(r._id)}
                        >
                          {expandedRequestId === r._id ? 'Hide days' : 'View days'}
                        </button>
                        {r.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => reviewRequest(r._id, 'approved')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => reviewRequest(r._id, 'rejected')}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="lms-hint">
                            {r.reviewedBy?.name ? `By ${r.reviewedBy.name}` : 'Reviewed'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {expandedRequestId === r._id ? (
                      <tr className="lms-attendance-daily-row">
                        <td colSpan={14}>
                          {dailyLogLoading ? (
                            <p className="lms-hint">Loading daily log…</p>
                          ) : dailyLog?.dailyLog?.length ? (
                            <div className="lms-daily-log-grid">
                              {dailyLog.dailyLog.map((day) => (
                                <div
                                  key={day.date}
                                  className={`lms-daily-log-cell lms-daily-log-cell--${day.dayType}`}
                                  title={day.label}
                                >
                                  <span className="lms-daily-log-date">{day.date.slice(8)}</span>
                                  {day.mark ? (
                                    <span className={`lms-daily-log-status lms-daily-log-status--${day.mark.status}`}>
                                      {day.mark.status}
                                    </span>
                                  ) : day.isWorking ? (
                                    <span className="lms-daily-log-empty">—</span>
                                  ) : (
                                    <span className="lms-daily-log-off">{day.dayType === 'weekend' ? 'WE' : 'Hol'}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="lms-hint">No daily marks for this month.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {requests.length === 0 ? (
              <p className="lms-empty">No attendance requests for this filter.</p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
};

export default LmsManagement;
