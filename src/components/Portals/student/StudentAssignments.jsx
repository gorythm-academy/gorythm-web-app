import React, { useEffect, useMemo, useRef, useState } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { portalGet, portalPost } from '../shared/portalApi';
import FileUploadField from '../shared/FileUploadField';
import { usePortalDialog } from '../shared/PortalDialogContext';
import {
  PortalLoading,
  PortalAlert,
  PortalPageHeader,
  PortalCourseToolbar,
  PortalNewBanner,
  PortalActivityBanner,
} from '../shared/PortalUi';
import { resolveLmsUploadList, hasLmsUploadValue } from '../../../utils/fileUploadApi';
import SubmissionFiles from '../shared/SubmissionFiles';
import LmsMaterialPreviewModal from '../../Admin/shared/LmsMaterialPreviewModal';
import {
  filterPortalItemsByCourse,
  getItemsNewSinceLastVisit,
  markPortalPageVisited,
} from '../../../utils/portalNewItems';
import {
  collectAssignmentUpdateNotices,
  collectSubmissionRemovalNotices,
  dismissActivityNotices,
  dismissSubmissionRemoval,
  filterDismissedActivityNotices,
} from '../../../utils/portalAssignmentNotices';
import { scrollPortalToElement } from '../../../utils/portalScroll';
import '../../Admin/pages/LmsManagement.scss';

const SEEN_KEY = 'student_assignments';
const SEEN_ACTIVITY_KEY = 'student_assignments_activity';

const statusCell = (row) => {
  if (!row.submission) {
    return <span className="portal-status-pill portal-status-pill--pending">Not submitted</span>;
  }
  return (
    <div className="student-assignments-table__status">
      <span className="portal-status-pill portal-status-pill--submitted">Submitted</span>
      {row.submission?.revisionNotice ? (
        <div className="lms-due-date-notice">{row.submission.revisionNotice}</div>
      ) : null}
    </div>
  );
};

const attachmentLabel = (count) => (count === 1 ? 'Attachment' : 'Attachments');

function isAssignmentPastDue(dueDate) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return due.getTime() < now.getTime();
}

const StudentAssignments = () => {
  const { showAlert } = usePortalDialog();
  const submitPanelRef = useRef(null);
  const [assignments, setAssignments] = useState(null);
  const [slotIssues, setSlotIssues] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [newItems, setNewItems] = useState([]);
  const [error, setError] = useState('');
  const [previewAssignment, setPreviewAssignment] = useState(null);
  const [removalDismissTick, setRemovalDismissTick] = useState(0);
  const [activityDismissTick, setActivityDismissTick] = useState(0);

  const load = () => {
    Promise.all([portalGet('/student/assignments'), portalGet('/student/courses')])
      .then(([aRes, cRes]) => {
        if (aRes.success) {
          const list = aRes.assignments || [];
          setAssignments(list);
          setSlotIssues(aRes.slotIssues || null);
          setNewItems(getItemsNewSinceLastVisit(SEEN_KEY, list));
        } else setError(aRes.error || 'Failed to load');
        if (cRes.success) {
          const active = (cRes.enrollments || [])
            .filter((e) => e.course && e.status === 'active')
            .map((e) => ({ _id: e.course._id, title: e.course.title }));
          setCourses(active);
        }
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    markPortalPageVisited(SEEN_KEY);
    setNewItems([]);
  }, []);

  const filtered = useMemo(
    () => filterPortalItemsByCourse(assignments || [], courseFilter),
    [assignments, courseFilter]
  );

  const selectedRow = filtered.find((a) => String(a._id) === String(selected));
  const isPastDue = selectedRow ? isAssignmentPastDue(selectedRow.dueDate) : false;
  const canEditSubmission = Boolean(selectedRow?.submission) && !isPastDue;
  const visibleNew = courseFilter ? filterPortalItemsByCourse(newItems, courseFilter) : newItems;
  const missingSlots = slotIssues?.coursesWithoutSlot || [];

  const assignmentUpdateNotices = useMemo(
    () => collectAssignmentUpdateNotices(assignments || [], SEEN_KEY, { viewerRole: 'student' }),
    [assignments]
  );

  const visibleAssignmentUpdateNotices = useMemo(
    () => {
      void activityDismissTick;
      return filterDismissedActivityNotices(SEEN_ACTIVITY_KEY, assignmentUpdateNotices);
    },
    [assignmentUpdateNotices, activityDismissTick]
  );

  const submissionRemovalNotices = useMemo(
    () => {
      void removalDismissTick;
      return collectSubmissionRemovalNotices(assignments || [], SEEN_KEY);
    },
    [assignments, removalDismissTick]
  );

  const dismissAllRemovalNotices = () => {
    submissionRemovalNotices.forEach((row) => dismissSubmissionRemoval(SEEN_KEY, row.id, row.removedAt));
    setRemovalDismissTick((n) => n + 1);
  };

  const dismissAssignmentUpdateBanner = () => {
    dismissActivityNotices(
      SEEN_ACTIVITY_KEY,
      visibleAssignmentUpdateNotices.map((row) => `${row.id}-${row.message}`)
    );
    setActivityDismissTick((n) => n + 1);
  };

  const startEditSubmission = (row) => {
    setSelected(row._id);
    setText(row.submission?.text || '');
    setAttachments(Array.isArray(row.submission?.attachments) ? row.submission.attachments : []);
    requestAnimationFrame(() => scrollPortalToElement(submitPanelRef.current));
  };

  const onSelectAssignment = (assignmentId) => {
    setSelected(assignmentId);
    const row = filtered.find((a) => String(a._id) === String(assignmentId));
    if (row?.submission) {
      setText(row.submission.text || '');
      setAttachments(Array.isArray(row.submission.attachments) ? row.submission.attachments : []);
    } else {
      setText('');
      setAttachments([]);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!selected) {
      await showAlert({ type: 'error', message: 'Select an assignment first.' });
      return;
    }
    if (isPastDue) {
      await showAlert({ type: 'error', message: 'The due date for this assignment has passed.' });
      return;
    }
    const hasText = String(text || '').trim().length > 0;
    if (!hasText && !hasLmsUploadValue(attachments)) {
      await showAlert({ type: 'error', message: 'Add a written answer or attach at least one file.' });
      return;
    }

    setSubmitting(true);
    try {
      await portalPost('/student/submissions/precheck', { assignmentId: selected });
      const uploaded = await resolveLmsUploadList(attachments, 'assignments');
      await portalPost('/student/submissions', {
        assignmentId: selected,
        text,
        attachments: uploaded,
      });
      await showAlert({
        type: 'success',
        message: canEditSubmission ? 'Submission updated.' : 'Submitted successfully.',
      });
      setText('');
      setAttachments([]);
      setSelected(null);
      load();
    } catch (err) {
      await showAlert({ type: 'error', message: err.message || 'Submit failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const dismissNew = () => {
    markPortalPageVisited(SEEN_KEY);
    setNewItems([]);
  };

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (assignments === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader title="Assignments" subtitle="View instructions, submit work, and track submissions" />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-tasks" />
        </div>
        <div>
          <h2>Homework & Submissions</h2>
          <p>Choose a course to see assignments. Preview teacher files and submit your work.</p>
        </div>
      </div>

      {missingSlots.length ? (
        <PortalAlert type="warning">
          No class slot assigned for: {missingSlots.map((c) => c.title).join(', ')}. Contact admin to assign your
          teacher schedule before assignments appear for those courses.
        </PortalAlert>
      ) : null}

      <PortalNewBanner
        title={`${visibleNew.length} new assignment${visibleNew.length === 1 ? '' : 's'} posted`}
        items={visibleNew}
        itemLabel={(a) => a.title}
        onDismiss={dismissNew}
      />

      <PortalActivityBanner
        title="Assignment updates"
        rows={visibleAssignmentUpdateNotices}
        onDismiss={dismissAssignmentUpdateBanner}
      />

      <PortalActivityBanner
        title="Submission removed"
        rows={submissionRemovalNotices}
        rowKey={(row) => `${row.id}-${row.removedAt}`}
        tone="info"
        onDismiss={dismissAllRemovalNotices}
      />

      <PortalCourseToolbar
        value={courseFilter}
        onChange={setCourseFilter}
        courses={courses}
        label="Filter by course"
        count={courseFilter ? filtered.length : null}
      />

      <div className="portal-panel student-assignments-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Assignment List</h2>
            <p>Status, due dates, and your uploads</p>
          </div>
        </div>
        <div className="portal-panel__body">
          {filtered.length === 0 ? (
            <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
              {missingSlots.length && !assignments.length
                ? 'No assignments yet — your class slot may not be assigned.'
                : 'No assignments for this selection.'}
            </p>
          ) : (
            <div className="portal-data-table-wrap">
              <table className="portal-data-table student-assignments-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Course</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Your Files</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const pastDue = isAssignmentPastDue(r.dueDate);
                    const canEdit = Boolean(r.submission) && !pastDue;
                    return (
                      <tr key={r._id} className={String(selected) === String(r._id) ? 'student-assignments-table__row--active' : ''}>
                        <td>
                          <strong>{r.title}</strong>
                        </td>
                        <td>{r.course?.title || '—'}</td>
                        <td>
                          {r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}
                          {r.dueDateNotice ? <div className="lms-due-date-notice">{r.dueDateNotice}</div> : null}
                        </td>
                        <td>{statusCell(r)}</td>
                        <td>
                          {r.submission?.attachments?.length ? (
                            <SubmissionFiles attachments={r.submission.attachments} />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div className="student-assignments-table__actions">
                            <button
                              type="button"
                              className="lms-btn-secondary lms-btn-secondary--compact"
                              onClick={() => setPreviewAssignment(r)}
                            >
                              <i className="fas fa-eye" aria-hidden /> Preview
                            </button>
                            {canEdit ? (
                              <button
                                type="button"
                                className="lms-btn-secondary lms-btn-secondary--compact"
                                onClick={() => startEditSubmission(r)}
                              >
                                <i className="fas fa-pen" aria-hidden /> Edit
                              </button>
                            ) : !pastDue ? (
                              <button
                                type="button"
                                className="lms-btn-secondary lms-btn-secondary--compact"
                                onClick={() => {
                                  onSelectAssignment(r._id);
                                  requestAnimationFrame(() => scrollPortalToElement(submitPanelRef.current));
                                }}
                              >
                                <i className="fas fa-paper-plane" aria-hidden /> Submit
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {filtered.length > 0 ? (
        <form ref={submitPanelRef} className="portal-submit-panel" onSubmit={submit} autoComplete="off">
          <h3>{canEditSubmission ? 'Edit submission' : 'Submit homework'}</h3>
          <label className="portal-field-label">
            <span>
              Assignment <RequiredMark />
            </span>
            <select value={selected || ''} onChange={(e) => onSelectAssignment(e.target.value)} required>
              <option value="">Select assignment</option>
              {filtered
                .filter((a) => !isAssignmentPastDue(a.dueDate))
                .map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.title}
                    {a.submission ? ' (submitted)' : ''}
                  </option>
                ))}
            </select>
          </label>
          {selectedRow ? (
            <div className="portal-submission-preview">
              {selectedRow.dueDateNotice ? (
                <PortalAlert type="info">{selectedRow.dueDateNotice}</PortalAlert>
              ) : null}
              {selectedRow.description ? (
                <p>
                  <strong>Instructions:</strong> {selectedRow.description}
                </p>
              ) : null}
              {selectedRow.attachments?.length ? (
                <p>
                  <strong>{attachmentLabel(selectedRow.attachments.length)}:</strong>{' '}
                  <button
                    type="button"
                    className="lms-btn-secondary lms-btn-secondary--compact"
                    onClick={() => setPreviewAssignment(selectedRow)}
                  >
                    Preview
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}
          {selectedRow?.submission?.attachments?.length ? (
            <p>
              <strong>Your upload:</strong>{' '}
              <SubmissionFiles attachments={selectedRow.submission.attachments} />
            </p>
          ) : null}
          <p className="portal-field-hint">
            Provide a written answer or attach a file <RequiredMark />
          </p>
          <label className="portal-field-label">
            <span>Your answer</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your answer or notes for the teacher"
              rows={4}
              required={!hasLmsUploadValue(attachments)}
              autoComplete="off"
            />
          </label>
          <FileUploadField
            label="Attach files (optional)"
            value={attachments}
            onChange={setAttachments}
            multiple
          />
          {isPastDue ? (
            <PortalAlert type="info">
              The due date for this assignment has passed. New submissions are not accepted.
            </PortalAlert>
          ) : null}
          <button type="submit" className="portal-submit-panel__btn" disabled={isPastDue || submitting || !selected}>
            {submitting ? 'Saving…' : canEditSubmission ? 'Update submission' : 'Submit assignment'}
          </button>
        </form>
      ) : null}

      <LmsMaterialPreviewModal
        open={Boolean(previewAssignment)}
        kind="assignment"
        item={previewAssignment}
        onClose={() => setPreviewAssignment(null)}
      />
    </div>
  );
};

export default StudentAssignments;
