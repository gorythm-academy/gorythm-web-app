import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { formatScheduleLabel } from '../../../utils/formatScheduleLabel';
import { portalEmailDisplayLabel } from '../../../utils/studentPortalEmail';
import {
    ENROLLMENT_STATUS_BUTTONS,
    FEE_STATUS_VALUES,
    sortPublishedCourses,
    validatePersonalEmail,
    validateStudentId,
} from '../../../utils/studentAdminValidation';
import './EnrollStudentModal.scss';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';

/**
 * Enroll an existing student in a course.
 * When preselectedStudent is set (Add course flow): only name, course, and timeslot.
 */
const EnrollStudentModal = ({
    isOpen,
    onClose,
    onEnrollSuccess,
    courses,
    preselectedStudent,
    /** Optional defaults for status/fee when adding another course */
    defaultsFromEnrollment = null,
}) => {
    const isAddCourseMode = Boolean(preselectedStudent);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [students, setStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [courseSchedules, setCourseSchedules] = useState([]);
    const [schedulesLoading, setSchedulesLoading] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');

    const [formData, setFormData] = useState({
        studentUserId: preselectedStudent?._id || '',
        studentId: preselectedStudent?.studentId || '',
        personalEmail: preselectedStudent?.personalEmail || '',
        phone: preselectedStudent?.phone || '',
        courseId: '',
        assignedScheduleId: '',
        status: defaultsFromEnrollment?.status || 'active',
        paymentStatus: defaultsFromEnrollment?.paymentStatus || 'pending',
    });

    const sortedCourses = useMemo(() => sortPublishedCourses(courses), [courses]);

    const filteredStudents = useMemo(() => {
        const q = studentSearch.trim().toLowerCase();
        if (!q) return students;
        return students.filter((s) => {
            const haystack = [s.name, s.email, s.personalEmail, s.studentId, s.phone]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [students, studentSearch]);

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
        const inheritedStatus = defaultsFromEnrollment?.status || 'active';
        const inheritedFee = defaultsFromEnrollment?.paymentStatus || 'pending';
        setFormData({
            studentUserId: preselectedStudent?._id || '',
            studentId: preselectedStudent?.studentId || '',
            personalEmail: preselectedStudent?.personalEmail || '',
            phone: preselectedStudent?.phone || '',
            courseId: '',
            assignedScheduleId: '',
            status: inheritedStatus,
            paymentStatus: inheritedFee,
        });
        setError('');
        setSuccess('');
        setStudentSearch('');
        if (!preselectedStudent) fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, preselectedStudent, defaultsFromEnrollment]);

    useEffect(() => {
        if (!isOpen || preselectedStudent) return undefined;
        const timer = window.setTimeout(() => {
            fetchStudents();
        }, 300);
        return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentSearch, isOpen, preselectedStudent]);

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

    const fetchStudents = async () => {
        try {
            setStudentsLoading(true);
            const token = getAuthToken();
            if (!token) {
                setError('Please sign in again to load students.');
                setStudents([]);
                return;
            }
            const response = await axios.get(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    segment: 'students',
                    limit: 50,
                    search: studentSearch.trim() || undefined,
                    sortBy: 'student',
                    sortOrder: 'asc',
                },
            });
            if (response.data.success) {
                setStudents((response.data.users || []).filter((u) => u.role === 'student'));
            } else {
                setError(response.data.error || 'Failed to load students.');
                setStudents([]);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Failed to load students.');
            setStudents([]);
        } finally {
            setStudentsLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'studentUserId') {
            const s = students.find((u) => u._id === value);
            setFormData((prev) => ({
                ...prev,
                studentUserId: value,
                studentId: s ? s.studentId || '' : '',
                personalEmail: s ? s.personalEmail || '' : '',
                phone: s ? s.phone || '' : '',
            }));
            return;
        }
        if (name === 'courseId') {
            setFormData((prev) => ({ ...prev, courseId: value, assignedScheduleId: '' }));
            return;
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleStatusSelect = (statusValue) => {
        setFormData((prev) => ({ ...prev, status: statusValue }));
    };

    const getSelectedStudent = () => {
        if (preselectedStudent) return preselectedStudent;
        return students.find((s) => s._id === formData.studentUserId);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            if (!formData.studentUserId) throw new Error('Please select a student');
            if (!formData.courseId) throw new Error('Please select a course');
            if (!schedulesLoading && courseSchedules.length > 0 && !formData.assignedScheduleId) {
                throw new Error('Please select a class timeslot (includes teacher) for this course.');
            }

            const token = getAuthToken();
            if (!token) throw new Error('Admin session expired. Please login again.');

            if (!isAddCourseMode) {
                const personalTrim = (formData.personalEmail || '').trim();
                const personalErr = validatePersonalEmail(personalTrim);
                if (personalErr) throw new Error(personalErr);

                const studentIdTrim = (formData.studentId || '').trim();
                const studentIdErr = validateStudentId(studentIdTrim);
                if (studentIdErr) throw new Error(studentIdErr);

                const selected = getSelectedStudent();
                const currentPersonal = String(selected?.personalEmail || '').trim();
                const currentStudentId = String(selected?.studentId || '').trim();
                const currentPhone = String(selected?.phone || '').trim();
                const phoneTrim = (formData.phone || '').trim();

                if (
                    selected?._id &&
                    (personalTrim !== currentPersonal ||
                        (!!studentIdTrim && studentIdTrim !== currentStudentId) ||
                        phoneTrim !== currentPhone)
                ) {
                    await axios.put(
                        `${API_BASE_URL}/api/users/${selected._id}`,
                        {
                            name: selected.name || '',
                            email: selected.email || '',
                            personalEmail: personalTrim,
                            phone: phoneTrim,
                            ...(studentIdTrim ? { studentId: studentIdTrim } : {}),
                        },
                        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                    );
                }
            }

            const response = await axios.post(
                `${API_BASE_URL}/api/enrollments`,
                {
                    studentUserId: formData.studentUserId,
                    courseId: formData.courseId,
                    status: formData.status,
                    paymentStatus: formData.paymentStatus,
                    assignedScheduleId: formData.assignedScheduleId || undefined,
                    forceNew: isAddCourseMode,
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            if (response.data.success) {
                setSuccess(isAddCourseMode ? 'Course added successfully!' : 'Student enrolled successfully!');
                onEnrollSuccess?.(response.data.enrollment);
                setTimeout(() => handleClose(), 1200);
            } else {
                throw new Error(response.data.message || 'Failed to enroll student');
            }
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.code === 'TRASHED_COURSE_EXISTS') {
                const ok = window.confirm(
                    `${err.response.data.message}\n\nCreate a new active enrollment anyway?`
                );
                if (ok) {
                    try {
                        const token = getAuthToken();
                        const retry = await axios.post(
                            `${API_BASE_URL}/api/enrollments`,
                            {
                                studentUserId: formData.studentUserId,
                                courseId: formData.courseId,
                                status: formData.status,
                                paymentStatus: formData.paymentStatus,
                                assignedScheduleId: formData.assignedScheduleId || undefined,
                                forceNew: isAddCourseMode,
                                confirmRestoreTrashed: true,
                            },
                            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                        );
                        if (retry.data.success) {
                            setSuccess(isAddCourseMode ? 'Course added successfully!' : 'Student enrolled successfully!');
                            onEnrollSuccess?.(retry.data.enrollment);
                            setTimeout(() => handleClose(), 1200);
                            return;
                        }
                    } catch (retryErr) {
                        setError(
                            retryErr.response?.data?.message
                            || retryErr.message
                            || 'Failed to enroll after confirm'
                        );
                        return;
                    }
                }
                setError(err.response.data.message || 'Course exists in Quarantine.');
                return;
            }
            if (err.response) {
                const data = err.response.data || {};
                setError(data.error || data.message || 'Server error. Please try again.');
            } else if (err.request) {
                setError('Cannot connect to server. Please check backend is running.');
            } else {
                setError(err.message || 'Failed to enroll student');
            }
        } finally {
            setLoading(false);
        }
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

    if (!isOpen) return null;

    const selectedStudent = getSelectedStudent();

    return (
        <div className="modal-overlay enroll-modal-overlay">
            <div className={`modal-container enroll-modal-container${isAddCourseMode ? ' enroll-modal-container--add-course' : ''}`}>
                <div className="modal-header enroll-modal-header">
                    <h2>
                        <i className={`fas ${isAddCourseMode ? 'fa-plus' : 'fa-user-graduate'}`}></i>{' '}
                        {isAddCourseMode
                            ? `Add course — ${preselectedStudent.name}`
                            : 'Enroll Existing Student'}
                    </h2>
                    <button type="button" className="close-btn" onClick={handleClose} disabled={loading} aria-label="Close">
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {error && (
                    <div className="alert alert-error">
                        <i className="fas fa-exclamation-circle"></i>
                        <div className="alert-content">
                            <strong>Error:</strong> {error}
                        </div>
                        <button type="button" onClick={() => setError('')} className="alert-close">×</button>
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
                                <h3><i className="fas fa-user-graduate"></i> Student</h3>

                                {isAddCourseMode ? (
                                    <div className="preselected-student-card">
                                        <div className="student-avatar-large">
                                            {preselectedStudent.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="student-info-details">
                                            <strong>{preselectedStudent.name}</strong>
                                            <small className="form-hint" style={{ display: 'block', marginTop: 6 }}>
                                                Profile, fee defaults, and status are taken from this student’s existing record.
                                            </small>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="form-group">
                                            <label><i className="fas fa-search"></i> Select Student *</label>
                                            <input
                                                type="search"
                                                className="form-input"
                                                placeholder="Search by name, ID, email, or phone…"
                                                value={studentSearch}
                                                onChange={(e) => setStudentSearch(e.target.value)}
                                                disabled={loading || success}
                                            />
                                            {studentsLoading ? (
                                                <div className="loading-inline">
                                                    <i className="fas fa-spinner fa-spin"></i> Loading students...
                                                </div>
                                            ) : (
                                                <select
                                                    name="studentUserId"
                                                    value={formData.studentUserId}
                                                    onChange={handleChange}
                                                    required
                                                    className="form-select"
                                                    disabled={loading || success || filteredStudents.length === 0}
                                                >
                                                    <option value="">
                                                        {filteredStudents.length === 0
                                                            ? 'No students match your search'
                                                            : 'Choose a student...'}
                                                    </option>
                                                    {filteredStudents.map((s) => (
                                                        <option key={s._id} value={s._id}>
                                                            {s.studentId ? `[${s.studentId}] ` : ''}
                                                            {s.name} — {portalEmailDisplayLabel(s.email)}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                        {(formData.studentUserId) && selectedStudent && (
                                            <>
                                                <div className="form-group">
                                                    <label><i className="fas fa-key"></i> Portal login email</label>
                                                    <div className="portal-email-readonly">
                                                        <span className="admin-email">{portalEmailDisplayLabel(selectedStudent.email)}</span>
                                                    </div>
                                                </div>
                                                <div className="form-group">
                                                    <label htmlFor="enroll-student-id">
                                                        <i className="fas fa-id-card"></i> Student ID
                                                    </label>
                                                    <input
                                                        id="enroll-student-id"
                                                        type="text"
                                                        name="studentId"
                                                        value={formData.studentId}
                                                        onChange={handleChange}
                                                        className="form-input"
                                                        disabled={loading || success}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label htmlFor="enroll-personal-email">Personal email</label>
                                                    <input
                                                        id="enroll-personal-email"
                                                        type="email"
                                                        name="personalEmail"
                                                        value={formData.personalEmail}
                                                        onChange={handleChange}
                                                        className="form-input"
                                                        disabled={loading || success}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label htmlFor="enroll-phone">Phone</label>
                                                    <input
                                                        id="enroll-phone"
                                                        type="tel"
                                                        name="phone"
                                                        value={formData.phone}
                                                        onChange={handleChange}
                                                        className="form-input"
                                                        disabled={loading || success}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="form-section form-card">
                                <h3><i className="fas fa-book"></i> Course &amp; timeslot</h3>

                                <div className="form-group">
                                    <label><i className="fas fa-graduation-cap"></i> Select Course *</label>
                                    <select
                                        name="courseId"
                                        value={formData.courseId}
                                        onChange={handleChange}
                                        required
                                        className="form-select"
                                        disabled={loading || success || sortedCourses.length === 0}
                                    >
                                        <option value="">
                                            {sortedCourses.length === 0 ? 'No courses available' : 'Choose a course...'}
                                        </option>
                                        {sortedCourses.map((course) => (
                                            <option key={course._id} value={course._id}>
                                                {course.title}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {formData.courseId ? (
                                    <div className="form-group">
                                        <label>
                                            <i className="fas fa-clock"></i> Teacher &amp; timeslot
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
                                                      ? 'Select teacher & timeslot…'
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
                                                This course has no class slots. Add them under LMS → Class schedules.
                                            </small>
                                        ) : (
                                            <small className="form-hint">
                                                Each timeslot includes the assigned teacher.
                                            </small>
                                        )}
                                    </div>
                                ) : null}

                                {!isAddCourseMode ? (
                                    <>
                                        <div className="form-group">
                                            <label>Enrollment status</label>
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
                                            <label htmlFor="enroll-fee-status">Fee status</label>
                                            <select
                                                id="enroll-fee-status"
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
                                    </>
                                ) : null}
                            </div>
                        </div>

                        {!isAddCourseMode ? (
                            <div className="preview-section">
                                <h3><i className="fas fa-eye"></i> Preview</h3>
                                <div className="preview-card">
                                    <div className="preview-header">
                                        <span className="preview-student">
                                            <i className="fas fa-user"></i> {selectedStudent?.name || '—'}
                                        </span>
                                        <span className={`preview-status ${formData.status}`}>{formData.status}</span>
                                    </div>
                                    <div className="preview-body">
                                        <p><strong>Course:</strong> {getSelectedCourse()?.title || '—'}</p>
                                        <p><strong>Fee status:</strong> {formData.paymentStatus}</p>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-secondary" onClick={handleClose} disabled={loading}>
                            <i className="fas fa-times"></i> Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary btn-add"
                            disabled={
                                loading ||
                                success ||
                                sortedCourses.length === 0 ||
                                (!preselectedStudent && students.length === 0)
                            }
                        >
                            {loading ? (
                                <><i className="fas fa-spinner fa-spin"></i> Saving...</>
                            ) : success ? (
                                <><i className="fas fa-check"></i> {isAddCourseMode ? 'Added!' : 'Enrolled!'}</>
                            ) : isAddCourseMode ? (
                                <><i className="fas fa-plus"></i> Add course</>
                            ) : (
                                <><i className="fas fa-user-graduate"></i> Enroll Student</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EnrollStudentModal;
