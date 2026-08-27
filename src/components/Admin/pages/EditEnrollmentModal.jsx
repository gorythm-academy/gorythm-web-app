import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { formatScheduleLabel } from '../../../utils/formatScheduleLabel';
import { localFromPortalEmail as portalEmailLocalPart } from '../../../utils/studentPortalEmail';
import {
    GORYTHM_EMAIL_DOMAIN,
    GORYTHM_EMAIL_REGEX,
    MIN_STUDENT_PASSWORD_LENGTH,
    normalizeEnrollmentStatus,
    sanitizePortalEmailLocal,
    sortPublishedCourses,
    validatePasswordPair,
    validatePersonalEmail,
    validateStudentId,
} from '../../../utils/studentAdminValidation';
import './StudentsData.scss';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';
import { useAdminDialog } from '../AdminDialogContext';

const EditEnrollmentModal = ({ isOpen, enrollment, onClose, onSaved }) => {
    const { showAlert } = useAdminDialog();
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [availableCourses, setAvailableCourses] = useState([]);
    const [courseSchedules, setCourseSchedules] = useState([]);
    const [schedulesLoading, setSchedulesLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formData, setFormData] = useState(() => ({
        studentName: enrollment?.student?.name || '',
        studentId: enrollment?.student?.studentId || '',
        portalEmailLocal: portalEmailLocalPart(enrollment?.student?.email),
        personalEmail: enrollment?.student?.personalEmail || '',
        phone: enrollment?.student?.phone || '',
        password: '',
        confirmPassword: '',
        mustChangePassword: true,
        courseId: enrollment?.course?._id || '',
        assignedScheduleId: enrollment?.assignedSchedule?._id || enrollment?.assignedSchedule || '',
        status: normalizeEnrollmentStatus(enrollment?.status),
        paymentStatus: enrollment?.paymentStatus || 'pending',
        enrollmentDate: enrollment?.enrollmentDate
            ? new Date(enrollment.enrollmentDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
    }));

    useEffect(() => {
        if (!isOpen) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev || '';
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setFormData({
            studentName: enrollment?.student?.name || '',
            studentId: enrollment?.student?.studentId || '',
            portalEmailLocal: portalEmailLocalPart(enrollment?.student?.email),
            personalEmail: enrollment?.student?.personalEmail || '',
            phone: enrollment?.student?.phone || '',
            password: '',
            confirmPassword: '',
            mustChangePassword: true,
            courseId: enrollment?.course?._id || '',
            assignedScheduleId: enrollment?.assignedSchedule?._id || enrollment?.assignedSchedule || '',
            status: normalizeEnrollmentStatus(enrollment?.status),
            paymentStatus: enrollment?.paymentStatus || 'pending',
            enrollmentDate: enrollment?.enrollmentDate
                ? new Date(enrollment.enrollmentDate).toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0],
        });
        setFormError('');
    }, [isOpen, enrollment]);

    useDialogKeyboard({
        isOpen,
        onClose,
        blockEscape: loading,
    });

    useEffect(() => {
        if (!isOpen) return undefined;
        const fetchCourses = async () => {
            try {
                const token = getAuthToken();
                const response = await axios.get(`${API_BASE_URL}/api/courses`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response.data.courses) setAvailableCourses(response.data.courses);
            } catch (error) {
                console.error('Error fetching courses:', error);
            }
        };
        fetchCourses();
    }, [isOpen]);

    useEffect(() => {
        if (!formData.courseId) {
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
            } catch (err) {
                if (!cancelled) setCourseSchedules([]);
                console.error('Error fetching course schedules:', err);
            } finally {
                if (!cancelled) setSchedulesLoading(false);
            }
        };
        loadSchedules();
        return () => {
            cancelled = true;
        };
    }, [formData.courseId]);

    const sortedActiveCourses = useMemo(
        () => sortPublishedCourses(availableCourses),
        [availableCourses]
    );

    const handleSave = async () => {
        try {
            setLoading(true);
            setFormError('');
            const token = getAuthToken();

            const studentIdErr = validateStudentId(formData.studentId);
            if (studentIdErr) {
                setFormError(studentIdErr);
                return;
            }

            const personalTrim = (formData.personalEmail || '').trim();
            const personalErr = validatePersonalEmail(personalTrim);
            if (personalErr) {
                setFormError(personalErr);
                return;
            }

            const phoneTrim = (formData.phone || '').trim();
            const portalLocal = sanitizePortalEmailLocal(formData.portalEmailLocal);
            const portalEmail = portalLocal ? `${portalLocal}${GORYTHM_EMAIL_DOMAIN}`.toLowerCase() : '';
            if (portalLocal && !GORYTHM_EMAIL_REGEX.test(portalEmail)) {
                setFormError('Portal email must be a valid @gorythmacademy.com address.');
                return;
            }

            if (!portalLocal && (formData.password || formData.status === 'active')) {
                setFormError('Assign a portal email before activating the student or setting a password.');
                return;
            }

            const passwordErr = validatePasswordPair(formData.password, formData.confirmPassword);
            if (passwordErr) {
                setFormError(passwordErr);
                return;
            }

            if (!schedulesLoading && courseSchedules.length > 0 && !formData.assignedScheduleId) {
                setFormError('Please select a class timeslot for this course.');
                return;
            }

            const studentIdTrim = (formData.studentId || '').trim();

            if (enrollment.student?._id) {
                const currentStudentId = String(enrollment.student?.studentId || '').trim();
                const trimmedName = (formData.studentName || '').trim();
                const currentName = (enrollment.student?.name || '').trim();
                const currentEmail = (enrollment.student?.email || '').trim().toLowerCase();
                const currentPersonal = String(enrollment.student?.personalEmail || '').trim();
                const currentPhone = String(enrollment.student?.phone || '').trim();

                const shouldUpdateStudentId = !!studentIdTrim && studentIdTrim !== currentStudentId;
                const shouldUpdateName = !!trimmedName && trimmedName !== currentName;
                const shouldUpdatePortalEmail = portalLocal && portalEmail !== currentEmail;
                const shouldUpdatePersonalEmail = currentPersonal !== personalTrim;
                const shouldUpdatePhone = currentPhone !== phoneTrim;

                if (!trimmedName) {
                    setFormError('Student name is required.');
                    return;
                }

                if (
                    shouldUpdateName ||
                    shouldUpdatePortalEmail ||
                    shouldUpdatePersonalEmail ||
                    shouldUpdateStudentId ||
                    shouldUpdatePhone
                ) {
                    const userUpdatePayload = {
                        name: trimmedName,
                        personalEmail: personalTrim,
                        phone: phoneTrim,
                    };
                    if (shouldUpdatePortalEmail) userUpdatePayload.email = portalEmail;
                    if (shouldUpdateStudentId) userUpdatePayload.studentId = studentIdTrim;

                    await axios.put(`${API_BASE_URL}/api/users/${enrollment.student._id}`, userUpdatePayload, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                }

                if (formData.password) {
                    await axios.patch(
                        `${API_BASE_URL}/api/users/${enrollment.student._id}/password`,
                        {
                            password: formData.password,
                            mustChangePassword: formData.mustChangePassword,
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                }
            }

            const response = await axios.put(
                `${API_BASE_URL}/api/enrollments/${enrollment._id}`,
                {
                    enrollmentDate: formData.enrollmentDate,
                    // Course is locked — never send a course change from Edit
                    assignedScheduleId: formData.assignedScheduleId || null,
                    status: formData.status,
                    paymentStatus: formData.paymentStatus,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (response.data.success) {
                showAlert('Enrollment updated successfully.', 'success');
                onSaved?.(response.data.enrollment);
                onClose();
            }
        } catch (error) {
            const data = error.response?.data;
            setFormError(data?.error || data?.message || error.message || 'Failed to update');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !enrollment) return null;

    return (
        <div className="modal-overlay fullscreen">
            <div className="modal-container fullscreen-modal">
                <div className="modal-header edit-enrollment-modal-header">
                    <div className="edit-enrollment-modal-header__main">
                        <h2><i className="fas fa-edit"></i> Edit this enrollment</h2>
                        <div className="header-subtitle">
                            <span className={`status-badge ${formData.status}`}>{formData.status}</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="close-btn"
                        onClick={onClose}
                        disabled={loading}
                        aria-label="Close"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {formError && (
                    <div className="modal-inline-error">
                        <i className="fas fa-exclamation-circle"></i> {formError}
                    </div>
                )}

                <div className="modal-body">
                    <div className="edit-form-grid">
                        <div className="form-section">
                            <h3><i className="fas fa-user"></i> Student Information</h3>
                            <p className="form-hint-muted form-section-note">
                                Name, portal email, personal email, and phone apply to this student on{' '}
                                <strong>all courses</strong> (one shared account).
                            </p>
                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    value={formData.studentName}
                                    onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                                    className="form-input"
                                    placeholder="Student name"
                                />
                            </div>
                            <div className="form-group">
                                <label><i className="fas fa-id-card"></i> Student ID (GRT-YYYY-###)</label>
                                <input
                                    type="text"
                                    value={formData.studentId}
                                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                                    className="form-input"
                                    placeholder="GRT-2026-001"
                                />
                            </div>
                            <div className="form-group">
                                <label><i className="fas fa-envelope"></i> Portal email</label>
                                <div className="email-input-group">
                                    <input
                                        type="text"
                                        className="email-input-group__local form-input"
                                        value={sanitizePortalEmailLocal(formData.portalEmailLocal)}
                                        onChange={(e) => {
                                            const local = sanitizePortalEmailLocal(e.target.value);
                                            setFormData({ ...formData, portalEmailLocal: local });
                                        }}
                                        placeholder="Assign when ready"
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                    <span className="email-input-group__suffix" aria-hidden="true">
                                        {GORYTHM_EMAIL_DOMAIN}
                                    </span>
                                </div>
                            </div>
                            <div className="form-group">
                                <label><i className="fas fa-lock"></i> New password (optional)</label>
                                <div className="password-field">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="form-input"
                                        placeholder={`Min ${MIN_STUDENT_PASSWORD_LENGTH} characters`}
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="password-field__toggle"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fas fa-eye${showPassword ? '-slash' : ''}`} />
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Confirm new password</label>
                                <div className="password-field">
                                    <input
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        className="form-input"
                                        placeholder="Repeat new password"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        className="password-field__toggle"
                                        onClick={() => setShowConfirmPassword((v) => !v)}
                                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fas fa-eye${showConfirmPassword ? '-slash' : ''}`} />
                                    </button>
                                </div>
                            </div>
                            {formData.password.trim() ? (
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.mustChangePassword}
                                            onChange={(e) =>
                                                setFormData({
                                                    ...formData,
                                                    mustChangePassword: e.target.checked,
                                                })
                                            }
                                            disabled={loading}
                                        />
                                        <span className="checkmark" />
                                        Force password reset on first login
                                    </label>
                                </div>
                            ) : null}
                            <div className="form-group">
                                <label><i className="fas fa-envelope"></i> Personal email (optional)</label>
                                <input
                                    type="email"
                                    value={formData.personalEmail}
                                    onChange={(e) => setFormData({ ...formData, personalEmail: e.target.value })}
                                    className="form-input"
                                    placeholder="Gmail, Hotmail, etc."
                                />
                            </div>
                            <div className="form-group">
                                <label><i className="fas fa-phone"></i> Phone number (optional)</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="form-input"
                                    placeholder="+1 (123) 456-7890"
                                />
                            </div>
                        </div>

                        <div className="form-section">
                            <h3><i className="fas fa-book"></i> Course Information</h3>
                            <div className="form-group">
                                <label>Course</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={
                                        sortedActiveCourses.find((c) => String(c._id) === String(formData.courseId))?.title
                                        || enrollment?.course?.title
                                        || '—'
                                    }
                                    readOnly
                                    disabled
                                />
                                <small className="form-hint">
                                    To add another course, close this dialog and use <strong>Add course to this student</strong>.
                                    Changing course here is disabled so existing enrollments are not overwritten.
                                </small>
                            </div>
                            {formData.courseId ? (
                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-clock" /> Class timeslot
                                        {courseSchedules.length > 0 ? ' *' : ''}
                                    </label>
                                    <select
                                        value={formData.assignedScheduleId}
                                        onChange={(e) =>
                                            setFormData({ ...formData, assignedScheduleId: e.target.value })
                                        }
                                        className="form-select"
                                        disabled={schedulesLoading}
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
                        </div>

                        <div className="form-section">
                            <h3><i className="fas fa-cog"></i> Enrollment Details</h3>
                            <div className="form-row">
                                <div className="form-group half">
                                    <label>Enrollment Date</label>
                                    <input
                                        type="date"
                                        value={formData.enrollmentDate}
                                        onChange={(e) =>
                                            setFormData({ ...formData, enrollmentDate: e.target.value })
                                        }
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group half">
                                    <label>Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="form-select"
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Fee status</label>
                                <select
                                    value={formData.paymentStatus}
                                    onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                                    className="form-select"
                                >
                                    <option value="pending">Pending</option>
                                    <option value="paid">Paid</option>
                                    <option value="failed">Failed</option>
                                    <option value="refunded">Refunded</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {enrollment.updatedAt ? (
                    <p className="edit-enrollment-meta">
                        Last updated: {new Date(enrollment.updatedAt).toLocaleString()}
                    </p>
                ) : null}

                <div className="form-actions">
                    <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button type="button" className="btn-primary btn-save" onClick={handleSave} disabled={loading}>
                        {loading ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i> Saving...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-save"></i> Save All Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditEnrollmentModal;
