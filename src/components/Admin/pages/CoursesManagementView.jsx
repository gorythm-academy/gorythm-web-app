import RequiredMark from '../../shared/RequiredMark';
import { slugifyCourseTitle } from '../../../utils/courseLinks';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import AdminMediaGallery from '../shared/AdminMediaGallery';
import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { COLUMN_DEFS, formatCourseDueDate, getCourseDisplayOrder } from './coursesManagementShared';

export function CoursesManagementView({ state }) {
  const {
    academyDueDate,
    activeTeachers,
    brokenGalleryCount,
    closeCourseForm,
    columnWidths,
    courseHasDuplicateDisplayOrder,
    courses,
    deleteCourse,
    deleteSelectedCourses,
    duplicateDisplayOrderCount,
    editingCourse,
    filterStatus,
    formData,
    formatCourseTeachersColumn,
    galleryImages,
    galleryLoading,
    handleDeleteGalleryImage,
    handleFormChange,
    handleFormSubmit,
    handleManualRefresh,
    handleSort,
    isFormOpen,
    isSubmitting,
    isTableDragging,
    listTab,
    onCourseImageFile,
    onTableDragScroll,
    openCreateForm,
    openEditForm,
    permanentDeleteCourse,
    permanentDeleteSelectedCourses,
    renumberCoursesByDisplayOrder,
    resetColumnWidth,
    restoreCourse,
    restoreSelectedCourses,
    searchTerm,
    selectGalleryImage,
    selectedCourses,
    setCourseStatus,
    setFilterStatus,
    setFormData,
    setListTab,
    setSearchTerm,
    setSelectedCourses,
    setTeacherSearch,
    showAlert,
    sortBy,
    sortOrder,
    sortedCourses,
    startColumnResize,
    startTableDragScroll,
    stopTableDragScroll,
    tableContainerRef,
    teacherSearch,
    teachersLoading,
    toast,
    toggleAllCourses,
    toggleCourseSelection,
    toggleInstructorId,
    toggleSelectedStatus,
    toggleStatus,
    totalUniqueStudents,
    trashBusy,
    trashCount,
    uploadingImage,
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
                        <h3>${courses.reduce((sum, course) => sum + (course.price || 0), 0).toFixed(2)}</h3>
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

            {isFormOpen && (
                <div
                    className="course-modal-overlay"
                    role="dialog"
                    aria-modal="true"
                    aria-label={editingCourse ? 'Edit course' : 'Add course'}
                >
                    <div className="course-modal">
                        <header className="course-modal__header">
                            <div className="course-modal__identity">
                                <h2>
                                    <i className={`fas ${editingCourse ? 'fa-edit' : 'fa-plus-circle'}`} aria-hidden />
                                    {editingCourse ? 'Edit Course' : 'Add New Course'}
                                </h2>
                                {editingCourse ? (
                                    <p>
                                        <span className="course-modal__sid">{editingCourse.title}</span>
                                    </p>
                                ) : (
                                    <p>Create a published or draft course for the academy catalog.</p>
                                )}
                            </div>
                            <div className="course-modal__header-actions">
                                <button
                                    type="button"
                                    className="btn-secondary course-modal__close-icon"
                                    onClick={closeCourseForm}
                                    aria-label="Close"
                                    title="Close"
                                >
                                    <i className="fas fa-times" aria-hidden />
                                </button>
                            </div>
                        </header>
                        <form onSubmit={handleFormSubmit} className="course-form course-modal__form">
                        <div className="course-modal__body course-form-card">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Title <RequiredMark /></label>
                                <input
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleFormChange}
                                    required
                                    placeholder="e.g., Quranic Arabic for Beginners"
                                />
                            </div>
                            <div className="form-group">
                                <label>URL slug</label>
                                <input
                                    type="text"
                                    name="slug"
                                    value={formData.slug}
                                    onChange={handleFormChange}
                                    placeholder="url-friendly-slug"
                                />
                                <span className="form-field-hint">Public URL: /courses/{formData.slug || slugifyCourseTitle(formData.title) || '…'}</span>
                            </div>
                            <div className="form-group">
                                <label>Category <RequiredMark /></label>
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="Quranic Arabic">Quranic Arabic</option>
                                    <option value="Tajweed">Tajweed</option>
                                    <option value="Islamic Studies">Islamic Studies</option>
                                    <option value="STEM">STEM</option>
                                    <option value="Memorization (Hifz)">Memorization (Hifz)</option>
                                    <option value="Fiqh">Fiqh</option>
                                    <option value="Hadith">Hadith</option>
                                    <option value="Seerah">Seerah</option>
                                    <option value="Aqeedah">Aqeedah</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="form-group form-group-full">
                                <label>Assigned teachers (optional)</label>
                                {formData.status === 'published' ? (
                                    <input
                                        type="search"
                                        className="course-teachers-search"
                                        placeholder="Search teachers by name or email…"
                                        value={teacherSearch}
                                        onChange={(e) => setTeacherSearch(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                ) : null}
                                <div className="course-teachers-assign-list">
                                    {formData.status !== 'published' ? (
                                        <p className="form-field-hint">
                                            Publish the course to assign teachers. Draft and unpublished courses cannot have teachers.
                                        </p>
                                    ) : teachersLoading ? (
                                        <p className="form-field-hint">Loading teachers…</p>
                                    ) : activeTeachers.length === 0 ? (
                                        <p className="form-field-hint">No active teachers match. Try a different search.</p>
                                    ) : (
                                        activeTeachers.map((t) => (
                                            <label key={t._id} className="checkbox-label course-teachers-assign-item">
                                                <input
                                                    type="checkbox"
                                                    checked={(formData.instructorIds || []).includes(String(t._id))}
                                                    onChange={() => toggleInstructorId(t._id)}
                                                    disabled={isSubmitting}
                                                />
                                                <span>
                                                    {t.name} (<span className="admin-email">{t.email}</span>)
                                                </span>
                                            </label>
                                        ))
                                    )}
                                </div>
                                <span className="form-field-hint">
                                    Only on published courses. Same list as the Teachers tab.
                                </span>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group form-group-full">
                                <label>Description <RequiredMark /></label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleFormChange}
                                    rows="3"
                                    placeholder="Describe what students will learn in this course. Shown on homepage, All Courses, and Single Course."
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Price ($) <RequiredMark /></label>
                                <input
                                    type="number"
                                    name="price"
                                    value={formData.price}
                                    min="0"
                                    step="0.01"
                                    onChange={handleFormChange}
                                    required
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleFormChange}
                                >
                                    <option value="published">Published</option>
                                    <option value="draft">Draft</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Duration <RequiredMark /></label>
                                <input
                                    type="text"
                                    name="duration"
                                    value={formData.duration}
                                    onChange={handleFormChange}
                                    placeholder="e.g., 8 weeks, Self-paced"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Fee due date</label>
                                <input
                                    type="date"
                                    name="feeDueDate"
                                    value={formData.feeDueDate || ''}
                                    onChange={handleFormChange}
                                />
                                <small className="form-hint">Applies to every student on this course until Payments saves a new default.</small>
                            </div>
                            <div className="form-group">
                                <label>Total number of fees</label>
                                <input
                                    type="number"
                                    name="totalFeeCount"
                                    min="1"
                                    step="1"
                                    value={formData.totalFeeCount || ''}
                                    onChange={handleFormChange}
                                    placeholder="e.g. 6"
                                />
                                    <small className="form-hint">Admin only. Saved on this course and copied to its students. Student and parent Fees pages show X of Y.</small>
                            </div>
                            <div className="form-group">
                                <label>Level</label>
                                <select
                                    name="level"
                                    value={formData.level}
                                    onChange={handleFormChange}
                                >
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Display order</label>
                                <input
                                    type="number"
                                    name="displayOrder"
                                    value={formData.displayOrder}
                                    onChange={handleFormChange}
                                    min="0"
                                    step="1"
                                    placeholder="0 = first (blank = last)"
                                />
                            </div>
                            <div className="form-group">
                                <label>Masonry column</label>
                                <select
                                    name="masonryColumn"
                                    value={formData.masonryColumn}
                                    onChange={handleFormChange}
                                >
                                    <option value="">Auto</option>
                                    <option value="1">Left</option>
                                    <option value="2">Middle</option>
                                    <option value="3">Right (desktop)</option>
                                </select>
                                <span className="form-field-hint">Right column maps to the 2nd column on tablet/mobile layouts.</span>
                            </div>
                        </div>
                        <div className="course-image-section">
                            <div className="course-image-section__header">
                                <label>Course image</label>
                                <span className="course-image-section__hint">
                                    Upload a new image or pick one from the gallery
                                </span>
                            </div>
                            <div className="course-image-section__preview-row">
                                <div className="course-image-section__preview">
                                    {formData.homepageImage ? (
                                        <img
                                            src={resolveMediaUrl(formData.homepageImage)}
                                            alt="Selected course"
                                        />
                                    ) : (
                                        <div className="course-image-section__preview-empty">
                                            <i className="fas fa-image" aria-hidden="true" />
                                            <span>No image selected</span>
                                        </div>
                                    )}
                                    {formData.homepageImage && (
                                        <button
                                            type="button"
                                            className="course-image-section__clear"
                                            onClick={() => setFormData((prev) => ({ ...prev, homepageImage: '' }))}
                                            title="Clear selection"
                                        >
                                            <i className="fas fa-times" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                                <div className="course-image-section__upload">
                                    <label className="course-image-section__upload-btn">
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
                                            onChange={onCourseImageFile}
                                            disabled={uploadingImage}
                                        />
                                        <i className={`fas ${uploadingImage ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`} aria-hidden="true" />
                                        {uploadingImage ? 'Uploading…' : 'Upload image'}
                                    </label>
                                    <span className="course-image-section__upload-note">
                                        JPEG, PNG, WebP, or AVIF · large images are resized automatically
                                    </span>
                                </div>
                            </div>
                            <div className="course-image-section__gallery-head">
                                <span>Image Gallery</span>
                                {galleryLoading && (
                                    <span className="course-image-section__gallery-loading">
                                        <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading…
                                    </span>
                                )}
                            </div>
                            {brokenGalleryCount > 0 ? (
                                <p className="promo-thumb-gallery__warning" role="status">
                                    <i className="fas fa-exclamation-triangle" aria-hidden="true" />
                                    <strong>
                                        {brokenGalleryCount} image file{brokenGalleryCount === 1 ? '' : 's'} missing on
                                        disk
                                    </strong>
                                    — re-upload and save the course to fix.
                                </p>
                            ) : null}
                            <AdminMediaGallery
                                images={galleryImages}
                                loading={galleryLoading}
                                selectedPath={formData.homepageImage}
                                onSelect={selectGalleryImage}
                                onDelete={handleDeleteGalleryImage}
                                showFilename={false}
                                emptyMessage="No images yet. Upload one above — it will appear here for all courses."
                            />
                        </div>
                        </div>
                        <div className="form-actions">
                            <button 
                                type="submit" 
                                className={`btn-primary${editingCourse ? ' btn-save' : ' btn-add'}`}
                                disabled={isSubmitting || uploadingImage}
                            >
                                {isSubmitting ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i> {editingCourse ? 'Updating...' : 'Creating...'}
                                    </>
                                ) : (
                                    <>
                                        <i className={editingCourse ? 'fas fa-save' : 'fas fa-plus'}></i> {editingCourse ? 'Update Course' : 'Create Course'}
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={closeCourseForm}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                    </div>
                </div>
            )}

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
                                            ${course.price ?? 0}
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
