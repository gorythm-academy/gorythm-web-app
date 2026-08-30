import React, { useEffect, useMemo, useRef, useState } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { portalGet, portalPost, portalPatch } from '../shared/portalApi';
import { resolveLmsUploadList } from '../../../utils/fileUploadApi';
import FileUploadField from '../shared/FileUploadField';
import PortalModal from '../shared/PortalModal';
import SubmissionFiles from '../shared/SubmissionFiles';
import { PortalLoading, PortalAlert, PortalPageHeader, PortalActivityBanner } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import { toLocalDateStr } from '../../../utils/academyWeek';
import { collectAdminAssignmentEditNotices } from '../../../utils/adminEditNotices';
import {
  collectAssignmentUpdateNotices,
  collectSubmissionRevisionNotices,
  collectTeacherSubmissionRemovalNotices,
  dismissActivityNotices,
  dismissSubmissionRemoval,
  filterDismissedActivityNotices,
  getSubmissionRevisionLabel,
} from '../../../utils/portalAssignmentNotices';
import { scheduleScrollToElement } from '../../../utils/portalScroll';
import { usePortalDialog } from '../shared/PortalDialogContext';
import {
  filterPortalItemsByCourse,
  filterPortalItemsByCourseField,
  groupPortalItemsByCourse,
  markPortalPageVisited,
  TEACHER_SEEN_ADMIN_ASSIGNMENTS,
} from '../../../utils/portalNewItems';
import './TeacherContent.scss';

const SEEN_SUBMISSIONS_KEY = 'teacher_submissions';
const SEEN_SUBMISSION_REMOVALS_KEY = 'teacher_submission_removals';
const SEEN_ACTIVITY_KEY = 'teacher_assignments_activity';

const minDueDateValue = () => toLocalDateStr(new Date());

const isAdminLockedAssignment = (a) => !!(a?.lockedForTeacher || a?.createdByRole === 'admin');

const EMPTY_ASSIGN = {
  title: '',
  courseId: '',
  dueDate: '',
  description: '',
  attachments: [],
};

const TeacherContent = () => {
  const { showAlert, showConfirm } = usePortalDialog();
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [submissionRemovals, setSubmissionRemovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN);
  const [editingAssignId, setEditingAssignId] = useState(null);
  const [editingLockedAssign, setEditingLockedAssign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const savingRef = useRef(false);
  const assignFormPanelRef = useRef(null);
  const pendingFormScrollRef = useRef(false);
  const [viewAssignment, setViewAssignment] = useState(null);
  const [submissionModal, setSubmissionModal] = useState(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(() => new Set());
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState(() => new Set());
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [assignmentCourseFilter, setAssignmentCourseFilter] = useState('all');
  const [submissionCourseFilter, setSubmissionCourseFilter] = useState('all');
  const [activityDismissTick, setActivityDismissTick] = useState(0);
  const [removalDismissTick, setRemovalDismissTick] = useState(0);

  const resetAssignForm = () => {
    setEditingAssignId(null);
    setEditingLockedAssign(false);
    setAssignForm(EMPTY_ASSIGN);
    setShowForm(false);
  };

  const reload = () =>
    Promise.all([
      portalGet('/teacher/courses'),
      portalGet('/teacher/assignments'),
      portalGet('/teacher/submissions'),
    ])
      .then(([c, a, s]) => {
        if (c.success) setCourses(c.courses || []);
        if (a.success) setAssignments(a.assignments || []);
        if (s.success) {
          setSubmissions(s.submissions || []);
          setSubmissionRemovals(s.submissionRemovals || []);
        }
        setLoadError('');
      })
      .catch((err) => setLoadError(err.message || 'Failed to load assignments data'));

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    markPortalPageVisited(SEEN_SUBMISSIONS_KEY);
    markPortalPageVisited(TEACHER_SEEN_ADMIN_ASSIGNMENTS);
  }, []);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    if (!pendingFormScrollRef.current || !showForm) return;
    scheduleScrollToElement(() => assignFormPanelRef.current);
    pendingFormScrollRef.current = false;
  }, [showForm, editingAssignId]);

  const saveAssignment = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMsg('');
    try {
      const attachmentList = await resolveLmsUploadList(assignForm.attachments, 'assignments');
      const payload = {
        ...assignForm,
        attachments: attachmentList,
      };
      if (editingAssignId) {
        const id = portalDocId(editingAssignId);
        if (!id) {
          await showAlert({ type: 'error', message: 'Cannot save: open Edit from the assignment list first (missing id).' });
          return;
        }
        const patchPayload = editingLockedAssign
          ? { dueDate: assignForm.dueDate, extendDueDate: true }
          : payload;
        await portalPatch(`/teacher/assignments/${id}`, patchPayload);
        await showAlert({
          type: 'success',
          message: editingLockedAssign ? 'Due date extended.' : 'Assignment updated.',
        });
      } else {
        await portalPost('/teacher/assignments', payload);
        await showAlert({ type: 'success', message: 'Assignment published.' });
      }
      resetAssignForm();
      await reload();
    } catch (err) {
      await showAlert({ type: 'error', message: err.message || 'Failed' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const startEditAssignment = (a) => {
    const id = portalDocId(a);
    if (!id) {
      setMsg('This assignment has no id — refresh the page or contact admin.');
      return;
    }
    const locked = isAdminLockedAssignment(a);
    setEditingAssignId(id);
    setEditingLockedAssign(locked);
    setAssignForm({
      title: a.title || '',
      courseId: String(a.course?._id || a.course || ''),
      dueDate: a.dueDate ? toLocalDateStr(new Date(a.dueDate)) : '',
      description: a.description || '',
      attachments: a.attachments?.length ? [...a.attachments] : [],
    });
    setShowForm(true);
    pendingFormScrollRef.current = true;
  };

  const extendDueDateAssignment = (a) => {
    startEditAssignment(a);
  };

  const deleteAssignmentsByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm({
      title: 'Delete assignments?',
      message:
        confirmText || `Delete ${idList.length} assignment(s)? All related submissions will be removed.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await portalPost('/teacher/assignments/bulk-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      await showAlert({ type: 'success', message: `Removed ${removed} assignment(s).` });
      setSelectedAssignmentIds((prev) => {
        const next = new Set(prev);
        idList.forEach((id) => next.delete(id));
        return next;
      });
      if (editingAssignId && idList.includes(String(editingAssignId))) {
        resetAssignForm();
      }
      if (viewAssignment && idList.includes(portalDocId(viewAssignment))) {
        setViewAssignment(null);
      }
      await reload();
    } catch (err) {
      await showAlert({ type: 'error', message: err.message || 'Delete failed' });
    } finally {
      setDeleting(false);
    }
  };

  const deleteAssignment = async (a) => {
    const id = portalDocId(a);
    deleteAssignmentsByIds([id], `Delete assignment "${a.title}"? Submissions will be removed.`);
  };

  const toggleAssignmentSelect = (id) => {
    if (!id) return;
    setSelectedAssignmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllAssignments = () => {
    const ids = filteredAssignments.map((a) => portalDocId(a)).filter(Boolean);
    const all = ids.length > 0 && ids.every((id) => selectedAssignmentIds.has(id));
    if (all) setSelectedAssignmentIds(new Set());
    else setSelectedAssignmentIds(new Set(ids));
  };

  const toggleSubmissionSelect = (id) => {
    if (!id) return;
    setSelectedSubmissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSubmissions = () => {
    const ids = filteredSubmissions.map((s) => portalDocId(s)).filter(Boolean);
    const all = ids.length > 0 && ids.every((id) => selectedSubmissionIds.has(id));
    if (all) setSelectedSubmissionIds(new Set());
    else setSelectedSubmissionIds(new Set(ids));
  };

  const deleteSubmissionsByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm({
      title: 'Delete submissions?',
      message: confirmText || `Delete ${idList.length} submission(s)? Students can resubmit.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await portalPost('/teacher/submissions/bulk-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      await showAlert({ type: 'success', message: `Removed ${removed} submission(s).` });
      setSelectedSubmissionIds((prev) => {
        const next = new Set(prev);
        idList.forEach((id) => next.delete(id));
        return next;
      });
      if (submissionModal && idList.includes(portalDocId(submissionModal))) {
        setSubmissionModal(null);
      }
      await reload();
    } catch (err) {
      await showAlert({ type: 'error', message: err.message || 'Delete failed' });
    } finally {
      setDeleting(false);
    }
  };

  const deleteOneSubmission = (row, e) => {
    e?.stopPropagation();
    const id = portalDocId(row);
    deleteSubmissionsByIds([id], `Delete submission from "${row.student?.name}"?`);
  };

  const openSubmission = (row) => {
    setSubmissionModal(row);
  };

  const courseOptions = useMemo(
    () => courses.map((c) => ({ _id: portalDocId(c), title: c.title })),
    [courses]
  );

  const filteredAssignments = useMemo(
    () => filterPortalItemsByCourse(assignments, assignmentCourseFilter),
    [assignments, assignmentCourseFilter]
  );

  const filteredSubmissions = useMemo(
    () =>
      filterPortalItemsByCourseField(
        submissions,
        submissionCourseFilter,
        (row) => row.assignment?.course?._id || row.assignment?.course
      ),
    [submissions, submissionCourseFilter]
  );

  const adminEditNotices = useMemo(
    () => collectAdminAssignmentEditNotices(filteredAssignments),
    [filteredAssignments]
  );

  const assignmentUpdateNotices = useMemo(
    () => collectAssignmentUpdateNotices(filteredAssignments, TEACHER_SEEN_ADMIN_ASSIGNMENTS, { viewerRole: 'teacher' }),
    [filteredAssignments]
  );

  const submissionRevisionNotices = useMemo(
    () => collectSubmissionRevisionNotices(filteredSubmissions, SEEN_SUBMISSIONS_KEY),
    [filteredSubmissions]
  );

  const portalActivityNotices = useMemo(() => {
    const seen = new Set();
    const rows = [];
    for (const row of [...adminEditNotices, ...assignmentUpdateNotices, ...submissionRevisionNotices]) {
      const key = `${row.id}-${row.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    return rows;
  }, [adminEditNotices, assignmentUpdateNotices, submissionRevisionNotices]);

  const visibleActivityNotices = useMemo(
    () => {
      void activityDismissTick;
      return filterDismissedActivityNotices(SEEN_ACTIVITY_KEY, portalActivityNotices);
    },
    [portalActivityNotices, activityDismissTick]
  );

  const submissionRemovalNotices = useMemo(
    () => {
      void removalDismissTick;
      return collectTeacherSubmissionRemovalNotices(
        submissionRemovals,
        SEEN_SUBMISSION_REMOVALS_KEY
      );
    },
    [submissionRemovals, removalDismissTick]
  );

  const dismissActivityBanner = () => {
    dismissActivityNotices(
      SEEN_ACTIVITY_KEY,
      visibleActivityNotices.map((row) => `${row.id}-${row.message}`)
    );
    setActivityDismissTick((n) => n + 1);
  };

  const dismissRemovalBanner = () => {
    submissionRemovalNotices.forEach((row) =>
      dismissSubmissionRemoval(SEEN_SUBMISSION_REMOVALS_KEY, row.id, row.removedAt)
    );
    setRemovalDismissTick((n) => n + 1);
  };

  const assignmentGroups = useMemo(() => {
    if (assignmentCourseFilter !== 'all') return null;
    return groupPortalItemsByCourse(
      filteredAssignments,
      (a) => a.course?._id || a.course,
      (a) => a.course?.title
    );
  }, [filteredAssignments, assignmentCourseFilter]);

  const submissionGroups = useMemo(
    () =>
      groupPortalItemsByCourse(
        filteredSubmissions,
        (row) => row.assignment?.course?._id || row.assignment?.course,
        (row) => row.assignment?.course?.title
      ),
    [filteredSubmissions]
  );

  const allAssignsSelected =
    filteredAssignments.length > 0 &&
    filteredAssignments.every((a) => selectedAssignmentIds.has(portalDocId(a)));

  const allSubsSelected =
    filteredSubmissions.length > 0 &&
    filteredSubmissions.every((s) => selectedSubmissionIds.has(portalDocId(s)));

  const renderCourseFilter = (value, onChange, count) => (
    <label className="teacher-assignments__filter">
      <span className="teacher-assignments__filter-label">Filter by course</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by course">
        <option value="all">All courses</option>
        {courseOptions.map((c) => (
          <option key={c._id} value={c._id}>
            {c.title}
          </option>
        ))}
      </select>
      {value ? <span className="teacher-assignments__filter-meta">{count} shown</span> : null}
    </label>
  );

  const renderAssignmentRows = (rows) =>
    rows.map((a) => {
      const assignId = portalDocId(a);
      const assignSelected = selectedAssignmentIds.has(assignId);
      const locked = isAdminLockedAssignment(a);
      return (
        <tr key={assignId} className={assignSelected ? 'teacher-assignments__row--selected' : ''}>
          <td className="teacher-assignments__check-col">
            <input
              type="checkbox"
              checked={assignSelected}
              onChange={() => toggleAssignmentSelect(assignId)}
              aria-label={`Select ${a.title}`}
              disabled={locked}
            />
          </td>
          <td>
            {a.title}
            {locked ? (
              <span className="teacher-assignments__admin-badge" title="Published by admin">
                Admin
              </span>
            ) : null}
          </td>
          <td>{a.course?.title}</td>
          <td>
            {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}
            {a.dueDateNotice ? <div className="lms-due-date-notice">{a.dueDateNotice}</div> : null}
          </td>
          <td>
            <div className="portal-table-actions">
              <button type="button" className="teacher-assignments__btn teacher-assignments__btn--ghost teacher-assignments__btn--small" onClick={() => setViewAssignment(a)}>
                View
              </button>
              {locked ? (
                <button type="button" className="teacher-assignments__btn teacher-assignments__btn--ghost teacher-assignments__btn--small" onClick={() => extendDueDateAssignment(a)}>
                  Extend due
                </button>
              ) : (
                <>
                  <button type="button" className="teacher-assignments__btn teacher-assignments__btn--ghost teacher-assignments__btn--small" onClick={() => startEditAssignment(a)}>
                    Edit
                  </button>
                  <button type="button" className="teacher-assignments__btn teacher-assignments__btn--danger teacher-assignments__btn--small" disabled={deleting} onClick={() => deleteAssignment(a)}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </td>
        </tr>
      );
    });

  const renderSubmissionRows = (rows) =>
    rows.map((r) => {
      const id = portalDocId(r);
      const selected = selectedSubmissionIds.has(id);
      return (
        <tr
          key={id}
          className={[
            r.status === 'submitted' ? 'teacher-assignments__row--pending' : '',
            selected ? 'teacher-assignments__row--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <td className="teacher-assignments__check-col">
            <input type="checkbox" checked={selected} onChange={() => toggleSubmissionSelect(id)} aria-label={`Select ${r.student?.name}`} />
          </td>
          <td>{r.student?.name || '—'}</td>
          <td>{r.student?.studentId || '—'}</td>
          <td>{r.assignment?.title || '—'}</td>
          <td>{r.assignment?.course?.title || '—'}</td>
          <td>
            {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
            {getSubmissionRevisionLabel(r) ? (
              <div className="lms-due-date-notice">{getSubmissionRevisionLabel(r)}</div>
            ) : null}
          </td>
          <td>
            <div className="portal-table-actions">
              <button type="button" className="teacher-assignments__btn teacher-assignments__btn--ghost teacher-assignments__btn--small" onClick={() => openSubmission(r)}>
                View
              </button>
              <button type="button" className="teacher-assignments__btn teacher-assignments__btn--danger teacher-assignments__btn--small" disabled={deleting} onClick={(e) => deleteOneSubmission(r, e)}>
                Delete
              </button>
            </div>
          </td>
        </tr>
      );
    });

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  if (!courses.length) {
    return (
      <div className="portal-page teacher-assignments">
        {loadError ? <PortalAlert type="error">{loadError}</PortalAlert> : null}
        <PortalPageHeader
          title="Assignments"
          subtitle={loadError
            ? 'Could not load your courses. Refresh the page or try again later.'
            : 'No courses assigned yet. Ask admin to set your account as instructor on a course.'}
        />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-assignments">
      <PortalPageHeader
        title="Assignments"
        subtitle="Publish homework, review student submissions, or remove invalid entries."
      />

      <PortalActivityBanner
        title="Recent updates"
        rows={visibleActivityNotices}
        onDismiss={dismissActivityBanner}
      />

      <PortalActivityBanner
        title="Submission removed by admin"
        rows={submissionRemovalNotices}
        rowKey={(row) => `${row.id}-${row.removedAt}`}
        tone="info"
        onDismiss={dismissRemovalBanner}
      />

      {loadError ? <PortalAlert type="error">{loadError}</PortalAlert> : null}
      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}

      <div className="teacher-assignments__layout">
        {showForm ? (
        <aside className="teacher-assignments__form-panel" ref={assignFormPanelRef}>
          <div className="teacher-assignments__form-head">
            <div className="teacher-assignments__form-icon" aria-hidden="true">
              <i className="fas fa-tasks" />
            </div>
            <div>
              <h2>{editingLockedAssign ? 'Extend Due Date' : editingAssignId ? 'Edit Assignment' : 'Create Assignment'}</h2>
              <p>
                {editingLockedAssign
                  ? 'This assignment was published by admin. You can extend the due date only.'
                  : 'Students on your class slot can view and submit before the due date.'}
              </p>
            </div>
            <button
              type="button"
              className="teacher-assignments__form-close"
              onClick={resetAssignForm}
              aria-label="Close assignment form"
            >
              <i className="fas fa-times" />
            </button>
          </div>
          <form onSubmit={saveAssignment} autoComplete="off">
            {!editingLockedAssign ? (
              <>
                <label className="portal-field-label">
                  <span>Title <RequiredMark /></span>
                  <input
                    value={assignForm.title}
                    onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
                    required
                  />
                </label>
                <label className="portal-field-label">
                  <span>Course <RequiredMark /></span>
                  <select
                    value={assignForm.courseId}
                    onChange={(e) => setAssignForm({ ...assignForm, courseId: e.target.value })}
                    required
                    disabled={!!editingAssignId}
                  >
                    <option value="">Select course</option>
                    {courses.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <p className="teacher-assignments__locked-meta">
                  <strong>{assignForm.title}</strong>
                </p>
                <p className="teacher-assignments__locked-meta">
                  Course: {courses.find((c) => String(c._id) === String(assignForm.courseId))?.title || '—'}
                </p>
              </>
            )}
            <label className="portal-field-label">
              <span>Due date <RequiredMark /></span>
              <input
                type="date"
                value={assignForm.dueDate}
                min={minDueDateValue()}
                onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })}
                required
              />
            </label>
            {!editingLockedAssign ? (
              <>
                <label className="portal-field-label">
                  <span>Description</span>
                  <textarea
                    value={assignForm.description}
                    onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })}
                    rows={3}
                  />
                </label>
                <FileUploadField
                  label="Attachments for students (PDF / file)"
                  value={assignForm.attachments}
                  onChange={(attachments) => setAssignForm({ ...assignForm, attachments })}
                  category="assignments"
                  multiple
                />
              </>
            ) : null}
            <div className="portal-table-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingLockedAssign ? 'Extend due date' : editingAssignId ? 'Save changes' : 'Publish'}
              </button>
              <button
                type="button"
                className="teacher-assignments__btn teacher-assignments__btn--ghost"
                onClick={resetAssignForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </aside>
        ) : null}

        <div className="teacher-assignments__main">
          <section className="teacher-assignments__panel">
            <div className="teacher-assignments__panel-head">
              <h2>Published Assignments</h2>
              <div className="teacher-assignments__panel-actions">
                {renderCourseFilter(assignmentCourseFilter, setAssignmentCourseFilter, filteredAssignments.length)}
                {!showForm ? (
                  <button
                    type="button"
                    className="teacher-assignments__make-btn"
                    onClick={() => setShowForm(true)}
                  >
                    <i className="fas fa-plus" aria-hidden="true" /> Create Assignment
                  </button>
                ) : null}
              </div>
            </div>

            {selectedAssignmentIds.size > 0 ? (
              <div className="teacher-assignments__bulk-bar">
                <span>{selectedAssignmentIds.size} selected</span>
                <div className="portal-table-actions">
                  <button
                    type="button"
                    className="teacher-assignments__btn teacher-assignments__btn--ghost"
                    onClick={() => setSelectedAssignmentIds(new Set())}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="teacher-assignments__btn teacher-assignments__btn--danger"
                    disabled={deleting}
                    onClick={() => deleteAssignmentsByIds(selectedAssignmentIds)}
                  >
                    {deleting ? 'Deleting…' : `Delete selected (${selectedAssignmentIds.size})`}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="teacher-assignments__list-wrap">
              <table className="teacher-assignments__table">
                <thead>
                  <tr>
                    <th className="teacher-assignments__check-col">
                      <input
                        type="checkbox"
                        checked={allAssignsSelected}
                        onChange={toggleAllAssignments}
                        aria-label="Select all assignments"
                      />
                    </th>
                    <th>Title</th>
                    <th>Course</th>
                    <th>Due</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentGroups
                    ? assignmentGroups.flatMap((group) => [
                        <tr key={`assign-head-${group.courseId}`} className="teacher-assignments__course-row">
                          <td colSpan={5}>
                            <span className="portal-course-group__title">{group.title}</span>
                          </td>
                        </tr>,
                        ...renderAssignmentRows(group.items),
                      ])
                    : renderAssignmentRows(filteredAssignments)}
                </tbody>
              </table>
              {!filteredAssignments.length ? (
                <p className="teacher-assignments__empty">
                  {assignmentCourseFilter === 'all' ? 'No assignments yet.' : 'No assignments for this course.'}
                </p>
              ) : null}
            </div>
          </section>

          <section className="teacher-assignments__panel">
            <div className="teacher-assignments__panel-head">
              <h2>Student Submissions</h2>
              {renderCourseFilter(submissionCourseFilter, setSubmissionCourseFilter, filteredSubmissions.length)}
            </div>

            {selectedSubmissionIds.size > 0 ? (
              <div className="teacher-assignments__bulk-bar">
                <span>{selectedSubmissionIds.size} selected</span>
                <div className="portal-table-actions">
                  <button type="button" className="teacher-assignments__btn teacher-assignments__btn--ghost" onClick={() => setSelectedSubmissionIds(new Set())}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="teacher-assignments__btn teacher-assignments__btn--danger"
                    disabled={deleting}
                    onClick={() => deleteSubmissionsByIds(selectedSubmissionIds)}
                  >
                    {deleting ? 'Deleting…' : `Delete selected (${selectedSubmissionIds.size})`}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="teacher-assignments__list-wrap">
              <table className="teacher-assignments__table">
                <thead>
                  <tr>
                    <th className="teacher-assignments__check-col">
                      <input type="checkbox" checked={allSubsSelected} onChange={toggleAllSubmissions} aria-label="Select all submissions" />
                    </th>
                    <th>Student</th>
                    <th>Roll No.</th>
                    <th>Assignment</th>
                    <th>Course</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionGroups.flatMap((group) => [
                    <tr key={`sub-head-${group.courseId}`} className="teacher-assignments__course-row">
                      <td colSpan={7}>
                        <span className="portal-course-group__title">{group.title}</span>
                      </td>
                    </tr>,
                    ...renderSubmissionRows(group.items),
                  ])}
                </tbody>
              </table>
              {!filteredSubmissions.length ? (
                <p className="teacher-assignments__empty">
                  {submissionCourseFilter === 'all' ? 'No submissions yet.' : 'No submissions for this course.'}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {viewAssignment ? (
        <PortalModal title={viewAssignment.title} onClose={() => setViewAssignment(null)}>
          <p><strong>Course:</strong> {viewAssignment.course?.title}</p>
          <p><strong>Due:</strong> {new Date(viewAssignment.dueDate).toLocaleDateString()}</p>
          <p><strong>Description:</strong> {viewAssignment.description || '—'}</p>
          {viewAssignment.attachments?.length ? (
            <>
              <p><strong>Materials:</strong></p>
              <SubmissionFiles attachments={viewAssignment.attachments} />
            </>
          ) : null}
        </PortalModal>
      ) : null}

      {submissionModal ? (
        <PortalModal
          title={`Submission — ${submissionModal.student?.name}`}
          onClose={() => setSubmissionModal(null)}
          wide
        >
          <p><strong>Roll No.:</strong> {submissionModal.student?.studentId || '—'}</p>
          <p><strong>Assignment:</strong> {submissionModal.assignment?.title}</p>
          <p><strong>Course:</strong> {submissionModal.assignment?.course?.title || '—'}</p>
          <p><strong>Submitted:</strong> {submissionModal.submittedAt ? new Date(submissionModal.submittedAt).toLocaleString() : '—'}</p>
          {(submissionModal.text || '').trim() ? (
            <p><strong>Written answer:</strong><br />{submissionModal.text}</p>
          ) : null}
          <p><strong>Files:</strong></p>
          <SubmissionFiles attachments={submissionModal.attachments} />
          <div className="teacher-assignments__modal-actions" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="teacher-assignments__btn teacher-assignments__btn--danger"
              disabled={deleting}
              onClick={() => deleteOneSubmission(submissionModal)}
            >
              Delete submission
            </button>
          </div>
        </PortalModal>
      ) : null}

      {loadError ? <PortalAlert type="error">{loadError}</PortalAlert> : null}
      {msg ? <div className="teacher-assignments__toast" role="status">{msg}</div> : null}
    </div>
  );
};

export default TeacherContent;
