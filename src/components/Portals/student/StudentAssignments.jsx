import React, { useEffect, useMemo, useState } from 'react';
import { portalGet, portalPost } from '../shared/portalApi';
import FileUploadField from '../shared/FileUploadField';
import {
  PortalLoading,
  PortalAlert,
  PortalPageHeader,
  PortalCourseToolbar,
  PortalNewBanner,
} from '../shared/PortalUi';
import { absFileUrl } from '../../../utils/fileUrl';
import SubmissionFiles from '../shared/SubmissionFiles';
import {
  filterPortalItemsByCourse,
  getItemsNewSinceLastVisit,
  markPortalPageVisited,
} from '../../../utils/portalNewItems';

const SEEN_KEY = 'student_assignments';

const statusPill = (row) => {
  if (!row.submission) return <span className="portal-status-pill portal-status-pill--pending">Pending</span>;
  return <span className="portal-status-pill portal-status-pill--submitted">Submitted</span>;
};

const StudentAssignments = () => {
  const [assignments, setAssignments] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [newItems, setNewItems] = useState([]);

  const load = () => {
    Promise.all([portalGet('/student/assignments'), portalGet('/student/courses')])
      .then(([aRes, cRes]) => {
        if (aRes.success) {
          const list = aRes.assignments || [];
          setAssignments(list);
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

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (isPastDue) {
      setMsg('The due date for this assignment has passed.');
      return;
    }
    const attachments = fileUrl ? [fileUrl] : [];
    try {
      const res = await portalPost('/student/submissions', {
        assignmentId: selected,
        text,
        attachments,
      });
      if (res.success) {
        setMsg('Submitted successfully.');
        setText('');
        setFileUrl('');
        load();
      } else setMsg(res.error || 'Submit failed');
    } catch (err) {
      setMsg(err.message || 'Submit failed');
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

  const selectedRow = filtered.find((a) => String(a._id) === String(selected));
  const isPastDue =
    selectedRow?.dueDate &&
    new Date(selectedRow.dueDate) < new Date() &&
    !selectedRow?.submission;
  const visibleNew = courseFilter ? filterPortalItemsByCourse(newItems, courseFilter) : newItems;

  return (
    <div className="portal-page">
      <PortalPageHeader title="Assignments" subtitle="View instructions, submit work, and track submissions" />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-tasks" />
        </div>
        <div>
          <h2>Homework & submissions</h2>
          <p>Choose a course to see assignments. Download teacher files and submit your work.</p>
        </div>
      </div>

      <PortalNewBanner
        title={`${visibleNew.length} new assignment${visibleNew.length === 1 ? '' : 's'} posted`}
        items={visibleNew}
        itemLabel={(a) => a.title}
        onDismiss={dismissNew}
      />

      <PortalCourseToolbar
        value={courseFilter}
        onChange={setCourseFilter}
        courses={courses}
        label="Filter by course"
        count={courseFilter ? filtered.length : null}
      />

      <div className="portal-panel">
          <div className="portal-panel__head">
            <div>
              <h2>Assignment list</h2>
              <p>Status, due dates, and your uploads</p>
            </div>
          </div>
          <div className="portal-panel__body">
            {filtered.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                No assignments for this selection.
              </p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Course</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th>Your file</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <strong>{r.title}</strong>
                        </td>
                        <td>{r.course?.title || '—'}</td>
                        <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
                        <td>{statusPill(r)}</td>
                        <td>
                          {r.submission?.attachments?.length ? (
                            <a href={absFileUrl(r.submission.attachments[0])} target="_blank" rel="noreferrer">
                              View upload
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      {filtered.some((a) => a.attachments?.length) ? (
        <div className="portal-panel">
          <div className="portal-panel__head">
            <h3>Assignment files Download</h3>
          </div>
          <div className="portal-panel__body portal-panel__body--padded">
            <ul className="portal-resource-list">
              {filtered.flatMap((a) =>
                (a.attachments || []).map((url, i) => (
                  <li key={`${a._id}-${i}`}>
                    <span>
                      {a.title} — {a.course?.title}
                    </span>
                    <a href={absFileUrl(url)} target="_blank" rel="noreferrer">
                      Download
                    </a>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      {filtered.length > 0 ? (
        <form className="portal-submit-panel" onSubmit={submit} autoComplete="off">
          <h3>Submit homework</h3>
          <label className="portal-field-label">
            <span>Assignment</span>
            <select value={selected || ''} onChange={(e) => setSelected(e.target.value)} required>
              <option value="">Select assignment</option>
              {filtered.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          {selectedRow ? (
            <div className="portal-submission-preview">
              {selectedRow.description ? (
                <p>
                  <strong>Instructions:</strong> {selectedRow.description}
                </p>
              ) : null}
              {selectedRow.attachments?.length ? (
                <>
                  <p>
                    <strong>Assignment files Download:</strong>
                  </p>
                  <SubmissionFiles attachments={selectedRow.attachments} />
                </>
              ) : null}
            </div>
          ) : null}
          {selectedRow?.submission?.attachments?.length ? (
            <p>
              <strong>Your upload:</strong>{' '}
              <SubmissionFiles attachments={selectedRow.submission.attachments} />
            </p>
          ) : null}
          <label className="portal-field-label">
            <span>Your answer</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your answer or notes for the teacher"
              rows={4}
              required={!fileUrl}
              autoComplete="off"
            />
          </label>
          <FileUploadField label="Attach file (optional)" value={fileUrl} onChange={setFileUrl} category="assignments" />
          {isPastDue ? (
            <PortalAlert type="info">The due date for this assignment has passed. New submissions are not accepted.</PortalAlert>
          ) : null}
          <button type="submit" disabled={isPastDue}>
            {selectedRow?.submission ? 'Update submission' : 'Submit'}
          </button>
          {msg ? <PortalAlert type={msg.includes('success') ? 'success' : 'error'}>{msg}</PortalAlert> : null}
        </form>
      ) : null}
    </div>
  );
};

export default StudentAssignments;
