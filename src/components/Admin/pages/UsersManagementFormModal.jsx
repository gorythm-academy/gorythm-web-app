import RequiredMark from '../../shared/RequiredMark';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { formatLoginEmailNotice, formatLoginEmailStatus, isLoginEmailSent, MIN_STUDENT_PASSWORD_LENGTH } from '../../../utils/studentAdminValidation';
import { formatScheduleLabel } from '../../../utils/formatScheduleLabel';
import { Link } from 'react-router-dom';
import { PARENT_RELATION_OPTIONS } from './LmsManagement/lmsHelpers';
import { teacherAccountStatus } from '../../../utils/teacherAccountStatus';
import { GORYTHM_EMAIL_DOMAIN, STAFF_STATUS_OPTIONS, USER_STATUS_OPTIONS, sanitizePortalEmailLocal } from './usersManagementShared';

export function UsersManagementFormModal({ state }) {
  const {
    addParentChildLink,
    allCourses,
    allStudentsForLink,
    assignedTeacherSlots,
    closeUserModal,
    editingUser,
    formData,
    handleFormChange,
    handleFormSubmit,
    isStaffTab,
    isSubmitting,
    linkRelation,
    linkStudentPick,
    parentLinksInModal,
    parentStudentSearch,
    parentStudentsLoading,
    pendingParentLinks,
    removeParentChildLink,
    removePendingParentLink,
    roleOptions,
    setEditingUser,
    setIsSubmitting,
    setLinkRelation,
    setLinkStudentPick,
    setParentStudentSearch,
    setShowConfirmPassword,
    setShowPassword,
    setShowUserModal,
    setUsers,
    showAlert,
    showConfirmPassword,
    showPassword,
    showUserModal,
    teacherSlotsLoading,
    toggleAssignedCourse,
    updateDraftLinkRelation,
    variant,
    variantConfig,
  } = state;

  return (
    <>
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
                                                        aria-label="Portal Email ID"
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
                                            <label>Personal Email (Optional)</label>
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
                                                <label>Login Email Status</label>
                                                <p
                                                    className={`login-email-status ${
                                                        isLoginEmailSent(editingUser) ? 'is-sent' : 'is-pending'
                                                    }`}
                                                    role="status"
                                                >
                                                    {formatLoginEmailStatus(editingUser)}
                                                </p>
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
                                                        {variant === 'teachers'
                                                            ? teacherAccountStatus({ status })
                                                            : status.charAt(0).toUpperCase() + status.slice(1)}
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
                                                    <span>Force Password Reset on First Login</span>
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
                                                    <span>Force Password Reset on First Login</span>
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
                                                        <li key={key} className="parent-child-row">
                                                            <div className="parent-child-row__identity">
                                                                <span className="parent-child-row__name">
                                                                    {link.student?.name || 'Student'}
                                                                </span>
                                                                {link.student?.studentId ? (
                                                                    <span className="parent-child-row__id">{link.student.studentId}</span>
                                                                ) : null}
                                                            </div>
                                                            <label className="parent-child-row__relation">
                                                                <span>Relation</span>
                                                                <select
                                                                    value={link.relation || 'guardian'}
                                                                    onChange={(e) => updateDraftLinkRelation(key, e.target.value)}
                                                                    disabled={isSubmitting}
                                                                >
                                                                    {PARENT_RELATION_OPTIONS.map((opt) => (
                                                                        <option key={opt.value} value={opt.value}>
                                                                            {opt.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                            <button
                                                                type="button"
                                                                className="parent-remove-btn"
                                                                onClick={() => removeParentChildLink(key)}
                                                                disabled={isSubmitting}
                                                            >
                                                                <i className="fas fa-trash-alt" aria-hidden="true" />
                                                                Remove
                                                            </button>
                                                        </li>
                                                        );
                                                    })
                                                ) : (
                                                    pendingParentLinks.map((link) => (
                                                        <li key={link.studentId} className="parent-child-row">
                                                            <div className="parent-child-row__identity">
                                                                <span className="parent-child-row__name">
                                                                    {link.student?.name || 'Student'}
                                                                </span>
                                                                {link.student?.studentId ? (
                                                                    <span className="parent-child-row__id">{link.student.studentId}</span>
                                                                ) : null}
                                                            </div>
                                                            <label className="parent-child-row__relation">
                                                                <span>Relation</span>
                                                                <select
                                                                    value={link.relation || 'guardian'}
                                                                    onChange={(e) => updateDraftLinkRelation(link.studentId, e.target.value)}
                                                                    disabled={isSubmitting}
                                                                >
                                                                    {PARENT_RELATION_OPTIONS.map((opt) => (
                                                                        <option key={opt.value} value={opt.value}>
                                                                            {opt.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                            <button
                                                                type="button"
                                                                className="parent-remove-btn"
                                                                onClick={() => removePendingParentLink(link.studentId)}
                                                                disabled={isSubmitting}
                                                            >
                                                                <i className="fas fa-trash-alt" aria-hidden="true" />
                                                                Remove
                                                            </button>
                                                        </li>
                                                    ))
                                                )}
                                            </ul>
                                            <div className="parent-link-add">
                                                <div className="form-group">
                                                    <label htmlFor="parent-student-search">Search Students</label>
                                                    <input
                                                        id="parent-student-search"
                                                        type="search"
                                                        placeholder="Name, roll no., email…"
                                                        value={parentStudentSearch}
                                                        onChange={(e) => setParentStudentSearch(e.target.value)}
                                                        disabled={isSubmitting}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label htmlFor="parent-link-student">Student</label>
                                                    <select
                                                        id="parent-link-student"
                                                        value={linkStudentPick}
                                                        onChange={(e) => setLinkStudentPick(e.target.value)}
                                                        disabled={isSubmitting || parentStudentsLoading}
                                                    >
                                                        <option value="">
                                                            {parentStudentsLoading ? 'Loading Students…' : 'Add Unlinked Child…'}
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
                                                </div>
                                                <div className="form-group">
                                                    <label htmlFor="parent-link-relation">Relation</label>
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
                                                </div>
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
                                {editingUser && ['student', 'teacher', 'parent'].includes(editingUser.role) ? (
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
                                                showAlert(
                                                    notice || mailRes.data.loginEmail?.error || 'Login email was not sent.',
                                                    notice ? 'success' : 'warning'
                                                );
                                            } catch (mailErr) {
                                                showAlert(mailErr.response?.data?.error || 'Failed to send login email', 'error');
                                            } finally {
                                                setIsSubmitting(false);
                                            }
                                        }}
                                    >
                                        <i className="fas fa-envelope" aria-hidden /> Resend login email
                                    </button>
                                ) : null}
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

    </>
  );
}
