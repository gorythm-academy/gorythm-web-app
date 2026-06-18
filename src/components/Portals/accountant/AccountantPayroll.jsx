import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  payrollGet,
  payrollPost,
  payrollPatch,
  payrollDelete,
} from '../shared/portalApi';
import { PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { useResizableTableColumns } from '../../../hooks/useResizableTableColumns';
import { notifyAccountantPayrollUpdated } from '../../../hooks/useAccountantPortalBadges';
import PayrollMonthAttendanceModal from '../../shared/PayrollMonthAttendanceModal';
import './AccountantPayroll.scss';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'stale', label: 'Out of date' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'paid', label: 'Paid' },
];

const PAYROLL_QUEUE_COLS = {
  teacher: 140,
  profileSalary: 110,
  month: 100,
  present: 70,
  absent: 70,
  deduction: 90,
  finalSalary: 100,
  status: 130,
  actions: 220,
};

const statusLabel = (status) => {
  if (status === 'pending_review') return 'Pending review';
  if (status === 'stale') return 'Out of date';
  if (status === 'rejected') return 'Rejected';
  if (status === 'paid') return 'Paid';
  return status || '—';
};

const formatMonth = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const AccountantPayroll = () => {
  const [runs, setRuns] = useState([]);
  const [salaryRows, setSalaryRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [profileForm, setProfileForm] = useState({ teacherId: '', monthlySalary: '' });
  const [editingProfile, setEditingProfile] = useState(null);
  const [attendanceModal, setAttendanceModal] = useState(null);
  const [editPayrollModal, setEditPayrollModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [showExceptions, setShowExceptions] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    teacherId: '',
    monthKey: new Date().toISOString().slice(0, 7),
    presentDays: 0,
    leaveDays: 0,
    absentDays: 0,
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const { widths: queueColWidths, startResize: startQueueColResize, resetWidths: resetQueueColWidths } =
    useResizableTableColumns('gorythm-accountant-payroll-queue-cols', PAYROLL_QUEUE_COLS);

  const loadRuns = useCallback(() => {
    return payrollGet('/runs')
      .then((res) => {
        setRuns(res.runs || []);
        notifyAccountantPayrollUpdated();
      })
      .catch((err) => setError(err.message));
  }, []);

  const loadSalaryProfiles = useCallback(() => {
    payrollGet('/salary-profiles')
      .then((res) => setSalaryRows(res.rows || []))
      .catch(() => setSalaryRows([]));
  }, []);

  useEffect(() => {
    loadRuns();
    loadSalaryProfiles();
  }, [loadRuns, loadSalaryProfiles]);

  const filteredRuns = useMemo(() => {
    if (statusFilter === 'all') return runs;
    return runs.filter((r) => r.status === statusFilter);
  }, [runs, statusFilter]);

  const profileRows = useMemo(
    () => salaryRows.filter((row) => row.profile),
    [salaryRows]
  );

  const stats = useMemo(
    () => ({
      pending: runs.filter((r) => r.status === 'pending_review').length,
      stale: runs.filter((r) => r.status === 'stale').length,
      rejected: runs.filter((r) => r.status === 'rejected').length,
      paid: runs.filter((r) => r.status === 'paid').length,
    }),
    [runs]
  );

  const teachersForNewProfile = useMemo(
    () =>
      salaryRows.filter(
        (row) => row.teacher?._id && !row.profile && !row.teacherRemoved
      ),
    [salaryRows]
  );

  const teachersMissingSalary = useMemo(
    () => teachersForNewProfile.length,
    [teachersForNewProfile]
  );

  const saveNewProfile = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      const res = await payrollPost('/salary-profile', {
        teacherId: profileForm.teacherId,
        monthlySalary: Number(profileForm.monthlySalary),
        workingDays: 26,
      });
      if (res.success) {
        setMsg('Teacher salary profile added.');
        loadSalaryProfiles();
        loadRuns();
        setProfileForm({ teacherId: '', monthlySalary: '' });
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const saveEditedProfile = async (e) => {
    e.preventDefault();
    if (!editingProfile) return;
    setMsg('');
    try {
      const res = await payrollPatch(`/teacher-profile/${editingProfile.teacherId}`, {
        name: editingProfile.name.trim(),
        monthlySalary: Number(editingProfile.monthlySalary),
        workingDays: 26,
      });
      if (res.success) {
        setMsg('Teacher profile updated.');
        setEditingProfile(null);
        loadSalaryProfiles();
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const deleteProfile = async (row) => {
    const teacherId = row.teacher?._id || row.profile?.teacher;
    const teacherName = row.teacher?.name || 'this teacher';
    if (!teacherId) return;
    if (!window.confirm(`Remove salary profile for ${teacherName}? This does not delete payroll runs.`)) return;
    setMsg('');
    setError('');
    try {
      const res = await payrollDelete(`/teacher-profile/${teacherId}`);
      if (res.success) {
        setMsg('Teacher salary profile removed.');
        loadSalaryProfiles();
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const deletePayrollRun = async (run) => {
    const label = run.teacher?.name || run.teacherName || 'this teacher';
    if (!window.confirm(`Delete payroll for ${label} (${run.monthKey})? This cannot be undone.`)) return;
    setBusyId(run._id);
    setMsg('');
    setError('');
    try {
      const res = await payrollDelete(`/runs/${run._id}`);
      if (res.success) {
        setMsg('Payroll run deleted.');
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const saveException = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const res = await payrollPost('/attendance', {
        ...exceptionForm,
        presentDays: Number(exceptionForm.presentDays),
        leaveDays: Number(exceptionForm.leaveDays),
        absentDays: Number(exceptionForm.absentDays),
      });
      setMsg(
        res.success
          ? 'Manual attendance saved (exception path — prefer admin-approved attendance).'
          : res.error || 'Failed'
      );
    } catch (err) {
      setMsg(err.message);
    }
  };

  const markPaid = async (runId) => {
    setBusyId(runId);
    setMsg('');
    try {
      const res = await payrollPatch(`/runs/${runId}/mark-paid`, {});
      if (res.success) {
        setMsg(`Marked paid: ${res.payroll?.teacher?.name || res.payroll?.teacherName || 'teacher'} — ${res.payroll?.monthKey}`);
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const rejectPayroll = async (e) => {
    e.preventDefault();
    if (!rejectModal) return;
    const note = String(rejectModal.note || '').trim();
    if (!note) {
      setMsg('Rejection note is required.');
      return;
    }
    setBusyId(rejectModal.runId);
    setMsg('');
    setError('');
    try {
      const res = await payrollPatch(`/runs/${rejectModal.runId}/reject`, { note });
      if (res.success) {
        setMsg('Payroll rejected and sent back to admin for review.');
        setRejectModal(null);
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const openRejectModal = (run) => {
    setRejectModal({
      runId: run._id,
      teacherName: run.teacher?.name || run.teacherName || 'Teacher',
      monthKey: run.monthKey,
      note: '',
    });
  };

  const renderQueueTh = (colKey, label) => (
    <th style={{ width: queueColWidths[colKey] }}>
      <span className="accountant-payroll-th-label">{label}</span>
      <span
        className="accountant-payroll-col-resize"
        onMouseDown={(e) => startQueueColResize(colKey, e)}
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${label} column`}
      />
    </th>
  );

  const regenerate = async (runId) => {
    setBusyId(runId);
    setMsg('');
    try {
      const res = await payrollPost(`/runs/${runId}/regenerate`, {});
      if (res.success) {
        setMsg(
          `Payroll updated: $${Number(res.payroll?.finalSalary || 0).toFixed(2)} (deduction $${Number(res.payroll?.deduction || 0).toFixed(2)})`
        );
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const openAttendance = async (runId) => {
    setBusyId(runId);
    setMsg('');
    try {
      const res = await payrollGet(`/runs/${runId}/attendance`);
      if (res.success) setAttendanceModal(res);
      else setMsg(res.error || 'Failed to load attendance');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const openEditPayroll = (run) => {
    setEditPayrollModal({
      runId: run._id,
      teacherName: run.teacher?.name || run.teacherName || 'Teacher',
      monthKey: run.monthKey,
      monthlySalary: run.monthlySalary,
      absentDays: run.absentDays ?? 0,
      deduction: run.deduction ?? 0,
      finalSalary: run.finalSalary ?? 0,
      accountantNotes: run.accountantNotes || '',
    });
  };

  const savePayrollEdit = async (e) => {
    e.preventDefault();
    if (!editPayrollModal) return;
    setBusyId(editPayrollModal.runId);
    setMsg('');
    try {
      const res = await payrollPatch(`/runs/${editPayrollModal.runId}`, {
        absentDays: Number(editPayrollModal.absentDays),
        deduction: Number(editPayrollModal.deduction),
        finalSalary: Number(editPayrollModal.finalSalary),
        accountantNotes: editPayrollModal.accountantNotes,
      });
      if (res.success) {
        setMsg('Payroll updated.');
        setEditPayrollModal(null);
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="portal-page accountant-payroll">
      <PortalPageHeader
        title="Teacher payroll"
        subtitle="Set salary profiles, review auto-generated payroll after admin approval, and mark runs paid."
      />

      <div className="portal-hero portal-hero--accountant">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-money-check-dollar" />
        </div>
        <div>
          <h2>Payroll workspace</h2>
          <p>
            Add salary profiles for teachers, review attendance-backed payroll runs, edit amounts when needed,
            then mark them paid.
          </p>
        </div>
      </div>

      {error ? <PortalAlert type="error">{error}</PortalAlert> : null}
      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}

      <div className="accountant-payroll-stats">
        <div className="accountant-payroll-stat accountant-payroll-stat--pending">
          <span className="accountant-payroll-stat__value">{stats.pending}</span>
          <span className="accountant-payroll-stat__label">Pending review</span>
        </div>
        <div className="accountant-payroll-stat accountant-payroll-stat--stale">
          <span className="accountant-payroll-stat__value">{stats.stale}</span>
          <span className="accountant-payroll-stat__label">Out of date</span>
        </div>
        <div className="accountant-payroll-stat accountant-payroll-stat--paid">
          <span className="accountant-payroll-stat__value">{stats.paid}</span>
          <span className="accountant-payroll-stat__label">Paid</span>
        </div>
        <div className="accountant-payroll-stat accountant-payroll-stat--warn">
          <span className="accountant-payroll-stat__value">{profileRows.length}</span>
          <span className="accountant-payroll-stat__label">Teacher profiles</span>
        </div>
      </div>

      <section className="accountant-payroll-section">
        <div className="accountant-payroll-section__head">
          <h2>Teacher profiles</h2>
        </div>
        <p className="accountant-payroll-hint">
          Pick a teacher from the list and set their monthly salary. Teachers who already have a
          profile are not shown. Profiles are required before auto-payroll runs when admin approves
          a month.
        </p>

        {teachersForNewProfile.length === 0 ? (
          <p className="accountant-payroll-hint accountant-payroll-hint--muted">
            All active teachers already have a salary profile.
          </p>
        ) : (
          <form className="accountant-payroll-form accountant-payroll-form--inline" onSubmit={saveNewProfile}>
            <select
              value={profileForm.teacherId}
              onChange={(e) => setProfileForm({ ...profileForm, teacherId: e.target.value })}
              required
              aria-label="Teacher"
            >
              <option value="">Select teacher</option>
              {teachersForNewProfile.map((row) => (
                <option key={row.teacher._id} value={row.teacher._id}>
                  {row.teacher.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Monthly salary"
              value={profileForm.monthlySalary}
              onChange={(e) => setProfileForm({ ...profileForm, monthlySalary: e.target.value })}
              required
            />
            <button type="submit" className="accountant-payroll-btn accountant-payroll-btn--primary">
              Add salary profile
            </button>
          </form>
        )}

        <div className="accountant-payroll-table-wrap accountant-payroll-table-wrap--compact">
          <table className="accountant-payroll-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Monthly salary</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {profileRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>No teacher profiles yet. Add one above.</td>
                </tr>
              ) : (
                profileRows.map((row) => (
                  <tr key={row.teacher?._id || row.profile?._id}>
                    <td>
                      <strong>{row.teacher?.name || 'Removed teacher'}</strong>
                      {row.teacherRemoved ? (
                        <small className="accountant-payroll-meta accountant-payroll-meta--warn">
                          Teacher account removed
                        </small>
                      ) : (
                        <small>{row.teacher?.email || ''}</small>
                      )}
                    </td>
                    <td>${Number(row.profile.monthlySalary).toFixed(2)}</td>
                    <td>
                      <div className="accountant-payroll-action-group">
                        {!row.teacherRemoved ? (
                          <button
                            type="button"
                            className="accountant-payroll-btn accountant-payroll-btn--secondary"
                            onClick={() =>
                              setEditingProfile({
                                teacherId: row.teacher._id,
                                name: row.teacher.name,
                                monthlySalary: row.profile.monthlySalary,
                              })
                            }
                          >
                            Edit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="accountant-payroll-btn accountant-payroll-btn--danger"
                          onClick={() => deleteProfile(row)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {teachersMissingSalary > 0 ? (
          <p className="accountant-payroll-hint">
            {teachersMissingSalary} active teacher{teachersMissingSalary === 1 ? '' : 's'} still need
            a salary profile — select from the list above.
          </p>
        ) : null}
      </section>

      <section className="accountant-payroll-section">
        <div className="accountant-payroll-section__head">
          <h2>Payroll queue</h2>
          <div className="accountant-payroll-section__tools">
            <button
              type="button"
              className="accountant-payroll-btn accountant-payroll-btn--ghost"
              onClick={resetQueueColWidths}
              title="Reset column widths"
            >
              Reset columns
            </button>
            <div className="accountant-payroll-filters" role="tablist" aria-label="Payroll status">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === f.value}
                  className={statusFilter === f.value ? 'is-active' : ''}
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="accountant-payroll-empty">
            <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
            <p>No payroll runs for this filter.</p>
            <small>Runs appear automatically when admin approves a month after it ends.</small>
          </div>
        ) : (
          <div className="accountant-payroll-table-wrap">
            <table className="accountant-payroll-table accountant-payroll-table--resizable">
              <thead>
                <tr>
                  {renderQueueTh('teacher', 'Teacher')}
                  {renderQueueTh('profileSalary', 'Profile salary')}
                  {renderQueueTh('month', 'Month')}
                  {renderQueueTh('present', 'Present')}
                  {renderQueueTh('absent', 'Absent')}
                  {renderQueueTh('deduction', 'Deduction')}
                  {renderQueueTh('finalSalary', 'Final salary')}
                  {renderQueueTh('status', 'Status')}
                  {renderQueueTh('actions', 'Actions')}
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((r) => (
                  <tr key={r._id} className={`accountant-payroll-row accountant-payroll-row--${r.status}`}>
                    <td>
                      <strong>{r.teacher?.name || r.teacherName || '—'}</strong>
                      {!r.teacher?.name && r.teacherName ? (
                        <small className="accountant-payroll-meta accountant-payroll-meta--warn">
                          Teacher account removed
                        </small>
                      ) : (
                        <small>{r.teacher?.email || ''}</small>
                      )}
                    </td>
                    <td>
                      {r.profileSalary != null ? (
                        <strong>${Number(r.profileSalary).toFixed(2)}</strong>
                      ) : (
                        '—'
                      )}
                      {r.editedByAccountant ? (
                        <small className="accountant-payroll-meta">Edited by accountant</small>
                      ) : null}
                    </td>
                    <td>
                      <strong>{r.monthKey}</strong>
                      <small>{formatMonth(r.monthKey)}</small>
                    </td>
                    <td>{r.presentDays ?? 0}</td>
                    <td>{r.absentDays ?? 0}</td>
                    <td>${Number(r.deduction || 0).toFixed(2)}</td>
                    <td>
                      <strong>${Number(r.finalSalary || 0).toFixed(2)}</strong>
                    </td>
                    <td>
                      <span className={`accountant-payroll-pill accountant-payroll-pill--${r.status}`}>
                        {statusLabel(r.status)}
                      </span>
                      {r.autoGenerated ? (
                        <small className="accountant-payroll-meta">Auto-generated</small>
                      ) : null}
                      {r.staleReason ? (
                        <small className="accountant-payroll-meta accountant-payroll-meta--warn">
                          {r.staleReason}
                        </small>
                      ) : null}
                      {r.status === 'paid' && r.paidAt ? (
                        <small className="accountant-payroll-meta">
                          Paid {new Date(r.paidAt).toLocaleDateString()}
                          {r.paidBy?.name ? ` by ${r.paidBy.name}` : ''}
                        </small>
                      ) : null}
                      {r.status === 'rejected' && r.accountantNotes ? (
                        <small className="accountant-payroll-meta accountant-payroll-meta--warn" title={r.accountantNotes}>
                          Note: {r.accountantNotes}
                        </small>
                      ) : null}
                      {r.status === 'rejected' && r.rejectedAt ? (
                        <small className="accountant-payroll-meta">
                          Rejected {new Date(r.rejectedAt).toLocaleDateString()}
                          {r.rejectedBy?.name ? ` by ${r.rejectedBy.name}` : ''}
                        </small>
                      ) : null}
                    </td>
                    <td className="accountant-payroll-actions">
                      <div className="accountant-payroll-action-group">
                        <button
                          type="button"
                          className="accountant-payroll-btn accountant-payroll-btn--secondary"
                          disabled={busyId === r._id}
                          onClick={() => openAttendance(r._id)}
                        >
                          Attendance
                        </button>
                        {r.status !== 'paid' ? (
                          <button
                            type="button"
                            className="accountant-payroll-btn accountant-payroll-btn--secondary"
                            onClick={() => openEditPayroll(r)}
                          >
                            Edit
                          </button>
                        ) : null}
                        {r.status === 'pending_review' ? (
                          <>
                            <button
                              type="button"
                              className="accountant-payroll-btn accountant-payroll-btn--paid"
                              disabled={busyId === r._id}
                              onClick={() => markPaid(r._id)}
                            >
                              Mark paid
                            </button>
                            <button
                              type="button"
                              className="accountant-payroll-btn accountant-payroll-btn--reject"
                              disabled={busyId === r._id}
                              onClick={() => openRejectModal(r)}
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {r.status === 'stale' ? (
                          <>
                            <button
                              type="button"
                              className="accountant-payroll-btn accountant-payroll-btn--regen"
                              disabled={busyId === r._id}
                              onClick={() => regenerate(r._id)}
                            >
                              Regenerate
                            </button>
                            <button
                              type="button"
                              className="accountant-payroll-btn accountant-payroll-btn--reject"
                              disabled={busyId === r._id}
                              onClick={() => openRejectModal(r)}
                            >
                              Reject
                            </button>
                          </>
                        ) : null}
                        {r.status !== 'paid' ? (
                          <button
                            type="button"
                            className="accountant-payroll-btn accountant-payroll-btn--danger"
                            disabled={busyId === r._id}
                            onClick={() => deletePayrollRun(r)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <button
        type="button"
        className="accountant-payroll-collapse-toggle"
        onClick={() => setShowExceptions((v) => !v)}
        aria-expanded={showExceptions}
      >
        <i className="fas fa-exclamation-circle" aria-hidden="true" /> Manual exceptions
      </button>

      {showExceptions ? (
        <section className="accountant-payroll-section accountant-payroll-section--nested">
          <form className="accountant-payroll-form" onSubmit={saveException}>
            <h3>Manual attendance (exception only)</h3>
            <p className="accountant-payroll-hint">
              Use only when admin-approved attendance is unavailable.
            </p>
            <select
              value={exceptionForm.teacherId}
              onChange={(e) => setExceptionForm({ ...exceptionForm, teacherId: e.target.value })}
              required
            >
              <option value="">Teacher</option>
              {salaryRows
                .filter((row) => row.teacher?._id)
                .map((row) => (
                <option key={row.teacher._id} value={row.teacher._id}>
                  {row.teacher.name}
                </option>
              ))}
            </select>
            <label className="portal-field-label">
              Month
              <input
                type="month"
                value={exceptionForm.monthKey}
                onChange={(e) => setExceptionForm({ ...exceptionForm, monthKey: e.target.value })}
                required
              />
            </label>
            <div className="accountant-payroll-form__row">
              <input
                type="number"
                min="0"
                placeholder="Present"
                value={exceptionForm.presentDays}
                onChange={(e) => setExceptionForm({ ...exceptionForm, presentDays: e.target.value })}
              />
              <input
                type="number"
                min="0"
                placeholder="Leave"
                value={exceptionForm.leaveDays}
                onChange={(e) => setExceptionForm({ ...exceptionForm, leaveDays: e.target.value })}
              />
              <input
                type="number"
                min="0"
                placeholder="Absent (deducts)"
                value={exceptionForm.absentDays}
                onChange={(e) => setExceptionForm({ ...exceptionForm, absentDays: e.target.value })}
              />
            </div>
            <button type="submit" className="accountant-payroll-btn accountant-payroll-btn--secondary">
              Save manual attendance
            </button>
          </form>
        </section>
      ) : null}

      {editingProfile ? (
        <div className="accountant-payroll-modal-backdrop" role="presentation" onClick={() => setEditingProfile(null)}>
          <div
            className="accountant-payroll-modal"
            role="dialog"
            aria-labelledby="edit-profile-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-profile-title">Edit teacher profile</h3>
            <form onSubmit={saveEditedProfile}>
              <label className="portal-field-label">
                Name
                <input
                  type="text"
                  value={editingProfile.name}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  required
                />
              </label>
              <label className="portal-field-label">
                Monthly salary
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editingProfile.monthlySalary}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, monthlySalary: e.target.value })
                  }
                  required
                />
              </label>
              <div className="accountant-payroll-modal__actions">
                <button type="button" className="accountant-payroll-btn accountant-payroll-btn--secondary" onClick={() => setEditingProfile(null)}>
                  Cancel
                </button>
                <button type="submit" className="accountant-payroll-btn accountant-payroll-btn--primary">
                  Save profile
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editPayrollModal ? (
        <div className="accountant-payroll-modal-backdrop" role="presentation" onClick={() => setEditPayrollModal(null)}>
          <div
            className="accountant-payroll-modal"
            role="dialog"
            aria-labelledby="edit-payroll-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-payroll-title">
              Edit payroll — {editPayrollModal.teacherName} ({editPayrollModal.monthKey})
            </h3>
            <p className="accountant-payroll-hint">
              Base salary for this run: ${Number(editPayrollModal.monthlySalary).toFixed(2)}. Changing absent
              days recalculates deduction; you can also override deduction and final salary directly.
            </p>
            <form onSubmit={savePayrollEdit}>
              <label className="portal-field-label">
                Absent days
                <input
                  type="number"
                  min="0"
                  value={editPayrollModal.absentDays}
                  onChange={(e) =>
                    setEditPayrollModal({ ...editPayrollModal, absentDays: e.target.value })
                  }
                />
              </label>
              <label className="portal-field-label">
                Deduction ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPayrollModal.deduction}
                  onChange={(e) =>
                    setEditPayrollModal({ ...editPayrollModal, deduction: e.target.value })
                  }
                />
              </label>
              <label className="portal-field-label">
                Final salary ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPayrollModal.finalSalary}
                  onChange={(e) =>
                    setEditPayrollModal({ ...editPayrollModal, finalSalary: e.target.value })
                  }
                  required
                />
              </label>
              <label className="portal-field-label">
                Notes
                <textarea
                  rows={2}
                  value={editPayrollModal.accountantNotes}
                  onChange={(e) =>
                    setEditPayrollModal({ ...editPayrollModal, accountantNotes: e.target.value })
                  }
                />
              </label>
              <div className="accountant-payroll-modal__actions">
                <button type="button" className="accountant-payroll-btn accountant-payroll-btn--secondary" onClick={() => setEditPayrollModal(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="accountant-payroll-btn accountant-payroll-btn--primary"
                  disabled={busyId === editPayrollModal.runId}
                >
                  Save payroll
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {rejectModal ? (
        <div className="accountant-payroll-modal-backdrop" role="presentation" onClick={() => setRejectModal(null)}>
          <div
            className="accountant-payroll-modal"
            role="dialog"
            aria-labelledby="reject-payroll-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="reject-payroll-title">
              Reject payroll — {rejectModal.teacherName} ({rejectModal.monthKey})
            </h3>
            <p className="accountant-payroll-hint">
              Add a note explaining why this payroll is rejected. Admin will see the note and the monthly
              attendance request returns to pending for correction.
            </p>
            <form onSubmit={rejectPayroll}>
              <label className="portal-field-label">
                Rejection note (required)
                <textarea
                  rows={4}
                  value={rejectModal.note}
                  onChange={(e) => setRejectModal({ ...rejectModal, note: e.target.value })}
                  required
                  placeholder="e.g. Absent days do not match approved attendance for 12 Mar."
                />
              </label>
              <div className="accountant-payroll-modal__actions">
                <button
                  type="button"
                  className="accountant-payroll-btn accountant-payroll-btn--secondary"
                  onClick={() => setRejectModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="accountant-payroll-btn accountant-payroll-btn--reject"
                  disabled={busyId === rejectModal.runId}
                >
                  Reject payroll
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <PayrollMonthAttendanceModal
        data={attendanceModal}
        onClose={() => setAttendanceModal(null)}
        formatMonth={formatMonth}
      />
    </div>
  );
};

export default AccountantPayroll;
