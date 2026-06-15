import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import './EnrollStudentModal.scss';

const GORYTHM_EMAIL_REGEX = /^[^\s@]+@gorythmacademy\.com$/i;
const GORYTHM_EMAIL_DOMAIN = '@gorythmacademy.com';

const sanitizePortalEmailLocal = (raw) => {
    const value = String(raw ?? '');
    const beforeAt = value.includes('@') ? value.split('@')[0] : value;
    return beforeAt.replace(/\s+/g, '');
};

const ENROLLMENT_STATUS_VALUES = [
    { value: 'active', label: 'Active', color: '#10b981' },
    { value: 'inactive', label: 'Inactive', color: '#64748b' },
    { value: 'completed', label: 'Completed', color: 'var(--color-accent)' },
];

const FEE_STATUS_VALUES = [
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' },
];

/**
 * Add student: create portal account + enroll in a course (EnrollStudentModal layout).
 */
const AddStudentUnifiedModal = ({ isOpen, onClose, onSuccess, courses }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        studentId: '',
        personalEmail: '',
        phone: '',
        courseId: '',
        status: 'active',
        paymentStatus: 'pending',
    });

    const sortedCourses = useMemo(() => {
        const list = Array.isArray(courses)
            ? courses.filter((c) => c?.status === 'published' || c?.isPublished === true)
            : [];
        const getDisplayOrder = (course) => {
            const order = Number(course?.displayOrder);
            return Number.isFinite(order) ? order : 9999;
        };
        return list.sort((a, b) => {
            const orderA = getDisplayOrder(a);
            const orderB = getDisplayOrder(b);
            if (orderA !== orderB) return orderA - orderB;
            return String(a?.title || '').localeCompare(String(b?.title || ''));
        });
    }, [courses]);

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
            status: 'active',
            paymentStatus: 'pending',
        });
        setShowPassword(false);
        setShowConfirmPassword(false);
        return () => {
            document.body.style.overflow = prev || '';
        };
    }, [isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleStatusSelect = (statusValue) => {
        setFormData((prev) => ({ ...prev, status: statusValue }));
    };

    const handleClose = () => {
        setError('');
        setSuccess('');
        onClose();
    };

    const getSelectedCourse = () => sortedCourses.find((c) => c._id === formData.courseId);

    const portalEmailDisplay = formData.email.trim() || '—';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const token = getAuthToken();
            if (!token) {
                throw new Error('Admin session expired. Please log in again.');
            }

            const name = formData.name.trim();
            const email = formData.email.trim();
            if (!name) throw new Error('Full name is required.');
            if (!email) throw new Error('Portal email is required.');
            if (!GORYTHM_EMAIL_REGEX.test(email)) {
                throw new Error('Portal email must be in this format: id@gorythmacademy.com');
            }
            if (!formData.password || formData.password.length < 6) {
                throw new Error('Password must be at least 6 characters.');
            }
            if (formData.password !== formData.confirmPassword) {
                throw new Error('Passwords do not match.');
            }
            if (!formData.courseId) {
                throw new Error('Please select a course.');
            }

            const personalTrim = (formData.personalEmail || '').trim();
            if (personalTrim && personalTrim !== personalTrim.toLowerCase()) {
                throw new Error('Personal email must be in lowercase letters.');
            }
            if (personalTrim && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(personalTrim)) {
                throw new Error('Please enter a valid personal email format, or leave it blank.');
            }

            const studentIdTrim = (formData.studentId || '').trim();
            if (studentIdTrim && !/^GRT-\d{4}-\d{3}$/.test(studentIdTrim)) {
                throw new Error('Student ID must match GRT-YYYY-### (e.g. GRT-2026-001) or be left blank.');
            }

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
                    status: 'active',
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (!createRes.data.success) {
                throw new Error(createRes.data.error || 'Failed to create student account');
            }

            const studentUserId = createRes.data.user._id;

            const enrollRes = await axios.post(
                `${API_BASE_URL}/api/enrollments`,
                {
                    studentUserId,
                    courseId: formData.courseId,
                    status: formData.status,
                    paymentStatus: formData.paymentStatus,
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (!enrollRes.data.success) {
                throw new Error(enrollRes.data.message || 'Enrollment failed');
            }

            setSuccess('Student account created and enrolled successfully!');
            if (onSuccess) onSuccess(enrollRes.data.enrollment);
            setTimeout(() => handleClose(), 1500);
        } catch (err) {
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
                                            aria-label="Portal email ID"
                                        />
                                        <span className="email-input-group__suffix" aria-hidden="true">
                                            {GORYTHM_EMAIL_DOMAIN}
                                        </span>
                                    </div>
                                    <small className="form-hint">
                                        Only enter the ID — <strong>@gorythmacademy.com</strong> is added automatically.
                                    </small>
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
                                            placeholder="Minimum 6 characters"
                                            disabled={loading || success}
                                            autoComplete="new-password"
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
                                    <small className="form-hint">Optional. Saved on the student account.</small>
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
                                    <small className="form-hint">Separate from portal login; for contact only.</small>
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
                                    {sortedCourses.length === 0 && (
                                        <small className="form-error">
                                            Create courses first in Courses Management
                                        </small>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-toggle-on"></i> Enrollment status (this course)
                                    </label>
                                    <div className="status-buttons">
                                        {ENROLLMENT_STATUS_VALUES.map((status) => (
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

                        <div className="preview-section">
                            <h3>
                                <i className="fas fa-eye"></i> Preview
                            </h3>
                            <div className="preview-card">
                                <div className="preview-header">
                                    <span className="preview-student">
                                        <i className="fas fa-user"></i> {formData.name.trim() || '—'}
                                        {formData.studentId?.trim() && (
                                            <span className="student-id-badge" style={{ marginLeft: 8 }}>
                                                {formData.studentId.trim()}
                                            </span>
                                        )}
                                    </span>
                                    <span className={`preview-status ${formData.status}`}>{formData.status}</span>
                                </div>
                                <div className="preview-body">
                                    <div className="preview-grid">
                                        <div>
                                            <p>
                                                <strong>Portal email:</strong> {portalEmailDisplay}
                                            </p>
                                            <p>
                                                <strong>Student ID:</strong>{' '}
                                                {formData.studentId?.trim() || '—'}
                                            </p>
                                            <p>
                                                <strong>Personal email:</strong>{' '}
                                                {formData.personalEmail?.trim() || '—'}
                                            </p>
                                            <p>
                                                <strong>Phone:</strong> {formData.phone?.trim() || '—'}
                                            </p>
                                            <p>
                                                <strong>Course:</strong> {getSelectedCourse()?.title || '—'}
                                            </p>
                                            <p>
                                                <strong>Fee status:</strong> {formData.paymentStatus}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            <i className="fas fa-times"></i> Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
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
