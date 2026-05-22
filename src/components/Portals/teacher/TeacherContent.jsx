import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import FileUploadField from '../shared/FileUploadField';
import PortalModal from '../shared/PortalModal';
import SubmissionFiles from '../shared/SubmissionFiles';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import { absFileUrl } from '../../../utils/fileUrl';
import { formatScore } from '../../../utils/formatScore';
import { portalDocId } from '../../../utils/portalDocId';

const EMPTY_ASSIGN = {
  title: '',
  courseId: '',
  dueDate: '',
  description: '',
  maxPoints: '',
  fileUrl: '',
};

const EMPTY_RESOURCE = {
  title: '',
  courseId: '',
  fileUrl: '',
  type: 'file',
  description: '',
};

const TeacherContent = () => {
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [resources, setResources] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN);
  const [resourceForm, setResourceForm] = useState(EMPTY_RESOURCE);
  const [editingAssignId, setEditingAssignId] = useState(null);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [viewAssignment, setViewAssignment] = useState(null);
  const [submissionModal, setSubmissionModal] = useState(null);
  const [ungradedOnly, setUngradedOnly] = useState(
    () => searchParams.get('filter') === 'ungraded'
  );
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' });

  const reload = () => {
    const subPath = ungradedOnly ? '/teacher/submissions?ungradedOnly=true' : '/teacher/submissions';
    return Promise.all([
      portalGet('/teacher/courses'),
      portalGet('/teacher/assignments'),
      portalGet('/teacher/resources'),
      portalGet(subPath),
    ]).then(([c, a, r, s]) => {
      if (c.success) setCourses(c.courses || []);
      if (a.success) setAssignments(a.assignments || []);
      if (r.success) setResources(r.resources || []);
      if (s.success) setSubmissions(s.submissions || []);
    });
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filter changes
  }, [ungradedOnly]);

  const maxForGrade = submissionModal?.assignment?.maxPoints;

  const saveAssignment = async (e) => {
    e.preventDefault();
    setMsg('');
    const payload = {
      ...assignForm,
      maxPoints: assignForm.maxPoints === '' ? null : Number(assignForm.maxPoints),
      attachments: assignForm.fileUrl ? [assignForm.fileUrl] : [],
    };
    try {
      if (editingAssignId) {
        const id = portalDocId(editingAssignId);
        if (!id) {
          setMsg('Cannot save: open Edit from the assignment list first (missing id).');
          return;
        }
        await portalPatch(`/teacher/assignments/${id}`, payload);
        setMsg('Assignment updated.');
      } else {
        await portalPost('/teacher/assignments', payload);
        setMsg('Assignment published.');
      }
      setAssignForm(EMPTY_ASSIGN);
      setEditingAssignId(null);
      reload();
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  const startEditAssignment = (a) => {
    const id = portalDocId(a);
    if (!id) {
      setMsg('This assignment has no id — refresh the page or contact admin.');
      return;
    }
    setEditingAssignId(id);
    setAssignForm({
      title: a.title || '',
      courseId: String(a.course?._id || a.course || ''),
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : '',
      description: a.description || '',
      maxPoints: a.maxPoints != null ? String(a.maxPoints) : '',
      fileUrl: (a.attachments && a.attachments[0]) || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteAssignment = async (a) => {
    if (!window.confirm(`Delete assignment "${a.title}"? Submissions will be removed.`)) return;
    try {
      await portalDelete(`/teacher/assignments/${portalDocId(a)}`);
      setMsg('Assignment deleted.');
      if (editingAssignId === a._id) {
        setEditingAssignId(null);
        setAssignForm(EMPTY_ASSIGN);
      }
      reload();
    } catch (err) {
      setMsg(err.message || 'Delete failed');
    }
  };

  const saveResource = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      if (editingResourceId) {
        const id = portalDocId(editingResourceId);
        if (!id) {
          setMsg('Cannot save: open Edit from the resource list first.');
          return;
        }
        await portalPatch(`/teacher/resources/${id}`, resourceForm);
        setMsg('Resource updated.');
      } else {
        await portalPost('/teacher/resources', resourceForm);
        setMsg('Resource added.');
      }
      setResourceForm(EMPTY_RESOURCE);
      setEditingResourceId(null);
      reload();
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  const startEditResource = (r) => {
    setEditingResourceId(r._id);
    setResourceForm({
      title: r.title || '',
      courseId: String(r.course?._id || r.course || ''),
      fileUrl: r.fileUrl || '',
      type: r.type || 'file',
      description: r.description || '',
    });
  };

  const deleteResource = async (r) => {
    if (!window.confirm(`Remove resource "${r.title}"?`)) return;
    try {
      await portalDelete(`/teacher/resources/${portalDocId(r)}`);
      setMsg('Resource removed.');
      reload();
    } catch (err) {
      setMsg(err.message || 'Delete failed');
    }
  };

  const openSubmission = (row) => {
    setSubmissionModal(row);
    setGradeForm({
      score: row.score != null ? String(row.score) : '',
      feedback: row.feedback || '',
    });
  };

  const gradeInModal = async (e) => {
    e.preventDefault();
    if (!submissionModal) return;
    try {
      const res = await portalPatch(`/teacher/submissions/${portalDocId(submissionModal)}/grade`, {
        score: Number(gradeForm.score),
        feedback: gradeForm.feedback,
      });
      if (res.success) {
        setMsg('Grade saved.');
        setSubmissionModal(null);
        reload();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message || 'Failed to grade');
    }
  };

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  if (!courses.length) {
    return (
      <div className="portal-page">
        <PortalPageHeader
          title="Content & assignments"
          subtitle="No courses assigned yet. Ask admin to set your account as instructor on a course."
        />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-content-page">
      <PortalPageHeader
        title="Content & assignments"
        subtitle="Manage assignments, resources, and grade student work."
      />

      <section className="portal-content-section">
        <h2 className="portal-content-section-title">
          {editingAssignId ? 'Edit assignment' : 'Create assignment'}
        </h2>
        <form className="portal-card portal-form-card" onSubmit={saveAssignment} autoComplete="off">
          <label className="portal-field-label">
            <span>Title</span>
            <input
              value={assignForm.title}
              onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
              required
            />
          </label>
          <label className="portal-field-label">
            <span>Course</span>
            <select
              value={assignForm.courseId}
              onChange={(e) => setAssignForm({ ...assignForm, courseId: e.target.value })}
              required
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="portal-field-label">
            <span>Due date</span>
            <input
              type="date"
              value={assignForm.dueDate}
              onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })}
              required
            />
          </label>
          <label className="portal-field-label">
            <span>Maximum points (optional)</span>
            <input
              type="number"
              min="1"
              placeholder="Leave empty if not graded with points"
              value={assignForm.maxPoints}
              onChange={(e) => setAssignForm({ ...assignForm, maxPoints: e.target.value })}
            />
          </label>
          <label className="portal-field-label">
            <span>Description</span>
            <textarea
              value={assignForm.description}
              onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })}
            />
          </label>
          <FileUploadField
            label="Attachment for students (PDF / file)"
            value={assignForm.fileUrl}
            onChange={(url) => setAssignForm({ ...assignForm, fileUrl: url })}
          />
          <div className="portal-table-actions">
            <button type="submit">{editingAssignId ? 'Save changes' : 'Publish'}</button>
            {editingAssignId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingAssignId(null);
                  setAssignForm(EMPTY_ASSIGN);
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="portal-content-section">
        <h2 className="portal-content-section-title">Course assignments</h2>
        <SimpleTable
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'course', label: 'Course', render: (r) => r.course?.title },
            { key: 'due', label: 'Due', render: (r) => new Date(r.dueDate).toLocaleDateString() },
            {
              key: 'pts',
              label: 'Max pts',
              render: (r) => (r.maxPoints != null ? r.maxPoints : '—'),
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => (
                <div className="portal-table-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => setViewAssignment(r)}>
                    View
                  </button>
                  <button type="button" onClick={() => startEditAssignment(r)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => deleteAssignment(r)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={assignments}
          emptyLabel="No assignments yet."
        />
      </section>

      <section className="portal-content-section">
        <h2 className="portal-content-section-title">
          {editingResourceId ? 'Edit resource' : 'Add book / resource'}
        </h2>
        <form className="portal-card portal-form-card" onSubmit={saveResource} autoComplete="off">
          <label className="portal-field-label">
            <span>Title</span>
            <input
              value={resourceForm.title}
              onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
              required
            />
          </label>
          <label className="portal-field-label">
            <span>Course</span>
            <select
              value={resourceForm.courseId}
              onChange={(e) => setResourceForm({ ...resourceForm, courseId: e.target.value })}
              required
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <FileUploadField
            label="Upload file"
            value={resourceForm.fileUrl}
            onChange={(url) => setResourceForm({ ...resourceForm, fileUrl: url })}
          />
          <button type="submit">{editingResourceId ? 'Save resource' : 'Add resource'}</button>
        </form>
      </section>

      <section className="portal-content-section">
        <h2 className="portal-content-section-title">Course resources</h2>
        <SimpleTable
          columns={[
            {
              key: 'title',
              label: 'Title',
              render: (r) =>
                r.fileUrl ? (
                  <a href={absFileUrl(r.fileUrl)} target="_blank" rel="noreferrer">
                    {r.title}
                  </a>
                ) : (
                  r.title
                ),
            },
            { key: 'course', label: 'Course', render: (r) => r.course?.title },
            { key: 'type', label: 'Type' },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => (
                <div className="portal-table-actions">
                  <button type="button" onClick={() => startEditResource(r)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => deleteResource(r)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={resources}
          emptyLabel="No resources yet."
        />
      </section>

      <section className="portal-content-section">
        <h2 className="portal-content-section-title">Student submissions</h2>
        <label className="portal-field-label" style={{ maxWidth: '280px' }}>
          <span>Filter</span>
          <select value={ungradedOnly ? 'ungraded' : 'all'} onChange={(e) => setUngradedOnly(e.target.value === 'ungraded')}>
            <option value="all">All submissions</option>
            <option value="ungraded">Needs grading only</option>
          </select>
        </label>
        <p className="portal-empty" style={{ marginTop: 0 }}>
          Click a row to view details and grade.
        </p>
        <SimpleTable
          columns={[
            { key: 'student', label: 'Student', render: (r) => r.student?.name },
            { key: 'assignment', label: 'Assignment', render: (r) => r.assignment?.title },
            { key: 'status', label: 'Status' },
            {
              key: 'score',
              label: 'Score',
              render: (r) => formatScore(r.score, r.assignment?.maxPoints),
            },
          ]}
          rows={submissions}
          emptyLabel="No submissions."
          onRowClick={openSubmission}
          rowClassName={(r) => (r.status === 'submitted' ? 'portal-row--pending' : '')}
        />
      </section>

      {viewAssignment ? (
        <PortalModal title={viewAssignment.title} onClose={() => setViewAssignment(null)}>
          <p>
            <strong>Course:</strong> {viewAssignment.course?.title}
          </p>
          <p>
            <strong>Due:</strong> {new Date(viewAssignment.dueDate).toLocaleDateString()}
          </p>
          <p>
            <strong>Max points:</strong>{' '}
            {viewAssignment.maxPoints != null ? viewAssignment.maxPoints : 'Not set'}
          </p>
          <p>
            <strong>Description:</strong> {viewAssignment.description || '—'}
          </p>
          {viewAssignment.attachments?.length ? (
            <>
              <p>
                <strong>Materials:</strong>
              </p>
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
          <p>
            <strong>Assignment:</strong> {submissionModal.assignment?.title}
          </p>
          <p>
            <strong>Submitted:</strong>{' '}
            {submissionModal.submittedAt
              ? new Date(submissionModal.submittedAt).toLocaleString()
              : '—'}
          </p>
          {(submissionModal.text || '').trim() ? (
            <p>
              <strong>Written answer:</strong>
              <br />
              {submissionModal.text}
            </p>
          ) : null}
          <p>
            <strong>Files:</strong>
          </p>
          <SubmissionFiles attachments={submissionModal.attachments} />
          <form className="portal-form-card" onSubmit={gradeInModal} style={{ marginTop: '1rem' }}>
            <label className="portal-field-label">
              <span>
                Score
                {maxForGrade != null && maxForGrade > 0
                  ? ` (out of ${maxForGrade})`
                  : ' (no maximum set on assignment)'}
              </span>
              <input
                type="number"
                min="0"
                max={maxForGrade != null && maxForGrade > 0 ? maxForGrade : undefined}
                value={gradeForm.score}
                onChange={(e) => setGradeForm({ ...gradeForm, score: e.target.value })}
                required
              />
            </label>
            <label className="portal-field-label">
              <span>Feedback for student</span>
              <textarea
                value={gradeForm.feedback}
                onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                rows={3}
              />
            </label>
            <button type="submit">Save grade</button>
          </form>
        </PortalModal>
      ) : null}

      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}
    </div>
  );
};

export default TeacherContent;
