import RequiredMark from '../../shared/RequiredMark';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { formatLoginEmailNotice, formatLoginEmailStatus, MIN_STUDENT_PASSWORD_LENGTH } from '../../../utils/studentAdminValidation';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { formatScheduleLabel, formatScheduleTimeLabel } from '../../../utils/formatScheduleLabel';
import { Link } from 'react-router-dom';
import AdminTablePagination from '../shared/AdminTablePagination';
import AdminSearchBox from '../shared/AdminSearchBox';
import { PARENT_RELATION_OPTIONS } from './LmsManagement/lmsHelpers';
import { COLUMN_LABELS, GORYTHM_EMAIL_DOMAIN, STAFF_STATUS_OPTIONS, USER_STATUS_OPTIONS, displayRoleLabel, normalizeStaffStatus, sanitizePortalEmailLocal } from './usersManagementShared';

export function UsersManagementView({ state }) {
  const {
    addParentChildLink,
    allCourses,
    allStudentsForLink,
    assignedTeacherSlots,
    closeUserModal,
    columnWidths,
    deleteSelectedUsers,
    deleteUser,
    downloadUsersCsv,
    editingUser,
    embedded,
    fetchUsers,
    filterRole,
    flushUserSearch,
    formData,
    handleFormChange,
    handleFormSubmit,
    handleManualRefresh,
    handleSort,
    isLearnerTab,
    isRowActionsLocked,
    isStaffTab,
    isSubmitting,
    isTableDragging,
    linkRelation,
    linkStudentPick,
    listStats,
    listTab,
    loading,
    onTableDragScroll,
    openCreateModal,
    openEditModal,
    openViewModal,
    page,
    parentChildrenById,
    parentLinksInModal,
    parentStudentSearch,
    parentStudentsLoading,
    pendingParentLinks,
    permanentDeleteSelectedUsers,
    permanentDeleteUser,
    removeParentChildLink,
    removePendingParentLink,
    resetColumnWidth,
    restoreSelectedUsers,
    restoreUser,
    roleOptions,
    searchTerm,
    selectableFilteredUsers,
    selectedUsers,
    setEditingUser,
    setFilterRole,
    setIsSubmitting,
    setLinkRelation,
    setLinkStudentPick,
    setListTab,
    setPage,
    setParentStudentSearch,
    setSearchTerm,
    setSelectedUsers,
    setShowConfirmPassword,
    setShowPassword,
    setShowUserModal,
    setUsers,
    setViewUser,
    showAddButton,
    showAlert,
    showConfirmPassword,
    showPassword,
    showUserModal,
    sortBy,
    sortOrder,
    sortedUsers,
    startColumnResize,
    startTableDragScroll,
    statsByRole,
    stopTableDragScroll,
    tableColumnKeys,
    tableContainerRef,
    teacherCoursesById,
    teacherSlotsById,
    teacherSlotsLoading,
    toggleAllUsers,
    toggleAssignedCourse,
    toggleUserSelection,
    total,
    totalPages,
    trashBusy,
    trashCount,
    updateDraftLinkRelation,
    updateSelectedStatus,
    updateUserStatus,
    users,
    variant,
    variantConfig,
    viewTeacherSlots,
    viewTeacherSlotsLoading,
    viewUser,
  } = state;

  return (
    <div className="users-management">
            {/* User Form Modal */}
            {showUserModal && (
                <div className="user-modal-overlay">
                    <div className="user-modal">
                        <div className="user-modal-header">
                            <h2>
                                <i className={`fas ${editingUser ? 'fa-edit' : 'fa-user-plus'}`}></i>
                                {editingUser
                                    ? `Edit ${variantConfig.pageTitle.replace(/s$/, '')}`
                                    : variantConfig.addLabel}
                            </h2>
                            <button 
                                className="modal-close-btn"
                                onClick={closeUserModal}
                                disabled={isSubmitting}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <form onSubmit={handleFormSubmit} className="user-form">
                            <div className="form-scroll-container">
                                <div className="form-grid">
                                    {/* Basic Information */}
                                    <div className="form-section">
                                        <h3><i className="fas fa-info-circle"></i> Basic Information</h3>
                                        
                                        <div className="form-group">
                                            <label>Full Name <RequiredMark /></label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleFormChange}
                                                placeholder="Enter full name"
                                                required
                                                disabled={isSubmitting}
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Email Address <RequiredMark /></label>
                                            {!editingUser ? (
                                                <div
                                                    className={`email-input-group ${
                                                        isSubmitting ? 'is-disabled' : ''
                                                    }`}
                                                >
                                                    <input
                                                        type="text"
                                                        name="emailLocal"
                                                        className="email-input-group__local"
                                                        value={sanitizePortalEmailLocal(formData.email)}
                                                        onChange={(e) => {
                                                            const local = sanitizePortalEmailLocal(e.target.value);
                                                            handleFormChange({
                                                                target: {
                                                                    name: 'email',
                                                                    value: local ? `${local}${GORYTHM_EMAIL_DOMAIN}` : '',
                                                                },
                                                            });
                                                        }}
                                                        placeholder="id"
                                                        required
                                                        disabled={isSubmitting}
                                                        autoComplete="off"
                                                        spellCheck={false}
                                                        aria-label="Portal email ID"
                                                    />
                                                    <span
                                                        className="email-input-group__suffix"
                                                        aria-hidden="true"
                                                    >
                                                        {GORYTHM_EMAIL_DOMAIN}
                                                    </span>
                                                </div>
                                            ) : (
                                                <input
                                                    type="email"
                                                    name="email"
                                                    value={formData.email}
                                                    placeholder="user@example.com"
                                                    disabled
                                                    readOnly
                                                />
                                            )}
                                            {editingUser ? (
                                                <small className="form-hint">
                                                    Email cannot be changed for existing users
                                                </small>
                                            ) : (
                                                <small className="form-hint">
                                                    Only enter the ID — <strong>@gorythmacademy.com</strong> is added automatically.
                                                </small>
                                            )}
                                        </div>

                                        <div className="form-group">
                                            <label>Personal email (optional)</label>
                                            <input
                                                type="email"
                                                name="personalEmail"
                                                value={formData.personalEmail}
                                                onChange={handleFormChange}
                                                placeholder="Gmail, Hotmail, etc. (not portal login)"
                                                pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}"
                                                title="Use a valid lowercase email format, e.g. name@gmail.com"
                                                disabled={isSubmitting}
                                            />
                                            <small className="form-hint">
                                                Separate from portal login above; for contact only. Leave the password blank to email a one-time set-password link.
                                            </small>
                                        </div>

                                        {editingUser && ['student', 'teacher', 'parent'].includes(editingUser.role) ? (
                                            <div className="form-group">
                                                <label>Login email</label>
                                                <p className="form-hint">{formatLoginEmailStatus(editingUser)}</p>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    disabled={isSubmitting}
                                                    onClick={async () => {
                                                        setIsSubmitting(true);
                                                        try {
                                                            const token = getAuthToken();
                                                            const mailRes = await axios.post(
                                                                `${API_BASE_URL}/api/users/${editingUser._id}/login-email`,
                                                                { force: true },
                                                                { headers: { Authorization: `Bearer ${token}` } }
                                                            );
                                                            const notice = formatLoginEmailNotice(mailRes.data.loginEmail);
                                                            const next = {
                                                                ...editingUser,
                                                                ...(mailRes.data.user || {}),
                                                            };
                                                            setEditingUser(next);
                                                            setUsers((prev) => prev.map((user) => (
                                                                user._id === editingUser._id ? { ...user, ...next } : user
                                                            )));
                                                            showAlert(notice || mailRes.data.loginEmail?.error || 'Login email was not sent.', notice ? 'success' : 'warning');
                                                        } catch (mailErr) {
                                                            showAlert(mailErr.response?.data?.error || 'Failed to send login email', 'error');
                                                        } finally {
                                                            setIsSubmitting(false);
                                                        }
                                                    }}
                                                >
                                                    Resend login email
                                                </button>
                                            </div>
                                        ) : null}

                                        <div className="form-group">
                                            <label>Phone Number</label>
                                            <input
                                                type="tel"
                                                name="phone"
                                                value={formData.phone}
                                                onChange={handleFormChange}
                                                placeholder="+1 (123) 456-7890"
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                    </div>

                                    {/* Role & Status */}
                                    <div className="form-section">
                                        <h3><i className="fas fa-user-tag"></i> Role & Status</h3>
                                        
                                        <div className="form-group">
                                            <label>User Role <RequiredMark /></label>
                                            <div className="role-options">
                                                {roleOptions.map(role => (
                                                    <label key={role.value} className="role-option">
                                                        <input
                                                            type="radio"
                                                            name="role"
                                                            value={role.value}
                                                            checked={formData.role === role.value}
                                                            onChange={handleFormChange}
                                                            disabled={isSubmitting}
                                                        />
                                                        <div className="role-card">
                                                            <i className={`fas ${role.icon}`}></i>
                                                            <span>{role.label}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Status</label>
                                            <select
                                                name="status"
                                                value={formData.status}
                                                onChange={handleFormChange}
                                                disabled={isSubmitting}
                                            >
                                                {(isStaffTab ? STAFF_STATUS_OPTIONS : USER_STATUS_OPTIONS).map((status) => (
                                                    <option key={status} value={status}>
                                                        {status.charAt(0).toUpperCase() + status.slice(1)}
                                                    </option>
                                                ))}
                                            </select>
                                            <small className="form-hint">
                                                {isStaffTab ? (
                                                    <>Only <strong>active</strong> accounts can log in.</>
                                                ) : (
                                                    <>Only <strong>active</strong> accounts can log in. Pending, inactive, and completed are login-disabled.</>
                                                )}
                                            </small>
                                        </div>
                                        {!editingUser && !['student', 'teacher', 'parent'].includes(variantConfig.fixedRole || formData.role) && (
                                            <div className="form-group">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        name="mustChangePassword"
                                                        checked={formData.mustChangePassword}
                                                        onChange={handleFormChange}
                                                        disabled={isSubmitting}
                                                    />
                                                    <span>Force password reset on first login</span>
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Password Section */}
                                    <div className="form-section">
                                        <h3><i className="fas fa-lock"></i> {editingUser ? 'Change Password' : 'Set Password'}</h3>
                                        
                                        <div className="form-group">
                                            <label>Password {!editingUser && !['student', 'teacher', 'parent'].includes(variantConfig.fixedRole || formData.role) ? <RequiredMark /> : null}</label>
                                            <div className={`password-field ${isSubmitting ? 'is-disabled' : ''}`}>
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    name="password"
                                                    value={formData.password}
                                                    onChange={handleFormChange}
                                                    placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
                                                    disabled={isSubmitting}
                                                    autoComplete="new-password"
                                                />
                                                <button
                                                    type="button"
                                                    className="password-field__toggle"
                                                    onClick={() => setShowPassword((v) => !v)}
                                                    disabled={isSubmitting}
                                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                    aria-pressed={showPassword}
                                                    title={showPassword ? 'Hide password' : 'Show password'}
                                                    tabIndex={-1}
                                                >
                                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                </button>
                                            </div>
                                            <small className="form-hint">
                                                {editingUser 
                                                    ? "Enter new password only if you want to change it"
                                                    : `Minimum ${MIN_STUDENT_PASSWORD_LENGTH} characters`}
                                            </small>
                                        </div>

                                        <div className="form-group">
                                            <label>Confirm Password {!editingUser && !['student', 'teacher', 'parent'].includes(variantConfig.fixedRole || formData.role) ? <RequiredMark /> : null}</label>
                                                <div className={`password-field ${isSubmitting ? 'is-disabled' : ''}`}>
                                                    <input
                                                        type={showConfirmPassword ? 'text' : 'password'}
                                                        name="confirmPassword"
                                                        value={formData.confirmPassword}
                                                        onChange={handleFormChange}
                                                        placeholder="Confirm password"
                                                        disabled={isSubmitting}
                                                        autoComplete="new-password"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="password-field__toggle"
                                                        onClick={() => setShowConfirmPassword((v) => !v)}
                                                        disabled={isSubmitting}
                                                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                                        aria-pressed={showConfirmPassword}
                                                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                                                        tabIndex={-1}
                                                    >
                                                        <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                    </button>
                                                </div>
                                            </div>

                                        {formData.password.trim() && (editingUser || ['student', 'teacher', 'parent'].includes(variantConfig.fixedRole || formData.role)) ? (
                                            <div className="form-group">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        name="mustChangePassword"
                                                        checked={formData.mustChangePassword}
                                                        onChange={handleFormChange}
                                                        disabled={isSubmitting}
                                                    />
                                                    <span>Force password reset on first login</span>
                                                </label>
                                            </div>
                                        ) : null}
                                    </div>

                                    {variant === 'teachers' && (
                                        <div className="form-section">
                                            <h3><i className="fas fa-book"></i> Assigned Courses</h3>
                                            <p className="form-hint">
                                                Optional. Only published courses are listed. Assigning here updates the
                                                same teacher list as the Courses tab.
                                            </p>
                                            <div className="course-assign-list">
                                                {allCourses.length === 0 ? (
                                                    <p className="form-hint-muted">No published courses to assign.</p>
                                                ) : (
                                                    allCourses.map((c) => (
                                                        <label key={c._id} className="checkbox-label course-assign-item">
                                                            <input
                                                                type="checkbox"
                                                                checked={(formData.assignedCourseIds || []).includes(String(c._id))}
                                                                onChange={() => toggleAssignedCourse(c._id)}
                                                                disabled={isSubmitting}
                                                            />
                                                            <span>{c.title}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {variant === 'teachers' && editingUser && (
                                        <div className="form-section">
                                            <h3><i className="fas fa-clock"></i> Class Schedule Slots</h3>
                                            <p className="form-hint">
                                                Read-only. Create or edit slots in{' '}
                                                <Link to="/admin/lms">LMS → Class Schedules</Link>.
                                            </p>
                                            {teacherSlotsLoading ? (
                                                <p className="form-hint-muted">Loading slots…</p>
                                            ) : assignedTeacherSlots.length === 0 ? (
                                                <p className="form-hint-muted">No class slots for assigned courses yet.</p>
                                            ) : (
                                                <ul className="teacher-slots-readonly">
                                                    {assignedTeacherSlots.map((slot) => (
                                                        <li key={slot._id}>
                                                            <strong>{slot.course?.title || 'Course'}</strong>
                                                            {' — '}
                                                            {formatScheduleLabel(slot)}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}

                                    {variant === 'parents' && (
                                        <div className="form-section">
                                            <h3><i className="fas fa-child"></i> Linked Children</h3>
                                            <p className="form-hint">
                                                Changes to children and relation are saved only when you click Save Changes.
                                                Each student can have only one parent.
                                            </p>
                                            <ul className="parent-children-list">
                                                {(editingUser ? parentLinksInModal : pendingParentLinks).length === 0 ? (
                                                    <li className="form-hint-muted">No children linked yet.</li>
                                                ) : editingUser ? (
                                                    parentLinksInModal.map((link) => {
                                                        const key = String(link._id || link.studentId || link.student?._id || link.student);
                                                        return (
                                                        <li key={key}>
                                                            <span>
                                                                {link.student?.name || 'Student'}{' '}
                                                                {link.student?.studentId
                                                                    ? `(${link.student.studentId})`
                                                                    : ''}
                                                            </span>
                                                            <select
                                                                value={link.relation || 'guardian'}
                                                                onChange={(e) => updateDraftLinkRelation(key, e.target.value)}
                                                                disabled={isSubmitting}
                                                                aria-label="Relation"
                                                            >
                                                                {PARENT_RELATION_OPTIONS.map((opt) => (
                                                                    <option key={opt.value} value={opt.value}>
                                                                        {opt.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                type="button"
                                                                className="btn-secondary parent-remove-btn"
                                                                onClick={() => removeParentChildLink(key)}
                                                                disabled={isSubmitting}
                                                            >
                                                                Remove
                                                            </button>
                                                        </li>
                                                        );
                                                    })
                                                ) : (
                                                    pendingParentLinks.map((link) => (
                                                        <li key={link.studentId}>
                                                            <span>
                                                                {link.student?.name || 'Student'}{' '}
                                                                {link.student?.studentId
                                                                    ? `(${link.student.studentId})`
                                                                    : ''}
                                                            </span>
                                                            <select
                                                                value={link.relation || 'guardian'}
                                                                onChange={(e) => updateDraftLinkRelation(link.studentId, e.target.value)}
                                                                disabled={isSubmitting}
                                                                aria-label="Relation"
                                                            >
                                                                {PARENT_RELATION_OPTIONS.map((opt) => (
                                                                    <option key={opt.value} value={opt.value}>
                                                                        {opt.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                type="button"
                                                                className="btn-secondary parent-remove-btn"
                                                                onClick={() => removePendingParentLink(link.studentId)}
                                                                disabled={isSubmitting}
                                                            >
                                                                Remove
                                                            </button>
                                                        </li>
                                                    ))
                                                )}
                                            </ul>
                                            <div className="form-group parent-link-add">
                                                <label className="form-hint-muted" htmlFor="parent-student-search">
                                                    Search students
                                                </label>
                                                <input
                                                    id="parent-student-search"
                                                    type="search"
                                                    placeholder="Name, roll no., email…"
                                                    value={parentStudentSearch}
                                                    onChange={(e) => setParentStudentSearch(e.target.value)}
                                                    disabled={isSubmitting}
                                                />
                                                <select
                                                    value={linkStudentPick}
                                                    onChange={(e) => setLinkStudentPick(e.target.value)}
                                                    disabled={isSubmitting || parentStudentsLoading}
                                                >
                                                    <option value="">
                                                        {parentStudentsLoading ? 'Loading students…' : 'Add unlinked child…'}
                                                    </option>
                                                    {allStudentsForLink
                                                        .filter((s) => {
                                                            if (editingUser) {
                                                                return !parentLinksInModal.some(
                                                                    (l) =>
                                                                        String(l.student?._id || l.student || l.studentId) ===
                                                                        String(s._id)
                                                                );
                                                            }
                                                            return !pendingParentLinks.some(
                                                                (l) => String(l.studentId) === String(s._id)
                                                            );
                                                        })
                                                        .map((s) => (
                                                            <option key={s._id} value={s._id}>
                                                                {s.name} {s.studentId ? `(${s.studentId})` : ''}
                                                            </option>
                                                        ))}
                                                </select>
                                                <label className="form-hint-muted" htmlFor="parent-link-relation">
                                                    Relation
                                                </label>
                                                <select
                                                    id="parent-link-relation"
                                                    value={linkRelation}
                                                    onChange={(e) => setLinkRelation(e.target.value)}
                                                    disabled={isSubmitting}
                                                >
                                                    {PARENT_RELATION_OPTIONS.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                {!parentStudentsLoading &&
                                                allStudentsForLink.length === 0 &&
                                                parentStudentSearch.trim() ? (
                                                    <p className="form-hint-muted">
                                                        No students match. Save the parent now and link children after
                                                        students are enrolled.
                                                    </p>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    className="btn-primary btn-add lms-link-btn"
                                                    onClick={addParentChildLink}
                                                    disabled={!linkStudentPick || isSubmitting}
                                                >
                                                    <i className="fas fa-link" aria-hidden /> Link child
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-actions">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                        setShowUserModal(false);
                                        setEditingUser(null);
                                    }}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`btn-primary${editingUser ? ' btn-save' : ' btn-add'}`}
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin"></i> 
                                            {editingUser ? 'Saving...' : 'Creating...'}
                                        </>
                                    ) : (
                                        <>
                                            <i className={`fas ${editingUser ? 'fa-save' : 'fa-check'}`}></i>
                                            {editingUser ? 'Save Changes' : 'Create User'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {!embedded && (
            <div className="page-header">
                <div className="header-left">
                    <h1>
                        <i className={`fas ${isLearnerTab ? variantConfig.icon : 'fa-users-cog'}`}></i>{' '}
                        {variantConfig.pageTitle}
                    </h1>
                    <p>
                        {variant === 'teachers' ? (
                            <>Teachers can be created without courses. Assign courses here or from the Courses tab — same list.</>
                        ) : variant === 'parents' ? (
                            <>Parent/guardian accounts (link children in the Parent Links tab).</>
                        ) : (
                            <>Managers, super-admins, and accountants. Learners are under <strong>Students</strong>, <strong>Teachers</strong>, and <strong>Parents</strong>.</>
                        )}
                    </p>
                </div>
                <div className="header-right">
                    {showAddButton && listTab === 'active' && (
                        <button type="button" className="btn-primary btn-add" onClick={openCreateModal}>
                            <i className="fas fa-user-plus"></i>{' '}
                            {isLearnerTab ? variantConfig.addLabel : 'Add staff user'}
                        </button>
                    )}
                </div>
            </div>
            )}

            {embedded && showAddButton && listTab === 'active' && (
                <div className="users-embedded-actions">
                    <button type="button" className="btn-primary btn-add" onClick={openCreateModal}>
                        <i className="fas fa-user-plus"></i>{' '}
                        {isLearnerTab ? variantConfig.addLabel : 'Add staff user'}
                    </button>
                </div>
            )}

            <div className="students-list-tabs users-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('active');
                        setSelectedUsers([]);
                    }}
                >
                    <i className="fas fa-list" /> {ACTIVE_RECORDS_LABEL}
                </button>
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('trash');
                        setSelectedUsers([]);
                    }}
                >
                    <i className="fas fa-archive" /> {QUARANTINE_LABEL}
                    {trashCount > 0 ? ` (${trashCount})` : ''}
                </button>
            </div>

            {/* Search and Filter */}
            <div className="controls-bar">
                <AdminSearchBox
                    placeholder={
                        variant === 'parents'
                            ? 'Search parents by name, email, phone, child, or relation…'
                            : isLearnerTab
                            ? 'Search learners by name, email or phone…'
                            : 'Search users by name, email or phone…'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onEnter={() => {
                        const q = flushUserSearch();
                        fetchUsers({ force: true, page: 1, search: q });
                    }}
                />
                
                <div className="filter-controls">
                    {variant !== 'parents' ? (
                        <select
                            className="role-filter"
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                        >
                            {variant === 'teachers' ? (
                                <>
                                    <option value="all">All teachers</option>
                                    <option value="teacher">Teachers</option>
                                </>
                            ) : (
                                <>
                                    <option value="all">All staff roles</option>
                                    <option value="super-admin">Super Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="accountant">Accountant</option>
                                </>
                            )}
                        </select>
                    ) : null}

                    <button className="refresh-btn" onClick={handleManualRefresh} type="button" title="Refresh" aria-label="Refresh">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                    <button className="btn-secondary download-btn" onClick={downloadUsersCsv}>
                        <i className="fas fa-file-export"></i> Download CSV
                    </button>
                </div>
            </div>

            {loading && users.length > 0 ? (
                <div className="users-list-refreshing" aria-live="polite">
                    <i className="fas fa-spinner fa-spin" aria-hidden /> Refreshing…
                </div>
            ) : null}

            {/* Bulk Actions Bar — directly above table */}
            {selectedUsers.length > 0 && (
                <div className="bulk-actions-bar">
                    <div className="selected-count">
                        <i className="fas fa-check-circle"></i>
                        {selectedUsers.length} user(s) selected
                    </div>
                    <div className="bulk-buttons">
                        {listTab === 'active' ? (
                            <>
                                <button 
                                    className="bulk-btn" 
                                    onClick={() => updateSelectedStatus('active')}
                                >
                                    <i className="fas fa-check"></i> Activate All
                                </button>
                                <button 
                                    className="bulk-btn" 
                                    onClick={() => updateSelectedStatus('inactive')}
                                >
                                    <i className="fas fa-ban"></i> Deactivate All
                                </button>
                                <button 
                                    className="bulk-btn delete" 
                                    onClick={deleteSelectedUsers}
                                >
                                    <i className="fas fa-archive"></i> Move to {QUARANTINE_LABEL}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="bulk-btn"
                                    disabled={trashBusy}
                                    onClick={isStaffTab ? restoreSelectedUsers : async () => {
                                        for (const id of selectedUsers) {
                                            await restoreUser(id);
                                        }
                                        setSelectedUsers([]);
                                    }}
                                >
                                    <i className="fas fa-undo"></i> Restore selected
                                </button>
                                <button
                                    className="bulk-btn delete"
                                    disabled={trashBusy}
                                    onClick={permanentDeleteSelectedUsers}
                                >
                                    <i className="fas fa-trash-alt"></i> Delete Permanently
                                </button>
                            </>
                        )}
                        <button
                            className="bulk-btn edit"
                            onClick={() => {
                                if (selectedUsers.length !== 1) {
                                    showAlert('Please select only one record to edit', 'warning');
                                    return;
                                }
                                const user = users.find((u) => String(u._id) === String(selectedUsers[0]));
                                if (!user) {
                                    showAlert('Selected record not found', 'warning');
                                    return;
                                }
                                if (isRowActionsLocked(user)) {
                                    showAlert('This account cannot be edited from here', 'warning');
                                    return;
                                }
                                openEditModal(user);
                            }}
                        >
                            <i className="fas fa-edit"></i> Edit Selected
                        </button>
                        <button 
                            className="bulk-btn cancel" 
                            onClick={() => setSelectedUsers([])}
                        >
                            <i className="fas fa-times"></i> Clear Selection
                        </button>
                    </div>
                </div>
            )}

            {/* Users Table */}
            <div
                ref={tableContainerRef}
                className={`users-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="users-table">
                    <colgroup>
                        {tableColumnKeys.map((key, idx) => (
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
                            {tableColumnKeys.map((colKey, idx) => {
                                if (colKey === 'checkbox') {
                                    return (
                                        <th key={colKey} className="checkbox-cell">
                                            <input
                                                type="checkbox"
                                                checked={
                                                    selectableFilteredUsers.length > 0 &&
                                                    selectedUsers.length === selectableFilteredUsers.length
                                                }
                                                onChange={toggleAllUsers}
                                            />
                                            <span
                                                className="col-resizer"
                                                onPointerDown={(e) => startColumnResize(e, idx)}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resetColumnWidth(idx);
                                                }}
                                            />
                                        </th>
                                    );
                                }
                                if (colKey === 'actions') {
                                    return (
                                        <th key={colKey} className="action-col">
                                            {COLUMN_LABELS.actions}
                                            <span
                                                className="col-resizer"
                                                onPointerDown={(e) => startColumnResize(e, idx)}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resetColumnWidth(idx);
                                                }}
                                            />
                                        </th>
                                    );
                                }
                                const sortable = colKey !== 'assignedCourses' && colKey !== 'children';
                                return (
                                    <th
                                        key={colKey}
                                        className={sortable ? 'sortable' : ''}
                                        onClick={sortable ? () => handleSort(colKey) : undefined}
                                    >
                                        {COLUMN_LABELS[colKey]}
                                        {sortable ? (
                                            sortBy === colKey ? (
                                                <i
                                                    className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}
                                                ></i>
                                            ) : (
                                                <i className="fas fa-sort"></i>
                                            )
                                        ) : null}
                                        <span
                                            className="col-resizer"
                                            onPointerDown={(e) => startColumnResize(e, idx)}
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                resetColumnWidth(idx);
                                            }}
                                        />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map((user) => (
                            <tr key={user._id} className={selectedUsers.includes(user._id) ? 'selected' : ''}>
                                {tableColumnKeys.map((colKey) => {
                                    if (colKey === 'checkbox') {
                                        return (
                                            <td key={colKey} className="checkbox-cell">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUsers.includes(user._id)}
                                                    onChange={() => toggleUserSelection(user._id)}
                                                    disabled={isRowActionsLocked(user)}
                                                />
                                            </td>
                                        );
                                    }
                                    if (colKey === 'user') {
                                        const showRoleUnderName = variant === 'teachers' || variant === 'parents';
                                        const roleIcon =
                                            user.role === 'teacher'
                                                ? 'chalkboard-teacher'
                                                : user.role === 'parent'
                                                  ? 'people-roof'
                                                  : user.role === 'super-admin'
                                                    ? 'user-shield'
                                                    : user.role === 'manager'
                                                      ? 'user-cog'
                                                      : user.role === 'accountant'
                                                        ? 'calculator'
                                                        : 'user-graduate';
                                        return (
                                            <td key={colKey}>
                                                <div className="user-info">
                                                    <div className="user-avatar">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="user-details">
                                                        <strong>{user.name}</strong>
                                                        {showRoleUnderName ? (
                                                            <span className={`user-role-under-name role-badge ${user.role}`}>
                                                                <i className={`fas fa-${roleIcon}`} aria-hidden="true" />
                                                                {displayRoleLabel(user.role)}
                                                            </span>
                                                        ) : null}
                                                        {user.role === 'student' && user.studentId && (
                                                            <span className="student-id-tag">
                                                                <i className="fas fa-id-card"></i> {user.studentId}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'role') {
                                        return (
                                            <td key={colKey}>
                                                <span className={`role-badge ${user.role}`}>
                                                    <i
                                                        className={`fas fa-${
                                                            user.role === 'super-admin'
                                                                ? 'user-shield'
                                                                : user.role === 'manager'
                                                                  ? 'user-cog'
                                                                  : user.role === 'teacher'
                                                                    ? 'chalkboard-teacher'
                                                                    : user.role === 'accountant'
                                                                      ? 'calculator'
                                                                      : user.role === 'parent'
                                                                        ? 'people-roof'
                                                                        : 'user-graduate'
                                                        }`}
                                                    ></i>
                                                    {displayRoleLabel(user.role)}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'status') {
                                        const displayStatus = isStaffTab
                                            ? normalizeStaffStatus(user.status)
                                            : (user.status === 'pending' ? 'inactive' : (user.status || 'inactive'));
                                        return (
                                            <td key={colKey}>
                                                <div className="status-cell">
                                                    <span className={`status-badge ${displayStatus}`}>
                                                        <i
                                                            className={`fas fa-${
                                                                displayStatus === 'active'
                                                                    ? 'check-circle'
                                                                    : displayStatus === 'completed'
                                                                      ? 'flag-checkered'
                                                                      : 'times-circle'
                                                            }`}
                                                        ></i>
                                                        {displayStatus}
                                                    </span>
                                                    {listTab === 'active' && !isRowActionsLocked(user) ? (
                                                        <select
                                                            className="status-select-inline"
                                                            value={displayStatus}
                                                            onChange={(e) => updateUserStatus(user._id, displayStatus, e.target.value)}
                                                            title="Change Status"
                                                        >
                                                            <option value="active">Active</option>
                                                            <option value="inactive">Inactive</option>
                                                            {!isStaffTab ? <option value="completed">Completed</option> : null}
                                                        </select>
                                                    ) : null}
                                                </div>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'assignedCourses') {
                                        const courses = teacherCoursesById[String(user._id)] || [];
                                        const teacherSlots = teacherSlotsById[String(user._id)] || [];
                                        return (
                                            <td key={colKey} className="cell-meta-col cell-meta-col--stacked">
                                                {courses.length ? (
                                                    <div className="meta-col-stack">
                                                        {courses.map((c) => {
                                                            const courseSlots = teacherSlots.filter(
                                                                (s) =>
                                                                    String(s.course?._id || s.course) ===
                                                                    String(c._id)
                                                            );
                                                            return (
                                                                <div key={c._id} className="meta-col-row meta-col-row--course">
                                                                    <i className="fas fa-book" aria-hidden="true" />
                                                                    <div className="meta-col-course">
                                                                        <span className="meta-col-course__title">{c.title}</span>
                                                                        {courseSlots.length ? (
                                                                            <ul className="meta-col-course__slots">
                                                                                {courseSlots.map((slot) => (
                                                                                    <li key={slot._id}>
                                                                                        {formatScheduleTimeLabel(slot)}
                                                                                    </li>
                                                                                ))}
                                                                            </ul>
                                                                        ) : (
                                                                            <span className="meta-col-course__slots-empty">
                                                                                No timeslot yet
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'children') {
                                        const links = parentChildrenById[String(user._id)] || [];
                                        return (
                                            <td key={colKey} className="cell-meta-col cell-meta-col--stacked">
                                                {links.length ? (
                                                    <div className="meta-col-stack">
                                                        {links.map((l) => (
                                                            <div key={l._id} className="meta-col-row">
                                                                <i className="fas fa-child" aria-hidden="true" />
                                                                <span>
                                                                    {l.student?.name || 'Student'}
                                                                    {l.student?.studentId
                                                                        ? ` (${l.student.studentId})`
                                                                        : ''}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'phone') {
                                        return (
                                            <td key={colKey}>
                                                <span className="phone-info">{user.phone || 'Not set'}</span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'email') {
                                        return (
                                            <td key={colKey} className="cell-email">
                                                <span className="email-cell" title={user.email}>
                                                    {user.email}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'personalEmail') {
                                        return (
                                            <td key={colKey} className="cell-email">
                                                {user.personalEmail ? (
                                                    <span
                                                        className="email-cell personal-email-cell"
                                                        title={user.personalEmail}
                                                    >
                                                        <i className="fas fa-envelope-open-text" aria-hidden="true"></i>{' '}
                                                        {user.personalEmail}
                                                    </span>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'joined') {
                                        return (
                                            <td key={colKey}>
                                                {user.joinDate
                                                    ? new Date(user.joinDate).toLocaleDateString()
                                                    : 'N/A'}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'lastLogin') {
                                        return (
                                            <td key={colKey}>
                                                {user.lastLogin
                                                    ? new Date(user.lastLogin).toLocaleString(undefined, {
                                                          dateStyle: 'short',
                                                          timeStyle: 'short',
                                                      })
                                                    : 'Never'}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'actions') {
                                        return (
                                            <td key={colKey} className="cell-actions action-col">
                                    <div className="action-buttons">
                                        {isRowActionsLocked(user) ? (
                                            <button
                                                type="button"
                                                className="action-btn view-btn"
                                                title="View details (read-only)"
                                                onClick={() => openViewModal(user)}
                                            >
                                                <i className="fas fa-eye"></i> View
                                            </button>
                                        ) : listTab === 'trash' ? (
                                            <>
                                                <button
                                                    className="action-btn restore-btn"
                                                    title="Restore"
                                                    disabled={trashBusy}
                                                    onClick={() => restoreUser(user._id)}
                                                >
                                                    <i className="fas fa-undo"></i> Restore
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title="Delete Permanently"
                                                    disabled={trashBusy}
                                                    onClick={() => permanentDeleteUser(user._id)}
                                                >
                                                    <i className="fas fa-times-circle"></i> Delete forever
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="action-btn edit-btn"
                                                    title="Edit"
                                                    onClick={() => openEditModal(user)}
                                                >
                                                    <i className="fas fa-edit"></i> Edit
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title={`Move to ${QUARANTINE_LABEL}`}
                                                    onClick={() => deleteUser(user._id)}
                                                >
                                                    <i className="fas fa-trash"></i> Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                            </td>
                                        );
                                    }
                                    return null;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {sortedUsers.length === 0 && (() => {
                    const hasAnyUsers = users.length > 0;
                    const emptyTitle = hasAnyUsers
                        ? 'No matching records'
                        : isLearnerTab
                          ? 'No learners yet'
                          : 'No staff accounts yet';
                    const emptySubtitle = hasAnyUsers
                        ? 'Try a different search term or filter to find who you’re looking for.'
                        : isLearnerTab
                          ? 'Add your first student, teacher, or parent to get started.'
                          : 'Invite your first admin or accountant to start managing the platform.';
                    return (
                        <div className="no-results">
                            <div className="no-results__icon" aria-hidden="true">
                                <i className={`fas ${hasAnyUsers ? 'fa-magnifying-glass' : 'fa-user-slash'}`}></i>
                            </div>
                            <h3>{emptyTitle}</h3>
                            <p>{emptySubtitle}</p>
                            {showAddButton && !hasAnyUsers && (
                                <button
                                    type="button"
                                    className="btn-primary empty-state-cta"
                                    onClick={openCreateModal}
                                >
                                    <span className="empty-state-cta__icon" aria-hidden="true">
                                        <i className="fas fa-user-plus"></i>
                                    </span>
                                    <span className="empty-state-cta__label">
                                        {isLearnerTab ? variantConfig.addLabel : 'Add your first staff user'}
                                    </span>
                                    <span className="empty-state-cta__arrow" aria-hidden="true">
                                        <i className="fas fa-arrow-right"></i>
                                    </span>
                                </button>
                            )}
                        </div>
                    );
                })()}
            </div>

            <div className="users-list-pagination">
                <span className="users-list-pagination__count">
                    {total} record{total === 1 ? '' : 's'}
                    {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
                </span>
                <AdminTablePagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                />
            </div>

            {/* Stats Summary */}
            <div className="stats-summary">
                {isLearnerTab ? (
                    <>
                        <div className="stat-card">
                            <div className="stat-icon total">
                                <i className="fas fa-users"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{listStats?.total ?? total}</h3>
                                <p>Total learners</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-user-graduate"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.student ?? 0}</h3>
                                <p>Students</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-chalkboard-teacher"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.teacher ?? 0}</h3>
                                <p>Teachers</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon active">
                                <i className="fas fa-people-roof"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.parent ?? 0}</h3>
                                <p>Parents</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="stat-card">
                            <div className="stat-icon total">
                                <i className="fas fa-users"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{listStats?.total ?? total}</h3>
                                <p>Staff accounts</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon admin">
                                <i className="fas fa-user-shield"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole['super-admin'] ?? 0}</h3>
                                <p>Super admins</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon admin">
                                <i className="fas fa-user-cog"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.manager ?? 0}</h3>
                                <p>Admins</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-calculator"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{statsByRole.accountant ?? 0}</h3>
                                <p>Accountants</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {viewUser && (
                <div className="user-modal-overlay" role="dialog" aria-modal="true">
                    <div className="user-modal user-view-modal">
                        <div className="user-modal-header">
                            <h2><i className="fas fa-eye"></i> Account Details</h2>
                            <button type="button" className="modal-close-btn" onClick={() => setViewUser(null)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="form-scroll-container">
                            <dl className="user-details-readonly">
                                <dt>Name</dt><dd>{viewUser.name}</dd>
                                <dt>Email</dt><dd className="admin-email">{viewUser.email}</dd>
                                {viewUser.role === 'student' && (
                                    <>
                                        <dt>Personal email</dt>
                                        <dd className="admin-email">{viewUser.personalEmail || '—'}</dd>
                                    </>
                                )}
                                <dt>Role</dt><dd>{viewUser.role}</dd>
                                <dt>Phone</dt><dd>{viewUser.phone || '—'}</dd>
                                <dt>Status</dt>
                                <dd>{isStaffTab ? normalizeStaffStatus(viewUser.status) : viewUser.status}</dd>
                                <dt>Joined</dt><dd>{viewUser.joinDate ? new Date(viewUser.joinDate).toLocaleString() : '—'}</dd>
                                <dt>Last login</dt><dd>{viewUser.lastLogin ? new Date(viewUser.lastLogin).toLocaleString() : 'Never'}</dd>
                                {variant === 'teachers' && viewUser.role === 'teacher' && (
                                    <>
                                        <dt>Class slots</dt>
                                        <dd>
                                            {viewTeacherSlotsLoading ? (
                                                'Loading…'
                                            ) : viewTeacherSlots.length === 0 ? (
                                                'None yet — manage in LMS → Class Schedules'
                                            ) : (
                                                <ul className="teacher-slots-readonly">
                                                    {viewTeacherSlots.map((slot) => (
                                                        <li key={slot._id}>
                                                            <strong>{slot.course?.title || 'Course'}</strong>
                                                            {' — '}
                                                            {formatScheduleLabel(slot)}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                                                <Link to="/admin/lms">Open LMS Class Schedules</Link> to edit.
                                            </p>
                                        </dd>
                                    </>
                                )}
                            </dl>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn-primary" onClick={() => setViewUser(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
  );
}
