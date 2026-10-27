import RequiredMark from '../../shared/RequiredMark';
import { slugifyCourseTitle } from '../../../utils/courseLinks';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import AdminMediaGallery from '../shared/AdminMediaGallery';

export function CoursesManagementFormModal({ state }) {
  const {
    activeTeachers,
    brokenGalleryCount,
    closeCourseForm,
    editingCourse,
    formData,
    galleryImages,
    galleryLoading,
    handleDeleteGalleryImage,
    handleFormChange,
    handleFormSubmit,
    isFormOpen,
    isSubmitting,
    onCourseImageFile,
    selectGalleryImage,
    setFormData,
    setTeacherSearch,
    teacherSearch,
    teachersLoading,
    toggleInstructorId,
    uploadingImage,
  } = state;

  return (
    <>
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
                                <label>URL Slug</label>
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
                                <label>Assigned Teachers (Optional)</label>
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
                                <label>Price (€) <RequiredMark /></label>
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
                                <label>Fee Due Date</label>
                                <input
                                    type="date"
                                    name="feeDueDate"
                                    value={formData.feeDueDate || ''}
                                    onChange={handleFormChange}
                                />
                                <small className="form-hint">Applies to every student on this course until Payments saves a new default.</small>
                            </div>
                            <div className="form-group">
                                <label>Total Number of Fees</label>
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
                                <label>Display Order</label>
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
                                <label>Masonry Column</label>
                                <select
                                    name="masonryColumn"
                                    value={formData.masonryColumn}
                                    onChange={handleFormChange}
                                >
                                    <option value="">Auto</option>
                                    <option value="1">Left</option>
                                    <option value="2">Middle</option>
                                    <option value="3">Right (Desktop)</option>
                                </select>
                                <span className="form-field-hint">Right column maps to the 2nd column on tablet/mobile layouts.</span>
                            </div>
                        </div>
                        <div className="course-image-section">
                            <div className="course-image-section__header">
                                <label>Course Image</label>
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
                                            <span>No Image Selected</span>
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
    </>
  );
}
