import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import FileUploadField from '../../Portals/shared/FileUploadField';
import { AUTH_REALM } from '../../../utils/authStorage';
import AdminAssignmentSubmissions from './AdminAssignmentSubmissions';
import './LmsManagement.scss';

const TABS = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'resources', label: 'Books & resources' },
  { id: 'submissions', label: 'Student submissions' },
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

const ResourcesManagement = ({ defaultTab = 'assignments' }) => {
  const { showAlert, showConfirm } = useAdminDialog();
  const location = useLocation();
  const initialTab =
    defaultTab === 'submissions' || location.pathname.endsWith('/submissions')
      ? 'submissions'
      : defaultTab === 'resources' || location.pathname.endsWith('/resources')
        ? 'resources'
        : 'assignments';
  const [tab, setTab] = useState(initialTab);
  const [savingResource, setSavingResource] = useState(false);
  const savingResourceRef = useRef(false);
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [resources, setResources] = useState([]);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGNMENT);
  const [resourceForm, setResourceForm] = useState(EMPTY_RESOURCE);
  const [editingAssignId, setEditingAssignId] = useState(null);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState(() => new Set());
  const [deletingResources, setDeletingResources] = useState(false);
  const [assignListCourseFilter, setAssignListCourseFilter] = useState('');
  const [resourceListCourseFilter, setResourceListCourseFilter] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(() => new Set());
  const [deletingAssignments, setDeletingAssignments] = useState(false);

  const loadAssignments = useCallback(async () => {
    try {
      const meta = await lmsAdminGet('/assignments');
      if (meta.success) {
        setCourses(meta.courses || []);
        setTeachers(meta.teachers || []);
      }
      if (!assignListCourseFilter) {
        setAssignments([]);
        return;
      }
      const path =
        assignListCourseFilter === 'all'
          ? '/assignments'
          : `/assignments?courseId=${encodeURIComponent(assignListCourseFilter)}`;
      const res = await lmsAdminGet(path);
      if (res.success) setAssignments(res.assignments || []);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [assignListCourseFilter, showAlert]);

  const loadResources = useCallback(async () => {
    try {
      const meta = await lmsAdminGet('/resources');
      if (meta.success && meta.courses?.length) setCourses(meta.courses);
      if (!resourceListCourseFilter) {
        setResources([]);
        return;
      }
      const path =
        resourceListCourseFilter === 'all'
          ? '/resources'
          : `/resources?courseId=${encodeURIComponent(resourceListCourseFilter)}`;
      const res = await lmsAdminGet(path);
      if (res.success) {
        setResources(res.resources || []);
        if (res.courses?.length) setCourses(res.courses);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [resourceListCourseFilter, showAlert]);

  useEffect(() => {
    const nextTab =
      defaultTab === 'submissions' || location.pathname.endsWith('/submissions')
        ? 'submissions'
        : defaultTab === 'resources' || location.pathname.endsWith('/resources')
          ? 'resources'
          : 'assignments';
    setTab(nextTab);
  }, [defaultTab, location.pathname]);

  useEffect(() => {
    if (tab === 'assignments') loadAssignments();
    else if (tab === 'resources') loadResources();
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
    if (savingResourceRef.current) return;
    savingResourceRef.current = true;
    setSavingResource(true);
    try {
      if (editingResourceId) {
        await lmsAdminPatch(`/resources/${editingResourceId}`, resourceForm);
        showAlert('Resource updated.', 'success');
      } else {
        await lmsAdminPost('/resources', resourceForm);
        showAlert('Resource added.', 'success');
      }
      resetResourceForm();
      await loadResources();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      savingResourceRef.current = false;
      setSavingResource(false);
    }
  };

  const removeAssignment = async (id) => {
    removeAssignmentsByIds([String(id)], 'Remove this assignment from all portals?');
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
    const ids = assignments.map((a) => String(a._id)).filter(Boolean);
    const allSelected = ids.length > 0 && ids.every((id) => selectedAssignmentIds.has(id));
    if (allSelected) setSelectedAssignmentIds(new Set());
    else setSelectedAssignmentIds(new Set(ids));
  };

  const removeAssignmentsByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText || `Remove ${idList.length} selected assignment${idList.length > 1 ? 's' : ''}? Student submissions will also be deleted.`
    );
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      const res = await lmsAdminPost('/assignments/bulk-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      showAlert(`Removed ${removed} assignment${removed !== 1 ? 's' : ''}.`, 'success');
      setSelectedAssignmentIds((prev) => {
        const next = new Set(prev);
        idList.forEach((id) => next.delete(id));
        return next;
      });
      if (editingAssignId && idList.includes(String(editingAssignId))) resetAssignForm();
      await loadAssignments();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const bulkRemoveAssignments = () => removeAssignmentsByIds(selectedAssignmentIds);

  const toggleResourceSelect = (id) => {
    if (!id) return;
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllResources = () => {
    const ids = resources.map((r) => String(r._id)).filter(Boolean);
    const allSelected = ids.length > 0 && ids.every((id) => selectedResourceIds.has(id));
    if (allSelected) {
      setSelectedResourceIds(new Set());
    } else {
      setSelectedResourceIds(new Set(ids));
    }
  };

  const removeResourcesByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText || `Remove ${idList.length} selected resource${idList.length > 1 ? 's' : ''}?`
    );
    if (!ok) return;
    setDeletingResources(true);
    try {
      const res = await lmsAdminPost('/resources/bulk-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      showAlert(`Removed ${removed} resource${removed !== 1 ? 's' : ''}.`, 'success');
      setSelectedResourceIds((prev) => {
        const next = new Set(prev);
        idList.forEach((id) => next.delete(id));
        return next;
      });
      if (editingResourceId && idList.includes(String(editingResourceId))) resetResourceForm();
      await loadResources();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingResources(false);
    }
  };

  const removeResource = async (id) => {
    removeResourcesByIds([String(id)], 'Remove this resource?');
  };

  const bulkRemoveResources = () => removeResourcesByIds(selectedResourceIds);

  return (
    <div className="lms-management resources-management">
      <h1>Resources & Submissions</h1>
      <p className="lms-management-lead">
        Manage assignments, course materials, and review student assignment and quiz submissions by course.
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
          <div className="lms-list-toolbar">
            <h3>Assignments list</h3>
            <label className="lms-field-label lms-list-toolbar__filter">
              <span>View by course</span>
              <select
                value={assignListCourseFilter}
                onChange={(e) => {
                  setAssignListCourseFilter(e.target.value);
                  setSelectedAssignmentIds(new Set());
                }}
              >
                <option value="">Select course</option>
                <option value="all">All courses</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!assignListCourseFilter ? (
            <p className="lms-empty">Select a course or choose &quot;All courses&quot; to view assignments.</p>
          ) : (
            <>
              {selectedAssignmentIds.size > 0 ? (
                <div className="lms-resources-bulk-bar">
                  <span>{selectedAssignmentIds.size} selected</span>
                  <div className="lms-form-actions">
                    <button type="button" className="lms-btn-secondary" onClick={() => setSelectedAssignmentIds(new Set())}>
                      Clear
                    </button>
                    <button
                      type="button"
                      className="lms-btn-danger"
                      onClick={bulkRemoveAssignments}
                      disabled={deletingAssignments}
                    >
                      {deletingAssignments ? 'Removing…' : `Delete selected (${selectedAssignmentIds.size})`}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="lms-table-wrap">
                <table className="lms-table lms-table--resources">
                  <thead>
                    <tr>
                      <th className="lms-table-check-col">
                        <input
                          type="checkbox"
                          checked={
                            assignments.length > 0 &&
                            assignments.every((a) => selectedAssignmentIds.has(String(a._id)))
                          }
                          onChange={toggleAllAssignments}
                          aria-label="Select all assignments"
                        />
                      </th>
                      <th>Title</th>
                      <th>Course</th>
                      <th>Teacher</th>
                      <th>Due</th>
                      <th>Points</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => {
                      const aid = String(a._id);
                      const selected = selectedAssignmentIds.has(aid);
                      return (
                        <tr key={a._id} className={selected ? 'lms-table-row--selected' : ''}>
                          <td className="lms-table-check-col">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleAssignmentSelect(aid)}
                              aria-label={`Select ${a.title}`}
                            />
                          </td>
                          <td>{a.title}</td>
                          <td>{a.course?.title}</td>
                          <td>{a.teacher?.name || '—'}</td>
                          <td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
                          <td>{a.maxPoints != null ? a.maxPoints : '—'}</td>
                          <td className="lms-table-actions">
                            <button type="button" className="lms-btn-secondary" onClick={() => startEditAssignment(a)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="lms-btn-danger"
                              onClick={() => removeAssignment(a._id)}
                              disabled={deletingAssignments}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!assignments.length ? <p className="lms-empty">No assignments for this selection.</p> : null}
              </div>
            </>
          )}
        </div>
      ) : tab === 'resources' ? (
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
              <button type="submit" disabled={savingResource}>
                {savingResource ? 'Saving…' : editingResourceId ? 'Save changes' : 'Add resource'}
              </button>
              {editingResourceId ? (
                <button type="button" className="lms-btn-secondary" onClick={resetResourceForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          <div className="lms-resources-library">
            <div className="lms-list-toolbar">
              <h3>Course resources</h3>
              <label className="lms-field-label lms-list-toolbar__filter">
                <span>View by course</span>
                <select
                  value={resourceListCourseFilter}
                  onChange={(e) => {
                    setResourceListCourseFilter(e.target.value);
                    setSelectedResourceIds(new Set());
                  }}
                >
                  <option value="">Select course</option>
                  <option value="all">All courses</option>
                  {courses.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!resourceListCourseFilter ? (
              <p className="lms-empty">Select a course or choose &quot;All courses&quot; to view resources.</p>
            ) : null}

            {resourceListCourseFilter && selectedResourceIds.size > 0 ? (
              <div className="lms-resources-bulk-bar">
                <span>{selectedResourceIds.size} selected</span>
                <div className="lms-form-actions">
                  <button
                    type="button"
                    className="lms-btn-secondary"
                    onClick={() => setSelectedResourceIds(new Set())}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="lms-btn-danger"
                    onClick={bulkRemoveResources}
                    disabled={deletingResources}
                  >
                    {deletingResources ? 'Removing…' : `Delete selected (${selectedResourceIds.size})`}
                  </button>
                </div>
              </div>
            ) : null}

            {resourceListCourseFilter ? (
            <div className="lms-table-wrap">
              <p className="lms-resources-library__count" style={{ padding: '0.5rem 0 0.75rem', margin: 0 }}>
                {resources.length} shown
              </p>
              <table className="lms-table lms-table--resources">
                <thead>
                  <tr>
                    <th className="lms-table-check-col">
                      <input
                        type="checkbox"
                        checked={
                          resources.length > 0 &&
                          resources.every((r) => selectedResourceIds.has(String(r._id)))
                        }
                        onChange={toggleAllResources}
                        aria-label="Select all resources"
                      />
                    </th>
                    <th>Title</th>
                    <th>Course</th>
                    <th>Type</th>
                    <th>Uploaded by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => {
                    const rid = String(r._id);
                    const selected = selectedResourceIds.has(rid);
                    return (
                      <tr key={r._id} className={selected ? 'lms-table-row--selected' : ''}>
                        <td className="lms-table-check-col">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleResourceSelect(rid)}
                            aria-label={`Select ${r.title}`}
                          />
                        </td>
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
                        <td>
                          <span className="lms-resource-type-pill">{r.type}</span>
                        </td>
                        <td>
                          {r.uploadedBy?.name || '—'}
                          {r.uploadedBy?.role ? ` (${r.uploadedBy.role})` : ''}
                        </td>
                        <td className="lms-table-actions">
                          <button type="button" className="lms-btn-secondary" onClick={() => startEditResource(r)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="lms-btn-danger"
                            onClick={() => removeResource(r._id)}
                            disabled={deletingResources}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!resources.length ? <p className="lms-empty">No resources for this selection.</p> : null}
            </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="lms-panel">
          <AdminAssignmentSubmissions />
        </div>
      )}
    </div>
  );
};

export default ResourcesManagement;
