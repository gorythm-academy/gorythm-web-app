import React, { useCallback, useEffect, useState } from 'react';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import FileUploadField from '../../Portals/shared/FileUploadField';
import { AUTH_REALM } from '../../../utils/authStorage';
import './LmsManagement.scss';

const TABS = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'resources', label: 'Books & resources' },
];

const EMPTY_ASSIGNMENT = {
  courseId: '',
  teacherId: '',
  title: '',
  description: '',
  dueDate: '',
  maxPoints: '',
  fileUrl: '',
};

const EMPTY_RESOURCE = {
  courseId: '',
  title: '',
  description: '',
  fileUrl: '',
  type: 'file',
};

const ResourcesManagement = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [tab, setTab] = useState('assignments');
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [resources, setResources] = useState([]);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGNMENT);
  const [resourceForm, setResourceForm] = useState(EMPTY_RESOURCE);
  const [editingAssignId, setEditingAssignId] = useState(null);
  const [editingResourceId, setEditingResourceId] = useState(null);

  const loadAssignments = useCallback(async () => {
    try {
      const res = await lmsAdminGet('/assignments');
      if (res.success) {
        setAssignments(res.assignments || []);
        setCourses(res.courses || []);
        setTeachers(res.teachers || []);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [showAlert]);

  const loadResources = useCallback(async () => {
    try {
      const res = await lmsAdminGet('/resources');
      if (res.success) {
        setResources(res.resources || []);
        if (res.courses?.length) setCourses(res.courses);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [showAlert]);

  useEffect(() => {
    if (tab === 'assignments') loadAssignments();
    else loadResources();
  }, [tab, loadAssignments, loadResources]);

  const onCourseChangeAssign = (courseId) => {
    const course = courses.find((c) => String(c._id) === String(courseId));
    setAssignForm((f) => ({
      ...f,
      courseId,
      teacherId: course?.instructor?._id
        ? String(course.instructor._id)
        : course?.instructor
          ? String(course.instructor)
          : f.teacherId,
    }));
  };

  const resetAssignForm = () => {
    setAssignForm(EMPTY_ASSIGNMENT);
    setEditingAssignId(null);
  };

  const resetResourceForm = () => {
    setResourceForm(EMPTY_RESOURCE);
    setEditingResourceId(null);
  };

  const startEditAssignment = (a) => {
    setEditingAssignId(a._id);
    setAssignForm({
      courseId: String(a.course?._id || a.course || ''),
      teacherId: String(a.teacher?._id || a.teacher || ''),
      title: a.title || '',
      description: a.description || '',
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : '',
      maxPoints: a.maxPoints != null ? String(a.maxPoints) : '',
      fileUrl: (a.attachments && a.attachments[0]) || '',
    });
  };

  const startEditResource = (r) => {
    setEditingResourceId(r._id);
    setResourceForm({
      courseId: String(r.course?._id || r.course || ''),
      title: r.title || '',
      description: r.description || '',
      fileUrl: r.fileUrl || '',
      type: r.type || 'file',
    });
  };

  const saveAssignment = async (e) => {
    e.preventDefault();
    const payload = {
      ...assignForm,
      maxPoints: assignForm.maxPoints === '' ? null : Number(assignForm.maxPoints),
      attachments: assignForm.fileUrl ? [assignForm.fileUrl] : [],
    };
    try {
      if (editingAssignId) {
        await lmsAdminPatch(`/assignments/${editingAssignId}`, payload);
        showAlert('Assignment updated.', 'success');
      } else {
        await lmsAdminPost('/assignments', payload);
        showAlert('Assignment published. Visible in teacher & student portals.', 'success');
      }
      resetAssignForm();
      loadAssignments();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const saveResource = async (e) => {
    e.preventDefault();
    try {
      if (editingResourceId) {
        await lmsAdminPatch(`/resources/${editingResourceId}`, resourceForm);
        showAlert('Resource updated.', 'success');
      } else {
        await lmsAdminPost('/resources', resourceForm);
        showAlert('Resource added.', 'success');
      }
      resetResourceForm();
      loadResources();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const removeAssignment = async (id) => {
    const ok = await showConfirm('Remove this assignment from all portals?');
    if (!ok) return;
    try {
      await lmsAdminDelete(`/assignments/${id}`);
      if (editingAssignId === id) resetAssignForm();
      loadAssignments();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  const removeResource = async (id) => {
    const ok = await showConfirm('Remove this resource?');
    if (!ok) return;
    try {
      await lmsAdminDelete(`/resources/${id}`);
      if (editingResourceId === id) resetResourceForm();
      loadResources();
    } catch (err) {
      showAlert(err.message, 'error');
    }
  };

  return (
    <div className="lms-management resources-management">
      <h1>Resources</h1>
      <p className="lms-management-lead">
        Manage assignments and course materials. Upload PDFs or links; teachers and students see content for
        each course.
      </p>
      <div className="lms-management-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'assignments' ? (
        <div className="lms-panel">
          <form className="lms-form-grid portal-form-card" onSubmit={saveAssignment} autoComplete="off">
            <h2>{editingAssignId ? 'Edit assignment' : 'Add assignment'}</h2>
            <label className="lms-field-label">
              <span>Course</span>
              <select
                value={assignForm.courseId}
                onChange={(e) => onCourseChangeAssign(e.target.value)}
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
            <label className="lms-field-label">
              <span>Teacher</span>
              <select
                value={assignForm.teacherId}
                onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}
              >
                <option value="">Course instructor (default)</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="lms-field-label">
              <span>Title</span>
              <input
                value={assignForm.title}
                onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
                placeholder="Title shown to teachers and students"
                required
                autoComplete="off"
              />
            </label>
            <label className="lms-field-label">
              <span>Due date</span>
              <input
                type="date"
                value={assignForm.dueDate}
                onChange={(e) => setAssignForm({ ...assignForm, dueDate: e.target.value })}
                required
              />
            </label>
            <label className="lms-field-label">
              <span>Max points (optional)</span>
              <input
                type="number"
                min="1"
                placeholder="Maximum points for this assignment, if graded"
                value={assignForm.maxPoints}
                onChange={(e) => setAssignForm({ ...assignForm, maxPoints: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label className="lms-field-label">
              <span>Description</span>
              <textarea
                value={assignForm.description}
                onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })}
                placeholder="Instructions or details for this assignment"
              />
            </label>
            <FileUploadField
              label="Attachment (PDF / file)"
              value={assignForm.fileUrl}
              onChange={(url) => setAssignForm({ ...assignForm, fileUrl: url })}
              realm={AUTH_REALM.ADMIN}
            />
            <div className="lms-form-actions">
              <button type="submit">{editingAssignId ? 'Save changes' : 'Publish assignment'}</button>
              {editingAssignId ? (
                <button type="button" className="lms-btn-secondary" onClick={resetAssignForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          <h3 style={{ marginTop: '1.5rem' }}>All assignments</h3>
          <div className="lms-table-wrap">
            <table className="lms-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Course</th>
                  <th>Teacher</th>
                  <th>Due</th>
                  <th>Points</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a._id}>
                    <td>{a.title}</td>
                    <td>{a.course?.title}</td>
                    <td>{a.teacher?.name || '—'}</td>
                    <td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
                    <td>{a.maxPoints != null ? a.maxPoints : '—'}</td>
                    <td className="lms-table-actions">
                      <button type="button" className="lms-btn-secondary" onClick={() => startEditAssignment(a)}>
                        Edit
                      </button>
                      <button type="button" className="lms-btn-danger" onClick={() => removeAssignment(a._id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!assignments.length ? <p className="lms-empty">No assignments yet.</p> : null}
          </div>
        </div>
      ) : (
        <div className="lms-panel">
          <form className="lms-form-grid portal-form-card" onSubmit={saveResource} autoComplete="off">
            <h2>{editingResourceId ? 'Edit resource' : 'Add book / resource'}</h2>
            <label className="lms-field-label">
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
            <label className="lms-field-label">
              <span>Title</span>
              <input
                value={resourceForm.title}
                onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                placeholder="Name of the book, PDF, or resource"
                required
                autoComplete="off"
              />
            </label>
            <label className="lms-field-label">
              <span>Type</span>
              <select
                value={resourceForm.type}
                onChange={(e) => setResourceForm({ ...resourceForm, type: e.target.value })}
              >
                <option value="file">File / PDF</option>
                <option value="link">Link</option>
                <option value="note">Note</option>
              </select>
            </label>
            <FileUploadField
              label="Upload file or paste URL below"
              value={resourceForm.fileUrl}
              onChange={(url) => setResourceForm({ ...resourceForm, fileUrl: url })}
              realm={AUTH_REALM.ADMIN}
            />
            <label className="lms-field-label">
              <span>Or external URL</span>
              <input
                placeholder="Paste a link to a PDF or external resource"
                value={resourceForm.fileUrl}
                onChange={(e) => setResourceForm({ ...resourceForm, fileUrl: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label className="lms-field-label">
              <span>Description</span>
              <textarea
                value={resourceForm.description}
                onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
              />
            </label>
            <div className="lms-form-actions">
              <button type="submit">{editingResourceId ? 'Save changes' : 'Add resource'}</button>
              {editingResourceId ? (
                <button type="button" className="lms-btn-secondary" onClick={resetResourceForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          <h3 style={{ marginTop: '1.5rem' }}>Course resources</h3>
          <div className="lms-table-wrap">
            <table className="lms-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Course</th>
                  <th>Type</th>
                  <th>Uploaded by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r._id}>
                    <td>
                      {r.fileUrl ? (
                        <a href={r.fileUrl} target="_blank" rel="noreferrer">
                          {r.title}
                        </a>
                      ) : (
                        r.title
                      )}
                    </td>
                    <td>{r.course?.title}</td>
                    <td>{r.type}</td>
                    <td>
                      {r.uploadedBy?.name || '—'}
                      {r.uploadedBy?.role ? ` (${r.uploadedBy.role})` : ''}
                    </td>
                    <td className="lms-table-actions">
                      <button type="button" className="lms-btn-secondary" onClick={() => startEditResource(r)}>
                        Edit
                      </button>
                      <button type="button" className="lms-btn-danger" onClick={() => removeResource(r._id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!resources.length ? <p className="lms-empty">No resources yet.</p> : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourcesManagement;
