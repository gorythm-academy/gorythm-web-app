import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import { ATTENDANCE_STATUS_OPTIONS, statusChipClass } from '../../../constants/attendanceStatuses';

const TeacherAttendance = () => {
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [records, setRecords] = useState([]);
  const [courseId, setCourseId] = useState(searchParams.get('course') || '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState([]);
  const [rosterCount, setRosterCount] = useState(0);
  const [marks, setMarks] = useState({});
  const [notes, setNotes] = useState({});
  const [selectedRecordIds, setSelectedRecordIds] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState({ status: 'present', notes: '' });
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadRecords = () => {
    if (!courseId) {
      portalGet('/teacher/attendance').then((res) => {
        if (res.success) setRecords(res.records || []);
      });
      return;
    }
    portalGet(`/teacher/attendance?courseId=${courseId}&date=${date}`).then((res) => {
      if (res.success) setRecords(res.records || []);
    });
  };

  const loadRoster = () => {
    if (!courseId) {
      setRoster([]);
      setRosterCount(0);
      return;
    }
    portalGet(`/teacher/attendance/roster?courseId=${courseId}&date=${date}`).then((res) => {
      if (res.success) {
        const students = res.students || [];
        setRoster(students);
        setRosterCount(res.count ?? students.length);
        const statusInit = {};
        const notesInit = {};
        students.forEach((s) => {
          const sid = portalDocId(s);
          statusInit[sid] = s.record?.status || 'present';
          notesInit[sid] = s.record?.notes || '';
        });
        setMarks(statusInit);
        setNotes(notesInit);
      }
    });
  };

  useEffect(() => {
    portalGet('/teacher/courses')
      .then((cRes) => {
        if (cRes.success) setCourses(cRes.courses || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRecords();
    loadRoster();
    setSelectedRecordIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, date]);

  const daySummary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, weekend: 0 };
    roster.forEach((s) => {
      const st = marks[portalDocId(s)] || 'present';
      if (counts[st] != null) counts[st] += 1;
    });
    return counts;
  }, [roster, marks]);

  const toggleRecord = (id) => {
    setSelectedRecordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllRecords = () => {
    setSelectedRecordIds(records.map((r) => portalDocId(r)).filter(Boolean));
  };

  const clearRecordSelection = () => setSelectedRecordIds([]);

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
    if (!courseId) {
      setMsg('Select a course first.');
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
        setMsg(`Daily attendance saved for ${res.createdCount ?? ids.length} student(s) on ${date}.`);
        loadRecords();
        loadRoster();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message || 'Failed to save attendance');
    }
  };

  const openEditRecord = (record) => {
    setEditRecord(record);
    setEditForm({ status: record.status || 'present', notes: record.notes || '' });
  };

  const saveEditRecord = async (e) => {
    e.preventDefault();
    if (!editRecord) return;
    try {
      await portalPatch(`/teacher/attendance/${portalDocId(editRecord)}`, {
        status: editForm.status,
        notes: editForm.notes,
      });
      setEditRecord(null);
      setMsg('Attendance record updated.');
      loadRecords();
      if (courseId) loadRoster();
    } catch (err) {
      setMsg(err.message || 'Failed to update record');
    }
  };

  const deleteRecord = async (record) => {
    if (!window.confirm('Delete this attendance record? This cannot be undone.')) return;
    try {
      await portalDelete(`/teacher/attendance/${portalDocId(record)}`);
      setMsg('Attendance record deleted.');
      setSelectedRecordIds((prev) => prev.filter((id) => id !== portalDocId(record)));
      if (editRecord && portalDocId(editRecord) === portalDocId(record)) setEditRecord(null);
      loadRecords();
      if (courseId) loadRoster();
    } catch (err) {
      setMsg(err.message || 'Failed to delete record');
    }
  };

  const bulkDeleteRecords = async () => {
    if (!selectedRecordIds.length) return;
    if (
      !window.confirm(
        `Delete ${selectedRecordIds.length} selected attendance record(s)? This cannot be undone.`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    try {
      const res = await portalPost('/teacher/attendance/bulk-delete', { ids: selectedRecordIds });
      if (res.success) {
        setMsg(`Deleted ${res.deletedCount ?? selectedRecordIds.length} record(s).`);
        setSelectedRecordIds([]);
        setEditRecord(null);
        loadRecords();
        if (courseId) loadRoster();
      } else setMsg(res.error || 'Bulk delete failed');
    } catch (err) {
      setMsg(err.message || 'Failed to delete records');
    } finally {
      setBulkDeleting(false);
    }
  };

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
        subtitle="Mark the full class for a course and date. Use checkboxes in saved records to bulk-delete."
      />

      <form className="portal-card portal-form-card" onSubmit={submitAttendance} autoComplete="off">
        <h3>Full class sheet</h3>

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
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        {courseId && roster.length ? (
          <p className="portal-attendance-roster-count">
            <i className="fas fa-users" aria-hidden="true" /> {rosterCount} student
            {rosterCount === 1 ? '' : 's'} on course roster
          </p>
        ) : null}

        {roster.length ? (
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
            <span className="portal-attendance-chip portal-attendance-chip--weekend">
              Weekend: {daySummary.weekend}
            </span>
          </div>
        ) : null}

        {roster.length ? (
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
                      {s.name}
                      {s.studentId ? ` (${s.studentId})` : ''}
                      {s.enrollmentStatus && s.enrollmentStatus !== 'active' ? (
                        <small className="portal-attendance-enrollment-tag">{s.enrollmentStatus}</small>
                      ) : null}
                    </span>
                    <select
                      aria-label={`Status for ${s.name}`}
                      value={marks[sid] || 'present'}
                      onChange={(e) => setMarks({ ...marks, [sid]: e.target.value })}
                    >
                      {ATTENDANCE_STATUS_OPTIONS.map((o) => (
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
        ) : courseId ? (
          <p className="portal-empty">No students registered on this course yet.</p>
        ) : (
          <p className="portal-empty">Select a course to load students.</p>
        )}

        <button type="submit" disabled={!courseId || !roster.length}>
          Save daily attendance for entire class
        </button>
        {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}
      </form>

      <section className="portal-content-section portal-attendance-records">
        <h2 className="portal-content-section-title">
          Records for {date}
          {courseId ? ` (${courses.find((c) => portalDocId(c) === courseId)?.title || 'course'})` : ''}
        </h2>

        {records.length ? (
          <div className="portal-attendance-records-toolbar">
            <label className="portal-attendance-check portal-attendance-check--header">
              <input
                type="checkbox"
                checked={
                  records.length > 0 &&
                  selectedRecordIds.length === records.filter((r) => portalDocId(r)).length
                }
                onChange={(e) => (e.target.checked ? selectAllRecords() : clearRecordSelection())}
              />
              <span>Select all records</span>
            </label>
            {selectedRecordIds.length ? (
              <button
                type="button"
                className="portal-btn-danger"
                onClick={bulkDeleteRecords}
                disabled={bulkDeleting}
              >
                <i className={`fas ${bulkDeleting ? 'fa-spinner fa-spin' : 'fa-trash-alt'}`} />
                Delete {selectedRecordIds.length} selected
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="portal-attendance-records-table-wrap">
          <table className="portal-attendance-records-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Student</th>
                <th>Course</th>
                <th>Status</th>
                <th>Date</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length ? (
                records.map((r) => {
                  const rid = portalDocId(r);
                  return (
                    <tr key={rid} className={selectedRecordIds.includes(rid) ? 'is-selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedRecordIds.includes(rid)}
                          onChange={() => toggleRecord(rid)}
                          aria-label={`Select record for ${r.student?.name}`}
                        />
                      </td>
                      <td>{r.student?.name || '—'}</td>
                      <td>{r.course?.title || '—'}</td>
                      <td>
                        <span className={`portal-attendance-chip ${statusChipClass(r.status)}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>{new Date(r.date).toLocaleDateString()}</td>
                      <td>{r.notes || '—'}</td>
                      <td>
                        <span className="portal-table-actions">
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
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="portal-empty-cell">
                    No attendance marked for this day yet.
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
              {ATTENDANCE_STATUS_OPTIONS.map((o) => (
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
