import React, { useEffect, useMemo, useRef, useState } from 'react';
import { portalGet, portalPost, portalPatch } from '../shared/portalApi';
import FileUploadField from '../shared/FileUploadField';
import { PortalLoading, PortalPageHeader } from '../shared/PortalUi';
import { absFileUrl } from '../../../utils/fileUrl';
import { portalDocId } from '../../../utils/portalDocId';
import './TeacherResources.scss';

const EMPTY_RESOURCE = {
  title: '',
  courseId: '',
  fileUrl: '',
  type: 'file',
  description: '',
};

function typeIcon(type) {
  if (type === 'link') return 'fa-link';
  if (type === 'note') return 'fa-sticky-note';
  return 'fa-file-pdf';
}

const TeacherResources = () => {
  const [courses, setCourses] = useState([]);
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
  const savingRef = useRef(false);

  const reload = () =>
    Promise.all([portalGet('/teacher/courses'), portalGet('/teacher/resources')]).then(([c, r]) => {
      if (c.success) setCourses(c.courses || []);
      if (r.success) setResources(r.resources || []);
    });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [msg]);

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
    if (resourceForm.type === 'file' && !resourceForm.fileUrl?.trim()) {
      setMsg('Upload a file for this resource.');
      savingRef.current = false;
      setSaving(false);
      return;
    }
    try {
      if (editingResourceId) {
        const id = portalDocId(editingResourceId);
        if (!id) {
          setMsg('Cannot save: open Edit from the resource list first.');
          savingRef.current = false;
          setSaving(false);
          return;
        }
        await portalPatch(`/teacher/resources/${id}`, resourceForm);
        setMsg('Resource updated.');
      } else {
        await portalPost('/teacher/resources', resourceForm);
        setMsg('Resource added.');
      }
      resetResourceForm();
      await reload();
    } catch (err) {
      setMsg(err.message || 'Failed');
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
      fileUrl: r.fileUrl || '',
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
    if (!window.confirm(label)) return;

    setDeleting(true);
    setMsg('');
    try {
      const res = await portalPost('/teacher/resources/bulk-delete', { ids: idList });
      const removed = res.deletedCount ?? idList.length;
      setMsg(`Removed ${removed} resource${removed !== 1 ? 's' : ''}.`);
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
      setMsg(err.message || 'Delete failed');
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
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  if (!courses.length) {
    return (
      <div className="portal-page teacher-resources">
        <PortalPageHeader
          title="Course resources"
          subtitle="No courses assigned yet. Ask admin to set your account as instructor on a course."
        />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-resources">
      <PortalPageHeader
        title="Course resources"
        subtitle="Upload files, add links, or post notes. Select multiple items to delete at once."
      />

      <div className="teacher-resources__layout">
        {showForm ? (
        <aside className="teacher-resources__form-panel">
          <div className="teacher-resources__form-head">
            <div className="teacher-resources__form-icon" aria-hidden="true">
              <i className="fas fa-cloud-upload-alt" />
            </div>
            <div>
              <h2>{editingResourceId ? 'Edit resource' : 'Add resource'}</h2>
              <p>
                {editingResourceId
                  ? 'Update the title, course, type, or content below.'
                  : 'Upload a file, paste a link, or add a note for active students.'}
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
              <span>Title</span>
              <input
                value={resourceForm.title}
                onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
                placeholder="e.g. Week 3 workbook"
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
                label="Upload file (PDF, Word, image)"
                value={resourceForm.fileUrl}
                onChange={(url) => setResourceForm({ ...resourceForm, fileUrl: url })}
              />
            ) : null}
            {resourceForm.type === 'link' ? (
              <label className="portal-field-label">
                <span>Link URL</span>
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
                  <span>Note content</span>
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
            <h2>Your library</h2>
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
              <table className="teacher-resources__list portal-table">
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
                    <th>Type</th>
                    <th>File</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.map((r) => {
                    const id = portalDocId(r);
                    const selected = id && selectedIds.has(id);
                    const fileHref = r.fileUrl ? absFileUrl(r.fileUrl) : null;
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
                          />
                        </td>
                        <td className="teacher-resources__list-title">
                          <span className={`teacher-resources__type-icon teacher-resources__type-icon--${r.type || 'file'}`}>
                            <i className={`fas ${typeIcon(r.type)}`} aria-hidden="true" />
                          </span>
                          {r.title}
                        </td>
                        <td>{r.course?.title || '—'}</td>
                        <td>
                          <span className="teacher-resources__tag teacher-resources__tag--type">
                            {r.type || 'file'}
                          </span>
                        </td>
                        <td>
                          {fileHref ? (
                            <a href={fileHref} target="_blank" rel="noreferrer">
                              {r.type === 'link' ? 'Open link' : 'Open file'}
                            </a>
                          ) : r.type === 'note' && r.description ? (
                            <span className="teacher-resources__note-preview" title={r.description}>
                              {r.description.length > 48 ? `${r.description.slice(0, 48)}…` : r.description}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div className="portal-table-actions">
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
    </div>
  );
};

export default TeacherResources;
