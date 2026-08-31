import React from 'react';
import RequiredMark from '../../../shared/RequiredMark';
import FileUploadField from '../../../Portals/shared/FileUploadField';
import LmsCollapsibleFormPanel from '../../shared/LmsCollapsibleFormPanel';
import LmsTrashTabs from '../../shared/LmsTrashTabs';
import AdminSearchBox from '../../shared/AdminSearchBox';
import { QUARANTINE_LABEL, MOVE_TO_QUARANTINE_PHRASE } from '../../../../utils/adminListLabels';
import { LmsTargetSelect } from './lmsTargeting';

const ResourcesTab = ({
  resourceFormAnchorRef,
  editingResourceId,
  resourceFormExpanded,
  setResourceFormExpanded,
  saveResource,
  resourceForm,
  setResourceForm,
  courses,
  teachers,
  courseTeachers,
  savingResource,
  resetResourceForm,
  resourceListSearch,
  resourceListCourseFilter,
  setResourceListCourseFilter,
  setSelectedResourceIds,
  resourceListMode,
  setResourceListMode,
  resourceTrashCount,
  filteredResources,
  resources,
  selectedResourceIds,
  bulkResourceAction,
  deletingResources,
  bulkRestoreResources,
  toggleResourceSelect,
  restoreResource,
  setMaterialPreview,
  startEditResource,
  removeResource,
}) => {
  return (
    <div className="lms-panel">
      <div ref={resourceFormAnchorRef}>
      <LmsCollapsibleFormPanel
        title={editingResourceId ? 'Edit Resource' : 'Add Book / Resource'}
        subtitle={editingResourceId ? 'Update course material' : 'Upload PDFs, links, or notes for a course'}
        icon="fa-book"
        tone="emerald"
        expanded={resourceFormExpanded}
        onToggle={() => setResourceFormExpanded((v) => !v)}
      >
      <form className="lms-form-grid portal-form-card" onSubmit={saveResource} autoComplete="off">
        <label className="lms-field-label">
          <span>Visibility</span>
          <select
            value={resourceForm.scope}
            onChange={(e) =>
              setResourceForm({
                ...resourceForm,
                scope: e.target.value,
                teacherIds: [],
                teacherId: '',
              })
            }
          >
            <option value="teacher">Teacher slot (students with that teacher only)</option>
            <option value="course">Whole course (all enrolled students)</option>
          </select>
        </label>
        {editingResourceId ? (
          <>
            <label className="lms-field-label">
              <span>Course <RequiredMark /></span>
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
            {resourceForm.scope === 'teacher' ? (
              <label className="lms-field-label">
                <span>Teacher <RequiredMark /></span>
                <select
                  value={resourceForm.teacherId}
                  onChange={(e) => setResourceForm({ ...resourceForm, teacherId: e.target.value })}
                  required
                >
                  <option value="">Select teacher</option>
                  {(courseTeachers[String(resourceForm.courseId)] || teachers).map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : (
          <LmsTargetSelect
            courses={courses}
            teachers={teachers}
            courseTeachers={courseTeachers}
            selectedCourseIds={resourceForm.courseIds}
            selectedTeacherIds={resourceForm.teacherIds}
            onCoursesChange={(courseIds) => setResourceForm({ ...resourceForm, courseIds })}
            onTeachersChange={(teacherIds) => setResourceForm({ ...resourceForm, teacherIds })}
            previewNoun="resource"
            requireTeachers={resourceForm.scope === 'teacher'}
          />
        )}
        <label className="lms-field-label">
          <span>Title <RequiredMark /></span>
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
            onChange={(e) => {
              const type = e.target.value;
              setResourceForm({
                ...resourceForm,
                type,
                attachments: type === 'file' ? resourceForm.attachments : [],
                fileUrl: type === 'link' ? resourceForm.fileUrl : '',
              });
            }}
          >
            <option value="file">File / PDF</option>
            <option value="link">Link</option>
            <option value="note">Note</option>
          </select>
        </label>
        {resourceForm.type === 'file' ? (
          <>
            {!editingResourceId ? (
              <p className="lms-field-hint" style={{ gridColumn: '1 / -1' }}>
                Provide at least one uploaded file or external URL <RequiredMark />
              </p>
            ) : null}
            <FileUploadField
              label="Upload files or paste URL below"
              value={resourceForm.attachments}
              onChange={(attachments) => setResourceForm({ ...resourceForm, attachments })}
              multiple
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
          </>
        ) : null}
        {resourceForm.type === 'link' ? (
          <label className="lms-field-label">
            <span>Link URL{!editingResourceId ? <RequiredMark /> : null}</span>
            <input
              placeholder="https://…"
              value={resourceForm.fileUrl}
              onChange={(e) => setResourceForm({ ...resourceForm, fileUrl: e.target.value })}
              required={!editingResourceId}
              autoComplete="off"
            />
          </label>
        ) : null}
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
      </div>
      <div className="lms-resources-library">
        <div className="lms-list-toolbar">
          <h3>Course Resources</h3>
        </div>
        <div className="controls-bar lms-list-toolbar-controls">
          <AdminSearchBox
            placeholder="Search title, course, type, link…"
            value={resourceListSearch.searchTerm}
            onChange={(e) => resourceListSearch.setSearchTerm(e.target.value)}
            onEnter={() => resourceListSearch.flushSearch()}
            disabled={!resourceListCourseFilter}
          />
          <div className="filter-controls">
            <label className="lms-field-label lms-list-toolbar__filter">
              <span>View by Course</span>
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

        {resourceListCourseFilter ? (
        <div className="lms-table-wrap">
          <p className="lms-resources-library__count" style={{ padding: '0.5rem 0 0.75rem', margin: 0 }}>
            {filteredResources.length} shown
            {resourceListSearch.debouncedSearch && resources.length !== filteredResources.length
              ? ` (of ${resources.length})`
              : ''}
          </p>
          {selectedResourceIds.size > 0 ? (
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
                <i className={`fas ${resourceListMode === 'trash' ? 'fa-trash-alt' : 'fa-archive'}`} aria-hidden />
                {deletingResources
                  ? 'Working…'
                  : resourceListMode === 'trash'
                    ? `Delete forever (${selectedResourceIds.size})`
                    : `${MOVE_TO_QUARANTINE_PHRASE} (${selectedResourceIds.size})`}
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
          <table className="lms-table lms-table--resources">
            <thead>
              <tr>
                <th className="lms-table-check-col">
                  <input
                    type="checkbox"
                    checked={
                      filteredResources.length > 0 &&
                      filteredResources.every((r) => selectedResourceIds.has(String(r._id)))
                    }
                    onChange={() => {
                      if (
                        filteredResources.length > 0 &&
                        filteredResources.every((r) => selectedResourceIds.has(String(r._id)))
                      ) {
                        setSelectedResourceIds(new Set());
                      } else {
                        setSelectedResourceIds(
                          new Set(filteredResources.map((r) => String(r._id)))
                        );
                      }
                    }}
                    aria-label="Select all resources"
                  />
                </th>
                <th>Title</th>
                <th>Course</th>
                <th>Type</th>
                <th>Uploaded By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={6} className="lms-empty-cell">
                    {resources.length === 0
                      ? 'No resources for this selection.'
                      : 'No resources match your search.'}
                  </td>
                </tr>
              ) : (
              filteredResources.map((r) => {
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
                    <td>{r.title}</td>
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
                          <button
                            type="button"
                            className="lms-btn-secondary"
                            onClick={() => setMaterialPreview({ kind: 'resource', item: r })}
                          >
                            <i className="fas fa-eye" aria-hidden /> Preview
                          </button>
                          <button type="button" className="lms-btn-secondary" onClick={() => startEditResource(r)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="lms-btn-trash"
                            onClick={() => removeResource(r._id)}
                            disabled={deletingResources}
                          >
                            <i className="fas fa-archive" aria-hidden /> {QUARANTINE_LABEL}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
          {!resources.length ? <p className="lms-empty">No resources for this selection.</p> : null}
        </div>
        ) : null}
      </div>
    </div>
  );
};

export default ResourcesTab;
