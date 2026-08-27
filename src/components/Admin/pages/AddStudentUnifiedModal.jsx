import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { formatScheduleLabel } from '../../../utils/formatScheduleLabel';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';
import {
    GORYTHM_EMAIL_DOMAIN,
    GORYTHM_EMAIL_REGEX,
    MIN_STUDENT_PASSWORD_LENGTH,
    ENROLLMENT_STATUS_BUTTONS,
    FEE_STATUS_VALUES,
    sanitizePortalEmailLocal,
    sortPublishedCourses,
    userStatusFromEnrollmentStatus,
    validatePasswordPair,
    validatePersonalEmail,
    validateStudentId,
} from '../../../utils/studentAdminValidation';
import './EnrollStudentModal.scss';

/**
 * Add student: create portal account + enroll in a course.
 */
const AddStudentUnifiedModal = ({ isOpen, onClose, onSuccess, courses }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [courseSchedules, setCourseSchedules] = useState([]);
    const [schedulesLoading, setSchedulesLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        studentId: '',
        personalEmail: '',
        phone: '',
        courseId: '',
        assignedScheduleId: '',
        status: 'active',
        paymentStatus: 'pending',
        mustChangePassword: true,
    });

    const sortedCourses = useMemo(() => sortPublishedCourses(courses), [courses]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        setError('');
        setSuccess('');
        setFormData({
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
            studentId: '',
            personalEmail: '',
            phone: '',
            courseId: '',
            assignedScheduleId: '',
            status: 'active',
            paymentStatus: 'pending',
            mustChangePassword: true,
        });
        setCourseSchedules([]);
        setShowPassword(false);
        setShowConfirmPassword(false);
        return () => {
            document.body.style.overflow = prev || '';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !formData.courseId) {
            setCourseSchedules([]);
            return undefined;
        }
        let cancelled = false;
        const loadSchedules = async () => {
            setSchedulesLoading(true);
            try {
                const token = getAuthToken();
                const response = await axios.get(
                    `${API_BASE_URL}/api/enrollments/course-schedules/${formData.courseId}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (!cancelled && response.data.success) {
                    setCourseSchedules(response.data.schedules || []);
                }
            } catch {
                if (!cancelled) setCourseSchedules([]);
            } finally {
                if (!cancelled) setSchedulesLoading(false);
            }
        };
        loadSchedules();
        return () => {
            cancelled = true;
        };
    }, [isOpen, formData.courseId]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === 'courseId') {
            setFormData((prev) => ({ ...prev, courseId: value, assignedScheduleId: '' }));
            return;
        }
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleStatusSelect = (statusValue) => {
        setFormData((prev) => ({ ...prev, status: statusValue }));
    };

    const handleClose = () => {
        setError('');
        setSuccess('');
        onClose();
    };

    useDialogKeyboard({
        isOpen,
        onClose: handleClose,
        blockEscape: loading || Boolean(success),
    });

    const getSelectedCourse = () => sortedCourses.find((c) => c._id === formData.courseId);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        let createdUserId = null;

        try {
            const token = getAuthToken();
            if (!token) throw new Error('Admin session expired. Please log in again.');

            const name = formData.name.trim();
            const email = formData.email.trim();
            if (!name) throw new Error('Full name is required.');
            if (!email) throw new Error('Portal email is required.');
            if (!GORYTHM_EMAIL_REGEX.test(email)) {
                throw new Error('Portal email must be in this format: id@gorythmacademy.com');
            }

            const passwordErr = validatePasswordPair(formData.password, formData.confirmPassword, {
                required: true,
            });
            if (passwordErr) throw new Error(passwordErr);

            if (!formData.courseId) throw new Error('Please select a course.');

            if (!schedulesLoading && courseSchedules.length > 0 && !formData.assignedScheduleId) {
                throw new Error('Please select a class timeslot for this course.');
            }

            const personalTrim = (formData.personalEmail || '').trim();
            const personalErr = validatePersonalEmail(personalTrim);
            if (personalErr) throw new Error(personalErr);

            const studentIdTrim = (formData.studentId || '').trim();
            const studentIdErr = validateStudentId(studentIdTrim);
            if (studentIdErr) throw new Error(studentIdErr);

            const accountStatus = userStatusFromEnrollmentStatus(formData.status);

            const createRes = await axios.post(
                `${API_BASE_URL}/api/users`,
                {
                    name,
                    email,
                    password: formData.password,
                    role: 'student',
                    personalEmail: personalTrim,
                    phone: (formData.phone || '').trim(),
                    studentId: studentIdTrim || undefined,
                    status: accountStatus,
                    mustChangePassword: formData.mustChangePassword,
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (!createRes.data.success) {
                throw new Error(createRes.data.error || 'Failed to create student account');
            }

            createdUserId = createRes.data.user._id;

            const enrollRes = await axios.post(
                `${API_BASE_URL}/api/enrollments`,
                {
                    studentUserId: createdUserId,
                    courseId: formData.courseId,
                    status: formData.status,
                    paymentStatus: formData.paymentStatus,
                    assignedScheduleId: formData.assignedScheduleId || undefined,
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (!enrollRes.data.success) {
                throw new Error(enrollRes.data.message || 'Enrollment failed');
            }

            setSuccess('Student account created and enrolled successfully!');
            onSuccess?.(enrollRes.data.enrollment);
            setTimeout(() => handleClose(), 1500);
        } catch (err) {
            if (createdUserId) {
                try {
                    const token = getAuthToken();
                    await axios.delete(`${API_BASE_URL}/api/users/${createdUserId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    await axios.delete(`${API_BASE_URL}/api/users/${createdUserId}/permanent`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                } catch (rollbackErr) {
                    console.error('Failed to roll back orphan student account:', rollbackErr);
                }
            }

            if (err.response) {
                const data = err.response.data || {};
                setError(data.error || data.message || 'Server error. Please try again.');
            } else if (err.request) {
                setError('Cannot connect to server. Please check backend is running.');
            } else {
                setError(err.message || 'Failed to add student');
            }
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay enroll-modal-overlay">
            <div className="modal-container enroll-modal-container">
                <div className="modal-header enroll-modal-header">
                    <h2>
                        <i className="fas fa-user-plus"></i> Add Student
                    </h2>
                    <button type="button" className="close-btn" onClick={handleClose} disabled={loading}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {error && (
                    <div className="alert alert-error">
                        <i className="fas fa-exclamation-circle"></i>
                        <div className="alert-content">
                            <strong>Error:</strong> {error}
                        </div>
                        <button type="button" onClick={() => setError('')} className="alert-close">
                            ×
                        </button>
                    </div>
                )}

                {success && (
                    <div className="alert alert-success">
                        <i className="fas fa-check-circle"></i>
                        <div className="alert-content">
                            <strong>Success!</strong> {success}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="enrollment-form">
                    <div className="enrollment-form-scroll">
                        <div className="form-grid">
                            <div className="form-section form-card">
                                <h3>
                                    <i className="fas fa-user-graduate"></i> Student account
                                </h3>

                                <div className="form-group">
                                    <label htmlFor="add-student-name">
                                        <i className="fas fa-user"></i> Full name *
                                    </label>
                                    <input
                                        id="add-student-name"
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="Student full name"
                                        required
                                        disabled={loading || success}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="add-student-email-local">
                                        <i className="fas fa-envelope"></i> Portal email *
                                    </label>
                                    <div className={`email-input-group ${loading || success ? 'is-disabled' : ''}`}>
                                        <input
                                            id="add-student-email-local"
                                            type="text"
                                            name="emailLocal"
                                            className="email-input-group__local"
                                            value={sanitizePortalEmailLocal(formData.email)}
                                            onChange={(e) => {
                                                const local = sanitizePortalEmailLocal(e.target.value);
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    email: local ? `${local}${GORYTHM_EMAIL_DOMAIN}` : '',
                                                }));
                                            }}
                                            placeholder="id"
                                            required
                                            disabled={loading || success}
                                            autoComplete="off"
                                            spellCheck={false}
                                        />
                                        <span className="email-input-group__suffix" aria-hidden="true">
                                            {GORYTHM_EMAIL_DOMAIN}
                                        </span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="add-student-password">
                                        <i className="fas fa-lock"></i> Password *
                                    </label>
                                    <div className={`password-field ${loading || success ? 'is-disabled' : ''}`}>
                                        <input
                                            id="add-student-password"
                                            type={showPassword ? 'text' : 'password'}
                                            name="password"
                                            value={formData.password}
                                            onChange={handleChange}
                                            className="form-input"
                                            placeholder={`Minimum ${MIN_STUDENT_PASSWORD_LENGTH} characters`}
                                            disabled={loading || success}
                                            autoComplete="new-password"
                                            minLength={MIN_STUDENT_PASSWORD_LENGTH}
                                        />
                                        <button
                                            type="button"
                                            className="password-field__toggle"
                                            onClick={() => setShowPassword((v) => !v)}
                                            disabled={loading || success}
                                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                                            tabIndex={-1}
                                        >
                                            <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="add-student-confirm-password">
                                        <i className="fas fa-lock"></i> Confirm password *
                                    </label>
                                    <div className={`password-field ${loading || success ? 'is-disabled' : ''}`}>
                                        <input
                                            id="add-student-confirm-password"
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            name="confirmPassword"
                                            value={formData.confirmPassword}
                                            onChange={handleChange}
                                            className="form-input"
                                            placeholder="Confirm password"
                                            disabled={loading || success}
                                            autoComplete="new-password"
                                            minLength={MIN_STUDENT_PASSWORD_LENGTH}
                                        />
                                        <button
                                            type="button"
                                            className="password-field__toggle"
                                            onClick={() => setShowConfirmPassword((v) => !v)}
                                            disabled={loading || success}
                                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                            tabIndex={-1}
                                        >
                                            <i
                                                className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}
                                            ></i>
                                        </button>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            name="mustChangePassword"
                                            checked={formData.mustChangePassword}
                                            onChange={handleChange}
                                            disabled={loading || success}
                                        />
                                        <span className="checkmark"></span>
                                        Force password reset on first login
                                    </label>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="add-student-id">
                                        <i className="fas fa-id-card"></i> Student ID (GRT-YYYY-###)
                                    </label>
                                    <input
                                        id="add-student-id"
                                        type="text"
                                        name="studentId"
                                        value={formData.studentId}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="GRT-2026-001"
                                        disabled={loading || success}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="add-student-personal-email">
                                        <i className="fas fa-envelope-open-text"></i> Personal email (optional)
                                    </label>
                                    <input
                                        id="add-student-personal-email"
                                        type="email"
                                        name="personalEmail"
                                        value={formData.personalEmail}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="gmail.com, hotmail.com, etc."
                                        disabled={loading || success}
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="add-student-phone">
                                        <i className="fas fa-phone"></i> Phone number (optional)
                                    </label>
                                    <input
                                        id="add-student-phone"
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="form-input"
                                        placeholder="+1 (123) 456-7890"
                                        disabled={loading || success}
                                    />
                                </div>
                            </div>

                            <div className="form-section form-card">
                                <h3>
                                    <i className="fas fa-book"></i> Course &amp; status
                                </h3>

                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-graduation-cap"></i> Select course *
                                    </label>
                                    <select
                                        name="courseId"
                                        value={formData.courseId}
                                        onChange={handleChange}
                                        required
                                        className="form-select"
                                        disabled={loading || success || sortedCourses.length === 0}
                                    >
                                        <option value="">
                                            {sortedCourses.length === 0
                                                ? 'No courses available'
                                                : 'Choose a course...'}
                                        </option>
                                        {sortedCourses.map((course) => (
                                            <option key={course._id} value={course._id}>
                                                {course.title} ({course.category})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {formData.courseId ? (
                                    <div className="form-group">
                                        <label>
                                            <i className="fas fa-clock"></i>{' '}
                                            Class timeslot
                                            {courseSchedules.length > 0 ? ' *' : ''}
                                        </label>
                                        <select
                                            name="assignedScheduleId"
                                            value={formData.assignedScheduleId}
                                            onChange={handleChange}
                                            className="form-select"
                                            disabled={loading || success || schedulesLoading}
                                            required={courseSchedules.length > 0}
                                        >
                                            <option value="">
                                                {schedulesLoading
                                                    ? 'Loading timeslots…'
                                                    : courseSchedules.length
                                                      ? 'Select a timeslot…'
                                                      : 'No timeslots yet — create in LMS'}
                                            </option>
                                            {courseSchedules.map((slot) => (
                                                <option key={slot._id} value={slot._id}>
                                                    {formatScheduleLabel(slot)}
                                                </option>
                                            ))}
                                        </select>
                                        {!schedulesLoading && courseSchedules.length === 0 ? (
                                            <small className="form-hint">
                                                This course has no class slots. Add them under LMS → Class
                                                schedules so the student sees a timetable.
                                            </small>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-toggle-on"></i> Enrollment status (this course)
                                    </label>
                                    <div className="status-buttons">
                                        {ENROLLMENT_STATUS_BUTTONS.map((status) => (
                                            <button
                                                key={status.value}
                                                type="button"
                                                className={`status-btn ${formData.status === status.value ? 'active' : ''}`}
                                                onClick={() => handleStatusSelect(status.value)}
                                                style={{ borderLeftColor: status.color }}
                                                disabled={loading || success}
                                            >
                                                <i className="fas fa-circle" style={{ color: status.color }}></i>
                                                {status.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="add-student-fee-status">
                                        <i className="fas fa-credit-card"></i> Fee status
                                    </label>
                                    <select
                                        id="add-student-fee-status"
                                        name="paymentStatus"
                                        value={formData.paymentStatus}
                                        onChange={handleChange}
                                        className="form-select"
                                        disabled={loading || success}
                                    >
                                        {FEE_STATUS_VALUES.map((s) => (
                                            <option key={s.value} value={s.value}>
                                                {s.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-secondary" onClick={handleClose} disabled={loading}>
                            <i className="fas fa-times"></i> Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary btn-add"
                            disabled={loading || success || sortedCourses.length === 0}
                        >
                            {loading ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i> Saving...
                                </>
                            ) : success ? (
                                <>
                                    <i className="fas fa-check"></i> Done!
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-user-plus"></i> Add Student
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddStudentUnifiedModal;
