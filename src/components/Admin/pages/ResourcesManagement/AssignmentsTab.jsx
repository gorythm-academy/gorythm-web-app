import React from 'react';
import RequiredMark from '../../../shared/RequiredMark';
import FileUploadField from '../../../Portals/shared/FileUploadField';
import LmsCollapsibleFormPanel from '../../shared/LmsCollapsibleFormPanel';
import LmsTrashTabs from '../../shared/LmsTrashTabs';
import AdminSearchBox from '../../shared/AdminSearchBox';
import { QUARANTINE_LABEL, MOVE_TO_QUARANTINE_PHRASE } from '../../../../utils/adminListLabels';
import { LmsTargetSelect, minDueDateValue } from './lmsTargeting';

const AssignmentsTab = ({
  assignFormAnchorRef,
  editingAssignId,
  assignFormExpanded,
  setAssignFormExpanded,
  saveAssignment,
  assignForm,
  setAssignForm,
  onCourseChangeAssign,
  courses,
  teachers,
  courseTeachers,
  savingAssignment,
  resetAssignForm,
  assignmentListSearch,
  assignListCourseFilter,
  setAssignListCourseFilter,
  setSelectedAssignmentIds,
  assignListMode,
  setAssignListMode,
  assignTrashCount,
  selectedAssignmentIds,
  bulkAssignmentAction,
  deletingAssignments,
  bulkRestoreAssignments,
  filteredAssignments,
  assignments,
  toggleAssignmentSelect,
  restoreAssignment,
  setMaterialPreview,
  startEditAssignment,
  removeAssignment,
}) => {
  return (
    <div className="lms-panel">
      <div ref={assignFormAnchorRef}>
      <LmsCollapsibleFormPanel
        title={editingAssignId ? 'Edit Assignment' : 'Add Assignment'}
        subtitle={editingAssignId ? 'Update assignment details' : 'Publish homework for teachers and students'}
        icon="fa-tasks"
        tone="indigo"
        expanded={assignFormExpanded}
        onToggle={() => setAssignFormExpanded((v) => !v)}
      >
      <form className="lms-form-grid portal-form-card" onSubmit={saveAssignment} autoComplete="off">
        {editingAssignId ? (
          <>
            <label className="lms-field-label">
              <span>Course <RequiredMark /></span>
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
              <span>Teacher <RequiredMark /></span>
              <select
                value={assignForm.teacherId}
                onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}
                required
              >
                <option value="">Select teacher</option>
                {(courseTeachers[String(assignForm.courseId)] || teachers).map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <LmsTargetSelect
            courses={courses}
            teachers={teachers}
            courseTeachers={courseTeachers}
            selectedCourseIds={assignForm.courseIds}
            selectedTeacherIds={assignForm.teacherIds}
            onCoursesChange={(courseIds) => setAssignForm({ ...assignForm, courseIds })}
            onTeachersChange={(teacherIds) => setAssignForm({ ...assignForm, teacherIds })}
            previewNoun="assignment"
          />
        )}
        <label className="lms-field-label">
          <span>Title <RequiredMark /></span>
          <input
            value={assignForm.title}
            onChange={(e) => setAssignForm({ ...assignForm, title: e.target.value })}
            placeholder="Title shown to teachers and students"
            required
            autoComplete="off"
          />
        </label>
        <label className="lms-field-label">
          <span>Due date <RequiredMark /></span>
          <input
            type="date"
            value={assignForm.dueDate}
            min={minDueDateValue()}
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
          label="Attachments (PDF / files)"
          value={assignForm.attachments}
          onChange={(attachments) => setAssignForm({ ...assignForm, attachments })}
          multiple
        />
        <div className="lms-form-actions">
          <button type="submit" disabled={savingAssignment}>
            {savingAssignment
              ? editingAssignId
                ? 'Saving…'
                : 'Publishing…'
              : editingAssignId
                ? 'Save changes'
                : 'Publish assignment'}
          </button>
          {editingAssignId ? (
            <button type="button" className="lms-btn-secondary" onClick={resetAssignForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      </LmsCollapsibleFormPanel>
      </div>
      <div className="lms-list-toolbar">
        <h3>Assignments List</h3>
      </div>
      <div className="controls-bar lms-list-toolbar-controls">
        <AdminSearchBox
          placeholder="Search title, course, teacher…"
          value={assignmentListSearch.searchTerm}
          onChange={(e) => assignmentListSearch.setSearchTerm(e.target.value)}
          onEnter={() => assignmentListSearch.flushSearch()}
          disabled={!assignListCourseFilter}
        />
        <div className="filter-controls">
          <label className="lms-field-label lms-list-toolbar__filter">
            <span>View by Course</span>
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
                  <i className={`fas ${assignListMode === 'trash' ? 'fa-trash-alt' : 'fa-archive'}`} aria-hidden />
                  {deletingAssignments
                    ? 'Working…'
                    : assignListMode === 'trash'
                      ? `Delete forever (${selectedAssignmentIds.size})`
                      : `${MOVE_TO_QUARANTINE_PHRASE} (${selectedAssignmentIds.size})`}
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
                        filteredAssignments.length > 0 &&
                        filteredAssignments.every((a) => selectedAssignmentIds.has(String(a._id)))
                      }
                      onChange={() => {
                        if (
                          filteredAssignments.length > 0 &&
                          filteredAssignments.every((a) => selectedAssignmentIds.has(String(a._id)))
                        ) {
                          setSelectedAssignmentIds(new Set());
                        } else {
                          setSelectedAssignmentIds(
                            new Set(filteredAssignments.map((a) => String(a._id)))
                          );
                        }
                      }}
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
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="lms-empty-cell">
                      {assignments.length === 0
                        ? 'No assignments for this selection.'
                        : 'No assignments match your search.'}
                    </td>
                  </tr>
                ) : (
                filteredAssignments.map((a) => {
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
                      <td>
                        {a.title}
                        {a.lockedForTeacher || a.createdByRole === 'admin' ? (
                          <span className="lms-target-badge" title="Admin-published; teacher can view and extend due date only">
                            Admin
                          </span>
                        ) : null}
                      </td>
                      <td>{a.course?.title}</td>
                      <td>{a.teacher?.name || '—'}</td>
                      <td>
                        {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}
                        {a.dueDateNotice ? (
                          <div className="lms-due-date-notice">{a.dueDateNotice}</div>
                        ) : null}
                      </td>
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
                            <button
                              type="button"
                              className="lms-btn-secondary"
                              onClick={() => setMaterialPreview({ kind: 'assignment', item: a })}
                            >
                              <i className="fas fa-eye" aria-hidden /> Preview
                            </button>
                            <button type="button" className="lms-btn-secondary" onClick={() => startEditAssignment(a)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="lms-btn-trash"
                              onClick={() => removeAssignment(a._id)}
                              disabled={deletingAssignments}
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
          </div>
        </>
      )}
    </div>
  );
};

export default AssignmentsTab;
