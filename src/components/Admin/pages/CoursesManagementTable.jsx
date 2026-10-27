import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import {
    COLUMN_DEFS,
    getCourseDisplayOrder,
    formatCourseDueDate,
} from './coursesManagementShared';

export function CoursesManagementTable({ state }) {
  const {
    academyDueDate,
    columnWidths,
    courseHasDuplicateDisplayOrder,
    courses,
    deleteCourse,
    filterStatus,
    formatCourseTeachersColumn,
    handleManualRefresh,
    handleSort,
    isTableDragging,
    listTab,
    onTableDragScroll,
    openCreateForm,
    openEditForm,
    permanentDeleteCourse,
    resetColumnWidth,
    restoreCourse,
    selectedCourses,
    setCourseStatus,
    sortBy,
    sortOrder,
    sortedCourses,
    startColumnResize,
    startTableDragScroll,
    stopTableDragScroll,
    tableContainerRef,
    toggleAllCourses,
    toggleCourseSelection,
    toggleStatus,
    trashBusy,
  } = state;

  return (
    <>
            <div
                ref={tableContainerRef}
                className={`courses-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="courses-table">
                    <colgroup>
                        {COLUMN_DEFS.map((key, idx) => (
                            <col
                                key={key}
                                style={
                                    key === 'actions'
                                        ? { width: '1%' }
                                        : { width: `${columnWidths[idx]}px` }
                                }
                            />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    type="checkbox"
                                    checked={selectedCourses.length === sortedCourses.length && sortedCourses.length > 0}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        toggleAllCourses();
                                    }}
                                />
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 0)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(0);
                                    }}
                                    role="separator"
                                    aria-label="Resize checkbox column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('title')}>
                                Title
                                {sortBy === 'title' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'title' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 1)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(1);
                                    }}
                                    role="separator"
                                    aria-label="Resize Title column"
                                />
                            </th>
                            <th>
                                Description
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 2)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(2);
                                    }}
                                    role="separator"
                                    aria-label="Resize Description column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('category')}>
                                Category
                                {sortBy === 'category' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'category' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 3)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(3);
                                    }}
                                    role="separator"
                                    aria-label="Resize Category column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('instructor')}>
                                Teachers
                                {sortBy === 'instructor' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'instructor' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 4)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(4);
                                    }}
                                    role="separator"
                                    aria-label="Resize Teachers column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('students')}>
                                Students
                                {sortBy === 'students' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'students' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 5)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(5);
                                    }}
                                    role="separator"
                                    aria-label="Resize Students column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('price')}>
                                Price
                                {sortBy === 'price' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'price' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 6)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(6);
                                    }}
                                    role="separator"
                                    aria-label="Resize Price column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>
                                Status
                                {sortBy === 'status' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'status' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 7)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(7);
                                    }}
                                    role="separator"
                                    aria-label="Resize Status column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('duration')}>
                                Duration
                                {sortBy === 'duration' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'duration' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 8)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(8);
                                    }}
                                    role="separator"
                                    aria-label="Resize Duration column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('level')}>
                                Level
                                {sortBy === 'level' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'level' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 9)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(9);
                                    }}
                                    role="separator"
                                    aria-label="Resize Level column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('created')}>
                                Created
                                {sortBy === 'created' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'created' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 10)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(10);
                                    }}
                                    role="separator"
                                    aria-label="Resize Created column"
                                />
                            </th>
                            <th className="action-col">
                                Actions
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 11)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(11);
                                    }}
                                    role="separator"
                                    aria-label="Resize Actions column"
                                />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedCourses.map((course) => {
                            const courseId = course._id || course.id;
                            return (
                                <tr key={courseId} className={[
                                    selectedCourses.includes(courseId) ? 'selected' : '',
                                    courseHasDuplicateDisplayOrder(course) ? 'duplicate-display-order' : '',
                                ].filter(Boolean).join(' ')}>
                                    <td className="checkbox-cell">
                                        <input
                                            type="checkbox"
                                            checked={selectedCourses.includes(courseId)}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                toggleCourseSelection(courseId);
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <div className="course-title-cell">
                                            <strong>{course.title}</strong>
                                            <small style={{ display: 'block', opacity: 0.8 }}>
                                                #{getCourseDisplayOrder(course)}
                                                {courseHasDuplicateDisplayOrder(course) ? ' (duplicate)' : ''}
                                                {' '}•{' '}
                                                {course.masonryColumn ? `Column ${course.masonryColumn}` : 'Column auto'}
                                            </small>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="course-description-cell" title={course.description}>
                                            {course.description ? (course.description.length > 60 ? `${course.description.slice(0, 60)}…` : course.description) : '—'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="category-badge">{course.category}</span>
                                    </td>
                                    <td>{formatCourseTeachersColumn(course)}</td>
                                    <td>
                                        <div className="student-count">
                                            <i className="fas fa-users"></i>
                                            {course.students ?? 0}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="price-tag">
                                            €{course.price ?? 0}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="status-cell">
                                            <span className={`status-badge ${course.status}`}>
                                                {course.status
                                                    ? course.status.charAt(0).toUpperCase() + course.status.slice(1)
                                                    : 'Draft'}
                                            </span>
                                            {listTab === 'active' ? (
                                                <select
                                                    className="status-select-inline"
                                                    value={course.status === 'published' ? 'published' : 'draft'}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        setCourseStatus(courseId, e.target.value);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Change status"
                                                >
                                                    <option value="published">Published</option>
                                                    <option value="draft">Draft</option>
                                                </select>
                                            ) : null}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="duration-badge">
                                            {course.duration || '—'}
                                        </span>
                                        {course.feeDueDate ? (
                                            <small style={{ display: 'block', opacity: 0.8 }}>
                                                Due {formatCourseDueDate(course.feeDueDate)}
                                            </small>
                                        ) : academyDueDate ? (
                                            <small style={{ display: 'block', opacity: 0.8 }}>
                                                Due {formatCourseDueDate(academyDueDate)}
                                            </small>
                                        ) : null}
                                        {course.totalFeeCount ? (
                                            <small style={{ display: 'block', opacity: 0.8 }}>
                                                {course.totalFeeCount} fees
                                            </small>
                                        ) : null}
                                    </td>
                                    <td>
                                        <span className="level-badge">
                                            {course.level ? String(course.level).charAt(0).toUpperCase() + String(course.level).slice(1) : '—'}
                                        </span>
                                    </td>
                                    <td>
                                        {course.createdAt ? new Date(course.createdAt).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="action-col cell-actions">
                                        <div className="action-buttons action-buttons--stacked">
                                            {listTab === 'trash' ? (
                                                <div className="action-buttons__row">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            restoreCourse(courseId);
                                                        }}
                                                        className="action-btn restore-btn"
                                                        title="Restore course"
                                                        disabled={trashBusy}
                                                    >
                                                        <i className="fas fa-undo"></i> Restore
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            permanentDeleteCourse(courseId);
                                                        }}
                                                        className="action-btn delete-btn"
                                                        title="Delete Permanently"
                                                        disabled={trashBusy}
                                                    >
                                                        <i className="fas fa-times-circle"></i> Delete forever
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="action-buttons__row">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const segment = course.slug || courseId;
                                                                window.open(`/courses/${segment}?preview=1`, '_blank', 'noopener,noreferrer');
                                                            }}
                                                            className="action-btn view-btn"
                                                            title="Preview course page"
                                                        >
                                                            <i className="fas fa-external-link-alt"></i> Preview
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openEditForm(course);
                                                            }}
                                                            className="action-btn edit-btn"
                                                            title="Edit Course"
                                                        >
                                                            <i className="fas fa-edit"></i> Edit
                                                        </button>
                                                    </div>
                                                    <div className="action-buttons__row">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleStatus(courseId, course.status);
                                                            }}
                                                            className={`action-btn status-btn ${course.status}`}
                                                            title={course.status === 'published' ? 'Set to Draft' : 'Publish'}
                                                        >
                                                            <i className={`fas fa-${course.status === 'published' ? 'eye-slash' : 'eye'}`}></i>
                                                            {course.status === 'published' ? ' Unpublish' : ' Publish'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteCourse(courseId);
                                                            }}
                                                            className="action-btn delete-btn"
                                                            title={`Move to ${QUARANTINE_LABEL}`}
                                                        >
                                                            <i className="fas fa-trash"></i> Delete
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {sortedCourses.length === 0 && (
                    <div className="no-results">
                        <div className="no-results-inner">
                            <div className="no-results-icon">
                                <i className="fas fa-book-open"></i>
                            </div>
                            <h3>
                                {courses.length === 0
                                    ? 'No courses loaded'
                                    : filterStatus === 'published'
                                        ? 'No published courses'
                                        : filterStatus === 'draft'
                                            ? 'No draft courses'
                                            : 'No courses found'}
                            </h3>
                            <p>
                                {courses.length === 0
                                    ? 'Check that the backend is running and you are logged in, then refresh.'
                                    : filterStatus !== 'all'
                                        ? 'Try "All Status" or create a course and set its status to Published.'
                                        : 'Try a different search term or create your first course to get started.'}
                            </p>
                            {courses.length === 0 ? (
                                <button type="button" className="refresh-btn" onClick={handleManualRefresh} title="Refresh" aria-label="Refresh">
                                    <i className="fas fa-sync-alt"></i>
                                </button>
                            ) : (
                                <button type="button" className="btn-primary btn-add no-results-cta" onClick={openCreateForm}>
                                    <i className="fas fa-plus"></i> Create Your First Course
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
    </>
  );
}
