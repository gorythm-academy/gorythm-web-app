import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import FileUploadField from '../../Portals/shared/FileUploadField';
import { AUTH_REALM } from '../../../utils/authStorage';
import AdminAssignmentSubmissions from './AdminAssignmentSubmissions';
import AdminResearchTab from './AdminResearchTab';
import ResearchComments from './ResearchComments';
import LmsTrashTabs from '../shared/LmsTrashTabs';
import LmsCollapsibleFormPanel from '../shared/LmsCollapsibleFormPanel';
import './LmsManagement.scss';

const TABS = [
  { id: 'assignments', label: 'Assignments' },
  { id: 'resources', label: 'Books & resources' },
  { id: 'research', label: 'Research' },
  { id: 'submissions', label: 'Student submissions' },
];

const EMPTY_ASSIGNMENT = {
  courseId: '',
  teacherId: '',
  title: '',
  description: '',
  dueDate: '',
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
  const [searchParams] = useSearchParams();
  const initialTab =
    defaultTab === 'submissions' || location.pathname.endsWith('/submissions')
      ? 'submissions'
      : defaultTab === 'research' || location.pathname.endsWith('/research')
        ? 'research'
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
  const [assignListMode, setAssignListMode] = useState('active');
  const [resourceListMode, setResourceListMode] = useState('active');
  const [assignTrashCount, setAssignTrashCount] = useState(0);
  const [resourceTrashCount, setResourceTrashCount] = useState(0);
  const [assignFormExpanded, setAssignFormExpanded] = useState(true);
  const [resourceFormExpanded, setResourceFormExpanded] = useState(true);
  const [researchSubTab, setResearchSubTab] = useState('articles');

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
      const trashQ = assignListMode === 'trash' ? (path.includes('?') ? '&trash=1' : '?trash=1') : '';
      const res = await lmsAdminGet(`${path}${trashQ}`);
      if (res.success) {
        setAssignments(res.assignments || []);
        if (typeof res.trashCount === 'number') setAssignTrashCount(res.trashCount);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [assignListCourseFilter, assignListMode, showAlert]);

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
      const trashQ = resourceListMode === 'trash' ? (path.includes('?') ? '&trash=1' : '?trash=1') : '';
      const res = await lmsAdminGet(`${path}${trashQ}`);
      if (res.success) {
        setResources(res.resources || []);
        if (typeof res.trashCount === 'number') setResourceTrashCount(res.trashCount);
        if (res.courses?.length) setCourses(res.courses);
      }
    } catch (err) {
      showAlert(err.message, 'error');
    }
  }, [resourceListCourseFilter, resourceListMode, showAlert]);

  useEffect(() => {
    const nextTab =
      defaultTab === 'submissions' || location.pathname.endsWith('/submissions')
        ? 'submissions'
        : defaultTab === 'research' || location.pathname.endsWith('/research')
          ? 'research'
          : defaultTab === 'resources' || location.pathname.endsWith('/resources')
            ? 'resources'
            : 'assignments';
    setTab(nextTab);
  }, [defaultTab, location.pathname]);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    const section = searchParams.get('section');
    if (urlTab === 'research') setTab('research');
    else if (urlTab === 'resources') setTab('resources');
    else if (urlTab === 'submissions') setTab('submissions');
    else if (urlTab === 'assignments') setTab('assignments');
    if (section === 'comments') setResearchSubTab('comments');
    else if (section === 'articles') setResearchSubTab('articles');
  }, [searchParams]);

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
    setAssignFormExpanded(true);
    setEditingAssignId(a._id);
    setAssignForm({
      courseId: String(a.course?._id || a.course || ''),
      teacherId: String(a.teacher?._id || a.teacher || ''),
      title: a.title || '',
      description: a.description || '',
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : '',
      fileUrl: (a.attachments && a.attachments[0]) || '',
    });
  };

  const startEditResource = (r) => {
    setResourceFormExpanded(true);
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

  const trashAssignmentsByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText ||
        `Move ${idList.length} assignment${idList.length > 1 ? 's' : ''} to trash? Student submissions are moved to trash too.`
    );
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      const res = await lmsAdminPost('/assignments/bulk-delete', { ids: idList });
      const moved = res.deletedCount ?? idList.length;
      showAlert(`${moved} assignment${moved !== 1 ? 's' : ''} moved to trash.`, 'success');
      setSelectedAssignmentIds(new Set());
      if (editingAssignId && idList.includes(String(editingAssignId))) resetAssignForm();
      await loadAssignments();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const restoreAssignmentsByIds = async (ids) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(`Restore ${idList.length} assignment${idList.length > 1 ? 's' : ''}?`);
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      const res = await lmsAdminPost('/assignments/bulk-restore', { ids: idList });
      const restored = res.restoredCount ?? idList.length;
      showAlert(`${restored} assignment${restored !== 1 ? 's' : ''} restored.`, 'success');
      setSelectedAssignmentIds(new Set());
      await loadAssignments();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const permanentDeleteAssignmentsByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText ||
        `Permanently delete ${idList.length} assignment${idList.length > 1 ? 's' : ''}? This cannot be undone.`
    );
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      const res = await lmsAdminPost('/assignments/bulk-permanent-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      showAlert(`${removed} assignment${removed !== 1 ? 's' : ''} deleted forever.`, 'success');
      setSelectedAssignmentIds(new Set());
      await loadAssignments();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const removeAssignment = async (id) => {
    if (assignListMode === 'trash') {
      permanentDeleteAssignmentsByIds([String(id)], 'Permanently delete this assignment?');
      return;
    }
    trashAssignmentsByIds([String(id)], 'Move this assignment to trash?');
  };

  const bulkAssignmentAction = () => {
    if (assignListMode === 'trash') {
      if (selectedAssignmentIds.size) permanentDeleteAssignmentsByIds(selectedAssignmentIds);
      return;
    }
    trashAssignmentsByIds(selectedAssignmentIds);
  };

  const bulkRestoreAssignments = () => restoreAssignmentsByIds(selectedAssignmentIds);

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

  const trashResourcesByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText || `Move ${idList.length} resource${idList.length > 1 ? 's' : ''} to trash?`
    );
    if (!ok) return;
    setDeletingResources(true);
    try {
      const res = await lmsAdminPost('/resources/bulk-delete', { ids: idList });
      const moved = res.deletedCount ?? idList.length;
      showAlert(`${moved} resource${moved !== 1 ? 's' : ''} moved to trash.`, 'success');
      setSelectedResourceIds(new Set());
      if (editingResourceId && idList.includes(String(editingResourceId))) resetResourceForm();
      await loadResources();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingResources(false);
    }
  };

  const restoreResourcesByIds = async (ids) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(`Restore ${idList.length} resource${idList.length > 1 ? 's' : ''}?`);
    if (!ok) return;
    setDeletingResources(true);
    try {
      const res = await lmsAdminPost('/resources/bulk-restore', { ids: idList });
      const restored = res.restoredCount ?? idList.length;
      showAlert(`${restored} resource${restored !== 1 ? 's' : ''} restored.`, 'success');
      setSelectedResourceIds(new Set());
      await loadResources();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingResources(false);
    }
  };

  const permanentDeleteResourcesByIds = async (ids, confirmText) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm(
      confirmText || `Permanently delete ${idList.length} resource${idList.length > 1 ? 's' : ''}?`
    );
    if (!ok) return;
    setDeletingResources(true);
    try {
      const res = await lmsAdminPost('/resources/bulk-permanent-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      showAlert(`${removed} resource${removed !== 1 ? 's' : ''} deleted forever.`, 'success');
      setSelectedResourceIds(new Set());
      await loadResources();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingResources(false);
    }
  };

  const removeResource = async (id) => {
    if (resourceListMode === 'trash') {
      permanentDeleteResourcesByIds([String(id)], 'Permanently delete this resource?');
      return;
    }
    trashResourcesByIds([String(id)], 'Move this resource to trash?');
  };

  const bulkResourceAction = () => {
    if (resourceListMode === 'trash') {
      if (selectedResourceIds.size) permanentDeleteResourcesByIds(selectedResourceIds);
      return;
    }
    trashResourcesByIds(selectedResourceIds);
  };

  const bulkRestoreResources = () => restoreResourcesByIds(selectedResourceIds);

  const restoreAssignment = async (id) => {
    restoreAssignmentsByIds([String(id)]);
  };

  const restoreResource = async (id) => {
    restoreResourcesByIds([String(id)]);
  };

  return (
    <div className="lms-management resources-management">
      <h1>Resources & Submissions</h1>
      <p className="lms-management-lead">
        Manage assignments, course materials, research articles, and review student assignment and quiz submissions by course.
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
          <LmsCollapsibleFormPanel
            title={editingAssignId ? 'Edit assignment' : 'Add Assignment'}
            subtitle={editingAssignId ? 'Update assignment details' : 'Publish homework for teachers and students'}
            icon="fa-tasks"
            tone="indigo"
            expanded={assignFormExpanded}
            onToggle={() => setAssignFormExpanded((v) => !v)}
          >
          <form className="lms-form-grid portal-form-card" onSubmit={saveAssignment} autoComplete="off">
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
              category="assignments"
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
          </LmsCollapsibleFormPanel>
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

          {assignListCourseFilter ? (
            <LmsTrashTabs
              mode={assignListMode}
              trashCount={assignTrashCount}
              onChange={(mode) => {
                setAssignListMode(mode);
                setSelectedAssignmentIds(new Set());
              }}
            />
          ) : null}

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
                      className={assignListMode === 'trash' ? 'lms-btn-delete-forever' : 'lms-btn-trash'}
                      onClick={bulkAssignmentAction}
                      disabled={deletingAssignments}
                    >
                      <i className={`fas ${assignListMode === 'trash' ? 'fa-trash-alt' : 'fa-trash'}`} aria-hidden />
                      {deletingAssignments
                        ? 'Working…'
                        : assignListMode === 'trash'
                          ? `Delete forever (${selectedAssignmentIds.size})`
                          : `Move to trash (${selectedAssignmentIds.size})`}
                    </button>
                    {assignListMode === 'trash' ? (
                      <button
                        type="button"
                        className="lms-btn-restore"
                        onClick={bulkRestoreAssignments}
                        disabled={deletingAssignments}
                      >
                        <i className="fas fa-undo" aria-hidden />
                        Restore selected
                      </button>
                    ) : null}
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
                          <td className="lms-table-actions">
                            {assignListMode === 'trash' ? (
                              <>
                                <button
                                  type="button"
                                  className="lms-btn-restore"
                                  onClick={() => restoreAssignment(a._id)}
                                  disabled={deletingAssignments}
                                >
                                  <i className="fas fa-undo" aria-hidden /> Restore
                                </button>
                                <button
                                  type="button"
                                  className="lms-btn-delete-forever"
                                  onClick={() => removeAssignment(a._id)}
                                  disabled={deletingAssignments}
                                >
                                  <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className="lms-btn-secondary" onClick={() => startEditAssignment(a)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="lms-btn-trash"
                                  onClick={() => removeAssignment(a._id)}
                                  disabled={deletingAssignments}
                                >
                                  <i className="fas fa-trash" aria-hidden /> Trash
                                </button>
                              </>
                            )}
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
      ) : tab === 'research' ? (
        <div className="lms-research-section">
          <div className="lms-research-subtabs">
            <button
              type="button"
              className={researchSubTab === 'articles' ? 'active' : ''}
              onClick={() => setResearchSubTab('articles')}
            >
              Articles
            </button>
            <button
              type="button"
              className={researchSubTab === 'comments' ? 'active' : ''}
              onClick={() => setResearchSubTab('comments')}
            >
              Comments
            </button>
          </div>
          {researchSubTab === 'comments' ? (
            <ResearchComments embedded />
          ) : (
            <AdminResearchTab />
          )}
        </div>
      ) : tab === 'resources' ? (
        <div className="lms-panel">
          <LmsCollapsibleFormPanel
            title={editingResourceId ? 'Edit resource' : 'Add Book / Resource'}
            subtitle={editingResourceId ? 'Update course material' : 'Upload PDFs, links, or notes for a course'}
            icon="fa-book"
            tone="emerald"
            expanded={resourceFormExpanded}
            onToggle={() => setResourceFormExpanded((v) => !v)}
          >
          <form className="lms-form-grid portal-form-card" onSubmit={saveResource} autoComplete="off">
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
              category="content/books"
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
          </LmsCollapsibleFormPanel>
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

            {resourceListCourseFilter ? (
              <LmsTrashTabs
                mode={resourceListMode}
                trashCount={resourceTrashCount}
                onChange={(mode) => {
                  setResourceListMode(mode);
                  setSelectedResourceIds(new Set());
                }}
              />
            ) : null}

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
                    className={resourceListMode === 'trash' ? 'lms-btn-delete-forever' : 'lms-btn-trash'}
                    onClick={bulkResourceAction}
                    disabled={deletingResources}
                  >
                    <i className={`fas ${resourceListMode === 'trash' ? 'fa-trash-alt' : 'fa-trash'}`} aria-hidden />
                    {deletingResources
                      ? 'Working…'
                      : resourceListMode === 'trash'
                        ? `Delete forever (${selectedResourceIds.size})`
                        : `Move to trash (${selectedResourceIds.size})`}
                  </button>
                  {resourceListMode === 'trash' ? (
                    <button
                      type="button"
                      className="lms-btn-restore"
                      onClick={bulkRestoreResources}
                      disabled={deletingResources}
                    >
                      <i className="fas fa-undo" aria-hidden />
                      Restore selected
                    </button>
                  ) : null}
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
                          {resourceListMode === 'trash' ? (
                            <>
                              <button
                                type="button"
                                className="lms-btn-restore"
                                onClick={() => restoreResource(r._id)}
                                disabled={deletingResources}
                              >
                                <i className="fas fa-undo" aria-hidden /> Restore
                              </button>
                              <button
                                type="button"
                                className="lms-btn-delete-forever"
                                onClick={() => removeResource(r._id)}
                                disabled={deletingResources}
                              >
                                <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="lms-btn-secondary" onClick={() => startEditResource(r)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="lms-btn-trash"
                                onClick={() => removeResource(r._id)}
                                disabled={deletingResources}
                              >
                                <i className="fas fa-trash" aria-hidden /> Trash
                              </button>
                            </>
                          )}
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
