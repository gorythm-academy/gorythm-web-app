import RequiredMark from '../../shared/RequiredMark';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { portalGet, portalPost, portalPatch } from '../shared/portalApi';
import { hasLmsUploadValue, resolveLmsUploadList } from '../../../utils/fileUploadApi';
import FileUploadField from '../shared/FileUploadField';
import { PortalDataSection, PortalAlert, PortalPageHeader, PortalActivityBanner } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import { formatScheduleLabel, formatScheduleTimeLabel } from '../../../utils/formatScheduleLabel';
import LmsMaterialPreviewModal from '../../Admin/shared/LmsMaterialPreviewModal';
import { markPortalPageVisited, TEACHER_SEEN_ADMIN_RESOURCES } from '../../../utils/portalNewItems';
import {
  dismissActivityNotices,
  filterDismissedActivityNotices,
} from '../../../utils/portalAssignmentNotices';
import { collectAdminResourceEditNotices } from '../../../utils/adminEditNotices';
import { usePortalDialog } from '../shared/PortalDialogContext';
import '../../Admin/pages/LmsManagement.scss';
import './TeacherResources.scss';

const EMPTY_RESOURCE = {
  title: '',
  courseId: '',
  scheduleIds: [],
  scheduleId: '',
  fileUrl: '',
  attachments: [],
  type: 'file',
  description: '',
};

function resourceTypeLabel(type) {
  if (type === 'link') return 'Link';
  if (type === 'note') return 'Note';
  return 'File';
}

const isAdminLockedResource = (r) => !!(r?.lockedForTeacher || r?.createdByRole === 'admin');
const SEEN_ACTIVITY_KEY = 'teacher_resources_activity';

const TeacherResources = () => {
  const { showAlert, showConfirm } = usePortalDialog();
  const [courses, setCourses] = useState([]);
  const [teacherSchedules, setTeacherSchedules] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [resourceForm, setResourceForm] = useState(EMPTY_RESOURCE);
  const [editingResourceId, setEditingResourceId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [courseFilter, setCourseFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [previewResource, setPreviewResource] = useState(null);
  const savingRef = useRef(false);

  const [loadError, setLoadError] = useState('');
  const [activityDismissTick, setActivityDismissTick] = useState(0);

  const reload = () =>
    Promise.all([
      portalGet('/teacher/courses'),
      portalGet('/teacher/schedule'),
      portalGet('/teacher/resources'),
    ])
      .then(([c, sch, r]) => {
        if (c.success) setCourses(c.courses || []);
        else setLoadError(c.error || 'Failed to load courses');
        if (sch.success) setTeacherSchedules(sch.schedules || []);
        else setLoadError((prev) => prev || sch.error || 'Failed to load class slots');
        if (r.success) setResources(r.resources || []);
        else setLoadError((prev) => prev || r.error || 'Failed to load resources');
      })
      .catch((err) => setLoadError(err.message || 'Failed to load resources'));

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => markPortalPageVisited(TEACHER_SEEN_ADMIN_RESOURCES);
  }, []);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const courseScheduleOptions = useMemo(() => {
    if (!resourceForm.courseId) return [];
    return teacherSchedules.filter(
      (slot) => String(slot.course?._id || slot.course) === String(resourceForm.courseId)
    );
  }, [teacherSchedules, resourceForm.courseId]);

  const filteredResources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (courseFilter && String(r.course?._id || r.course) !== courseFilter) return false;
      if (!q) return true;
      const title = (r.title || '').toLowerCase();
      const courseTitle = (r.course?.title || '').toLowerCase();
      return title.includes(q) || courseTitle.includes(q);
    });
  }, [resources, courseFilter, search]);

  const visibleIds = useMemo(
    () => filteredResources.map((r) => portalDocId(r)).filter(Boolean),
    [filteredResources]
  );

  const adminEditNotices = useMemo(
    () => collectAdminResourceEditNotices(filteredResources),
    [filteredResources]
  );

  const visibleAdminEditNotices = useMemo(
    () => {
      void activityDismissTick;
      return filterDismissedActivityNotices(SEEN_ACTIVITY_KEY, adminEditNotices);
    },
    [adminEditNotices, activityDismissTick]
  );

  const dismissAdminEditBanner = () => {
    dismissActivityNotices(
      SEEN_ACTIVITY_KEY,
      visibleAdminEditNotices.map((row) => `${row.id}-${row.message}`)
    );
    setActivityDismissTick((n) => n + 1);
  };

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id) => {
    if (!id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const saveResource = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMsg('');
    if (resourceForm.type === 'file' && !hasLmsUploadValue(resourceForm.attachments)) {
      await showAlert({ type: 'error', message: 'Choose at least one file for this resource.' });
      savingRef.current = false;
      setSaving(false);
      return;
    }
    if (editingResourceId) {
      if (!resourceForm.scheduleId) {
        await showAlert({ type: 'error', message: 'Select a class slot.' });
        savingRef.current = false;
        setSaving(false);
        return;
      }
    } else if (!resourceForm.scheduleIds.length) {
      await showAlert({ type: 'error', message: 'Select at least one class slot.' });
      savingRef.current = false;
      setSaving(false);
      return;
    }
    try {
      let fileUrl = resourceForm.fileUrl;
      let attachments;
      if (resourceForm.type === 'file') {
        attachments = await resolveLmsUploadList(resourceForm.attachments, 'content/books');
        fileUrl = attachments[0] || '';
      }
      const payload = {
        title: resourceForm.title,
        courseId: resourceForm.courseId,
        type: resourceForm.type,
        description: resourceForm.description,
        fileUrl,
        attachments,
        ...(editingResourceId
          ? { scheduleId: resourceForm.scheduleId }
          : { scheduleIds: resourceForm.scheduleIds }),
      };
      if (editingResourceId) {
        const id = portalDocId(editingResourceId);
        if (!id) {
          await showAlert({ type: 'error', message: 'Cannot save: open Edit from the resource list first.' });
          savingRef.current = false;
          setSaving(false);
          return;
        }
        await portalPatch(`/teacher/resources/${id}`, payload);
        await showAlert({ type: 'success', message: 'Resource updated.' });
      } else {
        const result = await portalPost('/teacher/resources', payload);
        const n = result.createdCount || 1;
        await showAlert({
          type: 'success',
          message: `${n} resource${n === 1 ? '' : 's'} added. Visible only to students on the selected class slot${n === 1 ? '' : 's'}.`,
        });
      }
      resetResourceForm();
      await reload();
    } catch (err) {
      await showAlert({ type: 'error', message: err.message || 'Failed' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const resetResourceForm = () => {
    setEditingResourceId(null);
    setResourceForm(EMPTY_RESOURCE);
    setShowForm(false);
  };

  const startEditResource = (r) => {
    const id = portalDocId(r);
    setEditingResourceId(id);
    setResourceForm({
      title: r.title || '',
      courseId: String(r.course?._id || r.course || ''),
      scheduleIds: [],
      scheduleId: String(r.assignedSchedule?._id || r.assignedSchedule || ''),
      fileUrl: r.fileUrl || '',
      attachments: r.attachments?.length ? [...r.attachments] : r.fileUrl ? [r.fileUrl] : [],
      type: r.type || 'file',
      description: r.description || '',
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteByIds = async (ids, { confirmMessage } = {}) => {
    const idList = [...ids].filter(Boolean);
    if (!idList.length) return;
    const label =
      confirmMessage ||
      `Delete ${idList.length} selected resource${idList.length > 1 ? 's' : ''}? This cannot be undone.`;
    const ok = await showConfirm({ title: 'Delete resources?', message: label, confirmLabel: 'Delete' });
    if (!ok) return;

    setDeleting(true);
    setMsg('');
    try {
      const res = await portalPost('/teacher/resources/bulk-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      await showAlert({ type: 'success', message: `Removed ${removed} resource${removed !== 1 ? 's' : ''}.` });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idList.forEach((id) => next.delete(id));
        return next;
      });
      if (editingResourceId && idList.includes(portalDocId(editingResourceId))) {
        resetResourceForm();
      }
      await reload();
    } catch (err) {
      await showAlert({ type: 'error', message: err.message || 'Delete failed' });
    } finally {
      setDeleting(false);
    }
  };

  const deleteOne = (r) => {
    const id = portalDocId(r);
    if (!id) return;
    deleteByIds([id], { confirmMessage: `Remove "${r.title}"? This cannot be undone.` });
  };

  const bulkDelete = () => deleteByIds(selectedIds);

  if (loading) {
    return (
      <div className="portal-page teacher-resources">
        <PortalPageHeader
          title="Course Resources"
          subtitle="Upload files, add links, or post notes. Select multiple items to delete at once."
        />
        <PortalDataSection loading loadingLabel="Loading resources…" />
      </div>
    );
  }

  if (!courses.length) {
    return (
      <div className="portal-page teacher-resources">
        {loadError ? <PortalAlert type="error">{loadError}</PortalAlert> : null}
        <PortalPageHeader
          title="Course Resources"
          subtitle={loadError
            ? 'Could not load your courses. Refresh the page or try again later.'
            : 'No courses are assigned to your account yet. Please contact the academy.'}
        />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-resources">
      <PortalPageHeader
          title="Course Resources"
        subtitle="Upload files, add links, or post notes. Select multiple items to delete at once."
      />

      <PortalActivityBanner
        title="Admin updates"
        rows={visibleAdminEditNotices}
        onDismiss={dismissAdminEditBanner}
      />

      {loadError ? <PortalAlert type="error">{loadError}</PortalAlert> : null}

      <div className="teacher-resources__layout">
        {showForm ? (
        <aside className="teacher-resources__form-panel">
          <div className="teacher-resources__form-head">
            <div className="teacher-resources__form-icon" aria-hidden="true">
              <i className="fas fa-cloud-upload-alt" />
            </div>
            <div>
              <h2>{editingResourceId ? 'Edit Resource' : 'Add Resource'}</h2>
              <p>
                {editingResourceId
                  ? 'Update the title, course, class slot, type, or content below.'
                  : 'Choose class slots. One copy is added for each selected slot.'}
              </p>
            </div>
            <button
              type="button"
              className="teacher-resources__form-close"
              onClick={resetResourceForm}
              aria-label="Close resource form"
            >
              <i className="fas fa-times" />
            </button>
          </div>
          <form onSubmit={saveResource} autoComplete="off">
            <label className="portal-field-label">
              <span>Title <RequiredMark /></span>
              <input
                value={resourceForm.title}
                onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                placeholder="e.g. Week 3 workbook"
                required
              />
            </label>
            <label className="portal-field-label">
              <span>Course <RequiredMark /></span>
              <select
                value={resourceForm.courseId}
                onChange={(e) =>
                  setResourceForm({
                    ...resourceForm,
                    courseId: e.target.value,
                    scheduleIds: [],
                    scheduleId: '',
                  })
                }
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
            {editingResourceId ? (
              <label className="portal-field-label">
                <span>Class slot <RequiredMark /></span>
                <select
                  value={resourceForm.scheduleId}
                  onChange={(e) => setResourceForm({ ...resourceForm, scheduleId: e.target.value })}
                  required
                >
                  <option value="">Select class slot</option>
                  {courseScheduleOptions.map((slot) => (
                    <option key={slot._id} value={slot._id}>
                      {formatScheduleLabel(slot)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="teacher-resources__slot-select">
                <div className="teacher-resources__slot-head">
                  <span>Class slots <RequiredMark /></span>
                  {courseScheduleOptions.length ? (
                    <label className="teacher-resources__slot-all">
                      <input
                        type="checkbox"
                        checked={
                          courseScheduleOptions.length > 0 &&
                          courseScheduleOptions.every((slot) =>
                            resourceForm.scheduleIds.includes(String(slot._id))
                          )
                        }
                        onChange={() => {
                          const allIds = courseScheduleOptions.map((slot) => String(slot._id));
                          const allSelected =
                            allIds.length > 0 && allIds.every((id) => resourceForm.scheduleIds.includes(id));
                          setResourceForm({ ...resourceForm, scheduleIds: allSelected ? [] : allIds });
                        }}
                      />
                      <span>Select all</span>
                    </label>
                  ) : null}
                </div>
                {resourceForm.courseId && courseScheduleOptions.length ? (
                  <div className="teacher-resources__slot-grid">
                    {courseScheduleOptions.map((slot) => {
                      const id = String(slot._id);
                      return (
                        <label key={id} className="teacher-resources__slot-item">
                          <input
                            type="checkbox"
                            checked={resourceForm.scheduleIds.includes(id)}
                            onChange={() =>
                              setResourceForm({
                                ...resourceForm,
                                scheduleIds: resourceForm.scheduleIds.includes(id)
                                  ? resourceForm.scheduleIds.filter((rowId) => rowId !== id)
                                  : [...resourceForm.scheduleIds, id],
                              })
                            }
                          />
                          <span>{formatScheduleLabel(slot)}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="teacher-resources__slot-hint">
                    {resourceForm.courseId
                      ? 'No class times are listed for this course yet. Please contact the academy.'
                      : 'Select a course to choose class times.'}
                  </p>
                )}
              </div>
            )}
            <label className="portal-field-label">
              <span>Type</span>
              <select
                value={resourceForm.type}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setResourceForm((prev) => ({
                    ...prev,
                    type: nextType,
                    fileUrl: '',
                    attachments: [],
                    description: nextType === 'note' ? prev.description : prev.type === 'note' ? '' : prev.description,
                  }));
                }}
              >
                <option value="file">File / PDF</option>
                <option value="link">Link</option>
                <option value="note">Note</option>
              </select>
            </label>
            {resourceForm.type === 'file' ? (
              <FileUploadField
                label={<>Upload file (PDF, Word, image) <RequiredMark /></>}
                value={resourceForm.attachments}
                onChange={(attachments) => setResourceForm({ ...resourceForm, attachments })}
                category="content/books"
                multiple
              />
            ) : null}
            {resourceForm.type === 'link' ? (
              <label className="portal-field-label">
                <span>Link URL <RequiredMark /></span>
                <input
                  type="url"
                  placeholder="https://example.com/resource"
                  value={resourceForm.fileUrl}
                  onChange={(e) => setResourceForm({ ...resourceForm, fileUrl: e.target.value })}
                  required
                  autoComplete="off"
                />
              </label>
            ) : null}
            {resourceForm.type === 'note' ? (
              <>
                <label className="portal-field-label">
                  <span>Note content <RequiredMark /></span>
                  <textarea
                    rows={4}
                    placeholder="Write the note students will read"
                    value={resourceForm.description}
                    onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                    required
                  />
                </label>
                <label className="portal-field-label">
                  <span>Optional attachment URL</span>
                  <input
                    type="url"
                    placeholder="https://… (optional)"
                    value={resourceForm.fileUrl}
                    onChange={(e) => setResourceForm({ ...resourceForm, fileUrl: e.target.value })}
                    autoComplete="off"
                  />
                </label>
              </>
            ) : null}
            {resourceForm.type !== 'note' ? (
              <label className="portal-field-label">
                <span>Description (optional)</span>
                <textarea
                  rows={2}
                  placeholder="Short description for students"
                  value={resourceForm.description}
                  onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })}
                />
              </label>
            ) : null}
            <div className="portal-table-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingResourceId ? 'Save changes' : 'Add resource'}
              </button>
              <button
                type="button"
                className="teacher-resources__btn teacher-resources__btn--ghost"
                onClick={resetResourceForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </aside>
        ) : null}

        <section className="teacher-resources__library" aria-label="Resource library">
          <div className="teacher-resources__library-head">
            <h2>Your Library</h2>
            <div className="teacher-resources__library-actions">
              <span className="teacher-resources__count">
                {filteredResources.length} of {resources.length} shown
              </span>
              {!showForm ? (
                <button
                  type="button"
                  className="teacher-resources__make-btn"
                  onClick={() => setShowForm(true)}
                >
                  <i className="fas fa-plus" aria-hidden="true" /> Add resource
                </button>
              ) : null}
            </div>
          </div>

          <div className="teacher-resources__toolbar">
            <div className="teacher-resources__search">
              <input
                type="search"
                placeholder="Search by title or course…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search resources"
              />
            </div>
            <div className="teacher-resources__filter">
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                aria-label="Filter by course"
              >
                <option value="">All courses</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedIds.size > 0 ? (
            <div className="teacher-resources__bulk-bar" role="status">
              <span>
                {selectedIds.size} selected
              </span>
              <div className="portal-table-actions">
                <button
                  type="button"
                  className="teacher-resources__btn teacher-resources__btn--ghost"
                  onClick={clearSelection}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="teacher-resources__btn teacher-resources__btn--danger"
                  onClick={bulkDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : `Delete selected (${selectedIds.size})`}
                </button>
              </div>
            </div>
          ) : null}

          {filteredResources.length === 0 ? (
            <div className="teacher-resources__empty">
              <i className="fas fa-folder-open" aria-hidden="true" />
              <p>
                {resources.length === 0
                  ? 'No resources yet. Click “Add resource” to upload your first file.'
                  : 'No resources match your search or filter.'}
              </p>
            </div>
          ) : (
            <div className="teacher-resources__list-wrap">
              <table className="teacher-resources__list portal-data-table portal-content-resources-table">
                <thead>
                  <tr>
                    <th className="teacher-resources__list-check">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        aria-label="Select all visible resources"
                      />
                    </th>
                    <th>Title</th>
                    <th>Course</th>
                    <th>Class slot</th>
                    <th>Type</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.map((r) => {
                    const id = portalDocId(r);
                    const selected = id && selectedIds.has(id);
                    const locked = isAdminLockedResource(r);
                    return (
                      <tr
                        key={id || r.title}
                        className={selected ? 'teacher-resources__list-row--selected' : ''}
                      >
                        <td className="teacher-resources__list-check">
                          <input
                            type="checkbox"
                            checked={Boolean(selected)}
                            onChange={() => toggleSelect(id)}
                            aria-label={`Select ${r.title}`}
                            disabled={locked}
                          />
                        </td>
                        <td className="teacher-resources__list-title">
                          {r.title}
                          {locked ? (
                            <span className="teacher-resources__admin-tag" title="Published by admin">
                              Admin
                            </span>
                          ) : null}
                        </td>
                        <td>{r.course?.title || '—'}</td>
                        <td>{r.assignedSchedule ? formatScheduleTimeLabel(r.assignedSchedule) : '—'}</td>
                        <td>{resourceTypeLabel(r.type)}</td>
                        <td>
                          <div className="portal-table-actions">
                            <button
                              type="button"
                              className="lms-btn-secondary lms-btn-secondary--compact"
                              onClick={() => setPreviewResource(r)}
                            >
                              <i className="fas fa-eye" aria-hidden /> Preview
                            </button>
                            {locked ? (
                              <span className="teacher-resources__view-only">View only</span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="teacher-resources__btn teacher-resources__btn--ghost teacher-resources__btn--small"
                                  onClick={() => startEditResource(r)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="teacher-resources__btn teacher-resources__btn--danger teacher-resources__btn--small"
                                  onClick={() => deleteOne(r)}
                                  disabled={deleting}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {msg ? (
        <div className="teacher-resources__toast" role="status">
          {msg}
        </div>
      ) : null}

      <LmsMaterialPreviewModal
        open={Boolean(previewResource)}
        kind="resource"
        item={previewResource}
        onClose={() => setPreviewResource(null)}
        tone="teacher"
      />
    </div>
  );
};

export default TeacherResources;
