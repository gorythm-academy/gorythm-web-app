import { CoursesManagementFormModal } from './CoursesManagementFormModal';
import { CoursesManagementTable } from './CoursesManagementTable';
import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { formatCourseDueDate } from './coursesManagementShared';

export function CoursesManagementView({ state }) {
  const {
    academyDueDate,
    courses,
    deleteSelectedCourses,
    duplicateDisplayOrderCount,
    filterStatus,
    handleManualRefresh,
    listTab,
    openCreateForm,
    openEditForm,
    permanentDeleteSelectedCourses,
    renumberCoursesByDisplayOrder,
    restoreSelectedCourses,
    searchTerm,
    selectedCourses,
    setFilterStatus,
    setListTab,
    setSearchTerm,
    setSelectedCourses,
    showAlert,
    toast,
    toggleSelectedStatus,
    totalUniqueStudents,
    trashBusy,
    trashCount,
  } = state;

  return (
    <div className="courses-management">
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-book"></i> Course Management</h1>
                    <p>Create, edit, and manage academy courses</p>
                </div>
                <div className="header-right">
                    {listTab === 'active' ? (
                        <button type="button" className="btn-primary btn-add" onClick={openCreateForm}>
                            <i className="fas fa-plus"></i> Add Course
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="page-stats">
                <div className="stat-card">
                    <div className="stat-icon total">
                        <i className="fas fa-book"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{courses.length}</h3>
                        <p>Total Courses</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon published">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{courses.filter(c => c.status === 'published').length}</h3>
                        <p>Published</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon students">
                        <i className="fas fa-users"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{totalUniqueStudents}</h3>
                        <p>Total Students</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon revenue">
                        <i className="fas fa-dollar-sign"></i>
                    </div>
                    <div className="stat-info">
                        <h3>€{courses.reduce((sum, course) => sum + (course.price || 0), 0).toFixed(2)}</h3>
                        <p>Catalog list price</p>
                    </div>
                </div>
            </div>

            {listTab === 'active' && academyDueDate ? (
                <p className="form-hint" style={{ margin: '0 0 1rem' }}>
                    Academy default due date: {formatCourseDueDate(academyDueDate)}. Shown to admin, students, and parents — not on the public website. Set a course date below if this course should differ.
                </p>
            ) : null}

            <div className="students-list-tabs courses-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('active');
                        setSelectedCourses([]);
                    }}
                >
                    <i className="fas fa-list" /> Active courses
                </button>
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('trash');
                        setSelectedCourses([]);
                    }}
                >
                    <i className="fas fa-archive" /> {QUARANTINE_LABEL}
                    {trashCount > 0 ? ` (${trashCount})` : ''}
                </button>
            </div>

            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search courses by title, category, or instructor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="filter-controls">
                    {listTab === 'active' ? (
                        <select 
                            className="status-filter"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="all">All Status</option>
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                        </select>
                    ) : null}
                    
                    <button className="refresh-btn" onClick={handleManualRefresh} type="button" title="Refresh" aria-label="Refresh">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                    {listTab === 'active' && duplicateDisplayOrderCount > 0 ? (
                        <button
                            type="button"
                            className="courses-renumber-btn"
                            onClick={renumberCoursesByDisplayOrder}
                            disabled={trashBusy}
                        >
                            <i className="fas fa-sort-numeric-down" aria-hidden="true"></i>
                            <span>Renumber</span>
                        </button>
                    ) : null}
                </div>
            </div>

            {listTab === 'active' && duplicateDisplayOrderCount > 0 ? (
                <div className="courses-order-warning" role="status">
                    <i className="fas fa-exclamation-triangle" aria-hidden="true" />
                    <span>
                        <strong>{duplicateDisplayOrderCount} courses share a display order.</strong>
                        {' '}Ties sort by category, then title. Use unique numbers or click Renumber.
                    </span>
                </div>
            ) : null}

            <CoursesManagementFormModal state={state} />

            {selectedCourses.length > 0 && (
                <div className="bulk-actions-bar">
                    <div className="selected-count">
                        <i className="fas fa-check-circle"></i>
                        {selectedCourses.length} course(s) selected
                    </div>
                    <div className="bulk-buttons">
                        {listTab === 'active' ? (
                            <>
                                <button className="bulk-btn" onClick={toggleSelectedStatus}>
                                    <i className="fas fa-eye"></i> Set Status
                                </button>
                                <button className="bulk-btn delete" onClick={deleteSelectedCourses}>
                                    <i className="fas fa-archive"></i> Move to {QUARANTINE_LABEL}
                                </button>
                            </>
                        ) : (
                            <>
                                <button className="bulk-btn" onClick={restoreSelectedCourses} disabled={trashBusy}>
                                    <i className="fas fa-undo"></i> Restore selected
                                </button>
                                <button className="bulk-btn delete" onClick={permanentDeleteSelectedCourses} disabled={trashBusy}>
                                    <i className="fas fa-trash-alt"></i> Delete forever
                                </button>
                            </>
                        )}
                        <button
                            className="bulk-btn edit"
                            onClick={() => {
                                if (selectedCourses.length !== 1) {
                                    showAlert('Please select only one course to edit', 'warning');
                                    return;
                                }
                                const course = courses.find((c) => String(c._id || c.id) === String(selectedCourses[0]));
                                if (!course) {
                                    showAlert('Selected course not found', 'warning');
                                    return;
                                }
                                openEditForm(course);
                            }}
                        >
                            <i className="fas fa-edit"></i> Edit Selected
                        </button>
                        <button
                            className="bulk-btn cancel"
                            onClick={() => {
                                setSelectedCourses([]);
                            }}
                        >
                            <i className="fas fa-times"></i> Clear Selection
                        </button>
                    </div>
                </div>
            )}

            <CoursesManagementTable state={state} />

            {toast.show && (
                <div className={`admin-toast admin-toast--${toast.type}`} role="status" aria-live="polite">
                    <div className="admin-toast-inner">
                        <div className="admin-toast-icon">
                            <i className={`fas fa-${toast.type === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
                        </div>
                        <p className="admin-toast-message">{toast.message}</p>
                    </div>
                </div>
            )}
        </div>
  );
}
