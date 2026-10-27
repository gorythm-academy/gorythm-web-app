import React, { useState, useEffect, useMemo } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { formatScheduleLabel } from '../../../utils/formatScheduleLabel';
import { displayAccountEmail } from '../../../utils/studentPortalEmail';
import {
    MIN_STUDENT_PASSWORD_LENGTH,
    normalizeEnrollmentStatus,
    sortPublishedCourses,
    formatLoginEmailNotice,
    formatLoginEmailStatus,
    isLoginEmailSent,
    validatePasswordPair,
    validatePeopleLoginEmail,
    validateStudentId,
} from '../../../utils/studentAdminValidation';
import './StudentsData.scss';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';
import { useAdminDialog } from '../AdminDialogContext';
import { formatFeeSummaryMessage } from '../../../utils/billingLabels';

function editableAccountEmail(student) {
    const shown = displayAccountEmail(student);
    return shown === 'Not assigned yet' ? '' : shown;
}

function studentAccountId(enrollment) {
    const student = enrollment?.student;
    if (!student) return '';
    if (typeof student === 'string') return student;
    return String(student._id || student.id || '');
}

const toDateInputValue = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const EditEnrollmentModal = ({ isOpen, enrollment, onClose, onSaved, onLoginEmailUpdated, mode = 'course' }) => {
    const { showAlert, showConfirm } = useAdminDialog();
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [availableCourses, setAvailableCourses] = useState([]);
    const [courseSchedules, setCourseSchedules] = useState([]);
    const [schedulesLoading, setSchedulesLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loginEmailState, setLoginEmailState] = useState(enrollment?.student || null);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formData, setFormData] = useState(() => ({
        studentName: enrollment?.student?.name || '',
        studentId: enrollment?.student?.studentId || '',
        email: editableAccountEmail(enrollment?.student),
        phone: enrollment?.student?.phone || '',
        password: '',
        confirmPassword: '',
        mustChangePassword: true,
        courseId: enrollment?.course?._id || '',
        assignedScheduleId: enrollment?.assignedSchedule?._id || enrollment?.assignedSchedule || '',
        status: normalizeEnrollmentStatus(enrollment?.status),
        paymentStatus: enrollment?.paymentStatus || 'pending',
        enrollmentDate: toDateInputValue(enrollment?.enrollmentDate) || toDateInputValue(new Date()),
        feeDueDate: toDateInputValue(enrollment?.feeDueDate),
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
            email: editableAccountEmail(enrollment?.student),
            phone: enrollment?.student?.phone || '',
            password: '',
            confirmPassword: '',
            mustChangePassword: true,
            courseId: enrollment?.course?._id || '',
            assignedScheduleId: enrollment?.assignedSchedule?._id || enrollment?.assignedSchedule || '',
            status: normalizeEnrollmentStatus(enrollment?.status),
            paymentStatus: enrollment?.paymentStatus || 'pending',
            enrollmentDate: toDateInputValue(enrollment?.enrollmentDate) || toDateInputValue(new Date()),
            feeDueDate: toDateInputValue(enrollment?.feeDueDate),
        });
        setFormError('');
        setLoginEmailState(enrollment?.student || null);
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
            const isAccountMode = mode === 'account';

            if (isAccountMode) {
                const studentIdErr = validateStudentId(formData.studentId);
                if (studentIdErr) {
                    setFormError(studentIdErr);
                    return;
                }
                const phoneTrim = (formData.phone || '').trim();
                const loginEmail = String(formData.email || '').trim().toLowerCase();
                const emailErr = validatePeopleLoginEmail(loginEmail);
                if (emailErr) {
                    setFormError(emailErr);
                    return;
                }
                if (!loginEmail && formData.password) {
                    setFormError('Enter the student email before setting a password.');
                    return;
                }
                const passwordErr = validatePasswordPair(formData.password, formData.confirmPassword);
                if (passwordErr) {
                    setFormError(passwordErr);
                    return;
                }
                const studentIdTrim = (formData.studentId || '').trim();
                const studentId = studentAccountId(enrollment);
                if (!studentId) {
                    setFormError('Student account was not found.');
                    return;
                }
                const trimmedName = (formData.studentName || '').trim();
                if (!trimmedName) {
                    setFormError('Student name is required.');
                    return;
                }
                const accountRes = await axios.put(
                    `${API_BASE_URL}/api/users/${studentId}`,
                    {
                        name: trimmedName,
                        email: loginEmail,
                        phone: phoneTrim,
                        skipLoginEmail: true,
                        ...(studentIdTrim ? { studentId: studentIdTrim } : {}),
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (formData.password) {
                    await axios.patch(
                        `${API_BASE_URL}/api/users/${studentId}/password`,
                        {
                            password: formData.password,
                            mustChangePassword: formData.mustChangePassword,
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                }
                const notice = formatLoginEmailNotice(accountRes.data.loginEmail);
                const loginFields = accountRes.data.user
                    ? {
                        loginEmailSentAt: accountRes.data.user.loginEmailSentAt,
                        loginEmailSentTo: accountRes.data.user.loginEmailSentTo,
                        loginEmailLastError: accountRes.data.user.loginEmailLastError,
                    }
                    : (accountRes.data.loginEmail?.sent
                        ? {
                            loginEmailSentAt: accountRes.data.loginEmail.sentAt,
                            loginEmailSentTo: accountRes.data.loginEmail.sentTo,
                            loginEmailLastError: '',
                        }
                        : null);
                if (loginFields) {
                    setLoginEmailState((prev) => ({
                        ...(prev || enrollment?.student || {}),
                        ...loginFields,
                    }));
                    onLoginEmailUpdated?.(loginFields);
                }
                showAlert(`Student account updated successfully.${notice ? ` ${notice}` : ''}`, 'success');
                onSaved?.(enrollment);
                onClose();
                return;
            }

            if (!schedulesLoading && courseSchedules.length > 0 && !formData.assignedScheduleId) {
                setFormError('Please select a class timeslot for this course.');
                return;
            }
            const payload = {
                enrollmentDate: formData.enrollmentDate,
                assignedScheduleId: formData.assignedScheduleId || null,
                status: formData.status,
                paymentStatus: formData.paymentStatus,
            };
            if (!['cancelled', 'refunded'].includes(formData.paymentStatus)) {
                payload.feeDueDate = formData.feeDueDate || null;
                const previousDue = toDateInputValue(enrollment?.feeDueDate);
                const nextDue = formData.feeDueDate || '';
                if (nextDue && nextDue !== previousDue) {
                    const ok = await showConfirm({
                        title: 'Change this student due date?',
                        message:
                            'This due date will be saved on this enrollment and will show on Admin → Students, the student Fees page, and the parent Fees page for this course. It does not change the academy default or other students.',
                        confirmLabel: 'Save due date',
                    });
                    if (!ok) {
                        setLoading(false);
                        return;
                    }
                }
            }
            if (formData.status === 'completed' && normalizeEnrollmentStatus(enrollment?.status) !== 'completed') {
                try {
                    const preview = await axios.get(
                        `${API_BASE_URL}/api/enrollments/${enrollment._id}/fee-summary`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    const summary = preview.data?.feeSummary;
                    if (summary?.needsCompleteConfirm) {
                        const ok = await showConfirm({
                            title: 'Complete with unpaid fees?',
                            message: formatFeeSummaryMessage(summary),
                            confirmLabel: 'Complete anyway',
                        });
                        if (!ok) {
                            setLoading(false);
                            return;
                        }
                        payload.confirmComplete = true;
                    }
                } catch {
                    payload.confirmComplete = true;
                }
            }
            if (normalizeEnrollmentStatus(enrollment?.status) === 'completed' && formData.status !== 'completed') {
                const ok = await showConfirm({
                    title: 'Start billing again?',
                    message: 'Un-completing this course will start fee due dates again if fees are still unpaid.',
                    confirmLabel: 'Continue',
                });
                if (!ok) {
                    setLoading(false);
                    return;
                }
            }
            const response = await axios.put(
                `${API_BASE_URL}/api/enrollments/${enrollment._id}`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.data.success) {
                showAlert('Course settings updated successfully.', 'success');
                onSaved?.(response.data.enrollment);
                onClose();
            }
        } catch (error) {
            const data = error.response?.data;
            const msg = data?.error || data?.message || error.message || 'Failed to update';
            setFormError(msg);
            showAlert(msg, 'error');
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
                        <h2>
                            <i className="fas fa-edit"></i>{' '}
                            {mode === 'account' ? 'Student Account Settings' : 'Edit Course Settings'}
                        </h2>
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
                        {mode === 'account' ? (
                        <div className="form-section">
                            <h3><i className="fas fa-user"></i> Student Information</h3>
                            <p className="form-hint-muted form-section-note">
                                Name, email, and phone apply to this student on{' '}
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
                                <label><i className="fas fa-envelope"></i> Email</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="name@gmail.com"
                                    autoComplete="off"
                                />
                                <small className="form-hint">The student will use this email to sign in.</small>
                            </div>
                            <div className="form-group">
                                <label>Login Email Status</label>
                                <p
                                    className={`login-email-status ${
                                        isLoginEmailSent(loginEmailState || enrollment?.student)
                                            ? 'is-sent'
                                            : 'is-pending'
                                    }`}
                                    role="status"
                                >
                                    {formatLoginEmailStatus(loginEmailState || enrollment?.student)}
                                </p>
                            </div>
                            <div className="form-group">
                                <label><i className="fas fa-lock"></i> Temporary Password (Optional)</label>
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
                                <label>Confirm New Password</label>
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
                                        <span>Force Password Reset on First Login</span>
                                    </label>
                                </div>
                            ) : null}
                            <div className="form-group">
                                <label><i className="fas fa-phone"></i> Phone Number (Optional)</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="form-input"
                                    placeholder="+1 (123) 456-7890"
                                />
                            </div>
                        </div>
                        ) : (
                        <>
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
                                    To add another course, close this dialog and use <strong>Add Course to This Student</strong>.
                                    Changing course here is disabled so existing enrollments are not overwritten.
                                </small>
                            </div>
                            {formData.courseId ? (
                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-clock" /> Class Timeslot
                                        {courseSchedules.length > 0 ? <RequiredMark /> : null}
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
                                                ? 'Loading Timeslots…'
                                                : courseSchedules.length
                                                  ? 'Select a Timeslot…'
                                                  : 'No Timeslots Yet — Create in LMS'}
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
                                    <label>Fee Due Date</label>
                                    <input
                                        type="date"
                                        value={formData.feeDueDate}
                                        onChange={(e) => setFormData({ ...formData, feeDueDate: e.target.value })}
                                        className="form-input"
                                        disabled={['cancelled', 'refunded'].includes(formData.paymentStatus)}
                                    />
                                    <small className="form-hint">
                                        Unpaid through this date. Overdue from the next day (Pakistan time). After a fee is paid, the next due date is the same day next month.
                                    </small>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group half">
                                    <label>Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="form-select"
                                    >
                                        <option value="active">Active</option>
                                        <option value="paused">Paused</option>
                                        <option value="inactive">Inactive</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                                <div className="form-group half">
                                    <label>Fee Status</label>
                                    <select
                                        value={formData.paymentStatus}
                                        onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                                        className="form-select"
                                    >
                                        <option value="pending">Unpaid</option>
                                        <option value="paid">Paid</option>
                                        <option value="failed">Failed</option>
                                        <option value="refunded">Refunded</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        </>
                        )}
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
                    {mode === 'account' ? (
                        <button
                            type="button"
                            className="btn-secondary"
                            disabled={loading}
                            onClick={async () => {
                                const id = studentAccountId(enrollment);
                                if (!id) return;
                                setLoading(true);
                                try {
                                    const token = getAuthToken();
                                    const mailRes = await axios.post(
                                        `${API_BASE_URL}/api/users/${id}/login-email`,
                                        { force: true },
                                        { headers: { Authorization: `Bearer ${token}` } }
                                    );
                                    const notice = formatLoginEmailNotice(mailRes.data.loginEmail);
                                    const nextFields = mailRes.data.user || {};
                                    setLoginEmailState((prev) => ({
                                        ...(prev || enrollment?.student || {}),
                                        ...nextFields,
                                    }));
                                    onLoginEmailUpdated?.(nextFields);
                                    showAlert(
                                        notice || mailRes.data.loginEmail?.error || 'Login email was not sent.',
                                        notice ? 'success' : 'warning'
                                    );
                                } catch (mailErr) {
                                    showAlert(mailErr.response?.data?.error || 'Failed to send login email', 'error');
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            <i className="fas fa-envelope" aria-hidden /> Email student card
                        </button>
                    ) : null}
                    {mode === 'course' ? (
                        <button
                            type="button"
                            className="btn-secondary"
                            disabled={loading}
                            onClick={async () => {
                                try {
                                    setLoading(true);
                                    const token = getAuthToken();
                                    const res = await axios.post(
                                        `${API_BASE_URL}/api/enrollments/${enrollment._id}/skip-fee-month`,
                                        {},
                                        { headers: { Authorization: `Bearer ${token}` } }
                                    );
                                    if (res.data.success) {
                                        showAlert('This month was skipped. Next due date is next month.', 'success');
                                        onSaved?.(res.data.enrollment);
                                        if (res.data.enrollment?.feeDueDate) {
                                            setFormData((prev) => ({
                                                ...prev,
                                                feeDueDate: toDateInputValue(res.data.enrollment.feeDueDate),
                                            }));
                                        }
                                    }
                                } catch (error) {
                                    const msg = error.response?.data?.error || error.response?.data?.message || error.message;
                                    showAlert(msg, 'error');
                                } finally {
                                    setLoading(false);
                                }
                            }}
                        >
                            Skip this month
                        </button>
                    ) : null}
                    <button type="button" className="btn-primary btn-save" onClick={handleSave} disabled={loading}>
                        {loading ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i> Saving...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-save"></i> {mode === 'account' ? 'Save Account' : 'Save Course'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditEnrollmentModal;
