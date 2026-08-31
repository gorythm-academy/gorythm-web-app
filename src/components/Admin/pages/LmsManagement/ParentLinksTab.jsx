import React from 'react';
import RequiredMark from '../../../shared/RequiredMark';
import AdminSearchBox from '../../shared/AdminSearchBox';
import LmsPanelLoading from './LmsPanelLoading';
import { PARENT_RELATION_OPTIONS } from './lmsHelpers';

const ParentLinksTab = ({
  panelId,
  addLink,
  linkForm,
  setLinkForm,
  pickersLoading,
  parents,
  students,
  parentLinkListSearch,
  filteredParentLinks,
  linksLoading,
  links,
  pagedParentLinks,
  editingLinkId,
  editLinkForm,
  setEditLinkForm,
  editLinkSaving,
  saveEditLink,
  cancelEditLink,
  startEditLink,
  removeLink,
  formatRelationLabel,
  parentLinksTotalPages,
  parentLinksPage,
  setParentLinksPage,
}) => (
  <section
    className="lms-panel"
    role="tabpanel"
    id={panelId}
    aria-labelledby="lms-tab-parent-links"
  >
    <form className="lms-form" onSubmit={addLink}>
      <h2>Link Parent to Student</h2>
      <p className="lms-form-hint">
        One parent per student. A parent can be linked to multiple students.
      </p>
      <label className="lms-field-label">
        <span>Parent <RequiredMark /></span>
        <select
          value={linkForm.parentId}
          onChange={(e) => setLinkForm({ ...linkForm, parentId: e.target.value })}
          required
          disabled={pickersLoading}
        >
          <option value="">
            {pickersLoading
              ? 'Loading parents…'
              : parents.length
                ? 'Select parent…'
                : 'No parents found'}
          </option>
          {parents.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="lms-field-label">
        <span>Student <RequiredMark /></span>
        <select
          value={linkForm.studentId}
          onChange={(e) => setLinkForm({ ...linkForm, studentId: e.target.value })}
          required
          disabled={pickersLoading}
        >
        <option value="">
          {pickersLoading
            ? 'Loading students…'
            : students.length
              ? 'Select student…'
              : 'No students found'}
        </option>
        {students.map((s) => (
          <option key={s._id} value={s._id}>
            {s.name}
          </option>
        ))}
        </select>
      </label>
      <label className="lms-field-label">
        <span>Relation</span>
        <select
          value={linkForm.relation}
          onChange={(e) => setLinkForm({ ...linkForm, relation: e.target.value })}
        >
        {PARENT_RELATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
        </select>
      </label>
      <button type="submit">Link</button>
    </form>

    <div className="controls-bar lms-parent-links-toolbar">
      <AdminSearchBox
        placeholder="Parent, student, or relation…"
        value={parentLinkListSearch.searchTerm}
        onChange={(e) => parentLinkListSearch.setSearchTerm(e.target.value)}
        onEnter={() => parentLinkListSearch.flushSearch()}
      />
      <div className="filter-controls">
        <span className="lms-parent-links-count">
          {filteredParentLinks.length} link{filteredParentLinks.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>

    {linksLoading ? (
      <LmsPanelLoading label="Loading parent links…" />
    ) : filteredParentLinks.length === 0 ? (
      <div className="lms-parent-links-empty">
        <p>{links.length === 0 ? 'No parent–student links yet.' : 'No links match your search.'}</p>
      </div>
    ) : (
      <>
        <div className="lms-schedule-table-wrap">
          <table className="lms-schedule-table lms-parent-links-table">
            <thead>
              <tr>
                <th>Parent</th>
                <th>Student</th>
                <th>Relation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedParentLinks.map((l) => {
                const isEditing = String(editingLinkId) === String(l._id);
                return (
                  <tr key={l._id} className={isEditing ? 'is-editing' : undefined}>
                    <td>
                      {isEditing ? (
                        <select
                          className="lms-parent-links-table__select"
                          value={editLinkForm.parentId}
                          onChange={(e) =>
                            setEditLinkForm((prev) => ({
                              ...prev,
                              parentId: e.target.value,
                            }))
                          }
                          disabled={editLinkSaving}
                        >
                          <option value="">Select parent…</option>
                          {parents.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="lms-schedule-course">{l.parent?.name || '—'}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          className="lms-parent-links-table__select"
                          value={editLinkForm.studentId}
                          onChange={(e) =>
                            setEditLinkForm((prev) => ({
                              ...prev,
                              studentId: e.target.value,
                            }))
                          }
                          disabled={editLinkSaving}
                        >
                          <option value="">Select student…</option>
                          {students.map((s) => (
                            <option key={s._id} value={s._id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="lms-schedule-course">{l.student?.name || '—'}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          className="lms-parent-links-table__select"
                          value={editLinkForm.relation}
                          onChange={(e) =>
                            setEditLinkForm((prev) => ({
                              ...prev,
                              relation: e.target.value,
                            }))
                          }
                          disabled={editLinkSaving}
                        >
                          {PARENT_RELATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="lms-schedule-day-badge">
                          {formatRelationLabel(l.relation)}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="lms-list-actions">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              className="lms-schedule-action lms-schedule-action--edit"
                              title="Save"
                              aria-label="Save link"
                              disabled={editLinkSaving}
                              onClick={() => saveEditLink(l._id)}
                            >
                              <i className="fas fa-check" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="lms-schedule-action"
                              title="Cancel"
                              aria-label="Cancel edit"
                              disabled={editLinkSaving}
                              onClick={cancelEditLink}
                            >
                              <i className="fas fa-times" aria-hidden />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="lms-schedule-action lms-schedule-action--edit"
                              title="Edit link"
                              aria-label="Edit link"
                              onClick={() => startEditLink(l)}
                            >
                              <i className="fas fa-pen" aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="lms-schedule-action lms-schedule-action--delete"
                              title="Remove"
                              aria-label="Remove link"
                              onClick={() => removeLink(l._id)}
                            >
                              <i className="fas fa-trash" aria-hidden />
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
        {parentLinksTotalPages > 1 ? (
          <div className="lms-parent-links-pagination">
            <button
              type="button"
              disabled={parentLinksPage <= 1}
              onClick={() => setParentLinksPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>
              Page {parentLinksPage} of {parentLinksTotalPages}
            </span>
            <button
              type="button"
              disabled={parentLinksPage >= parentLinksTotalPages}
              onClick={() => setParentLinksPage((p) => Math.min(parentLinksTotalPages, p + 1))}
            >
              Next
            </button>
          </div>
        ) : null}
      </>
    )}
  </section>
);

export default ParentLinksTab;
