import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import './EnrollStudentModal.scss';

/**
 * EnrollStudentModal
 *
 * Props:
 *  isOpen             - boolean
 *  onClose            - fn
 *  onEnrollSuccess    - fn(newEnrollment)
 *  courses            - array of course objects (passed from parent)
 *  preselectedStudent - optional: { _id, name, email, studentId, personalEmail } – skips student dropdown
 */
const EnrollStudentModal = ({ isOpen, onClose, onEnrollSuccess, courses, preselectedStudent }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [students, setStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(false);

    const [formData, setFormData] = useState({
        studentUserId: preselectedStudent?._id || '',
        studentId: preselectedStudent?.studentId || '',
        personalEmail: preselectedStudent?.personalEmail || '',
        courseId: '',
        status: 'pending',
    });

    const statusOptions = [
        { value: 'pending',   label: 'Pending',   color: '#f59e0b' },
        { value: 'active',    label: 'Active',     color: '#10b981' },
        { value: 'completed', label: 'Completed',  color: 'var(--color-accent)' },
        { value: 'inactive',  label: 'Inactive',   color: '#64748b' }
    ];

    // Lock body scroll
    useEffect(() => {
        if (isOpen) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev || ''; };
        }
    }, [isOpen]);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                studentUserId: preselectedStudent?._id || '',
                studentId: preselectedStudent?.studentId || '',
                personalEmail: preselectedStudent?.personalEmail || '',
                courseId: '',
                status: 'pending',
            });
            setError('');
            setSuccess('');
            if (!preselectedStudent) {
                fetchStudents();
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, preselectedStudent]);

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
                params: { segment: 'people', limit: 500 }
            });
            if (response.data.success) {
                // Treat missing isActive as active (legacy DB rows)
                const activeStudents = (response.data.users || []).filter(
                    (u) => u.role === 'student' && u.isActive !== false
                );
                setStudents(activeStudents);
            } else {
                setError(response.data.error || 'Failed to load students.');
                setStudents([]);
            }
        } catch (err) {
            setError(
                err.response?.data?.error ||
                    err.message ||
                    'Failed to load students. Check People tab and API connection.'
            );
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
                studentId: s ? (s.studentId || '') : '',
                personalEmail: s ? (s.personalEmail || '') : '',
            }));
            return;
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleStatusSelect = (statusValue) => {
        setFormData(prev => ({ ...prev, status: statusValue }));
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
            if (!formData.studentUserId) {
                throw new Error('Please select a student');
            }
            if (!formData.courseId) {
                throw new Error('Please select a course');
            }

            const personalTrim = (formData.personalEmail || '').trim();
            if (personalTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalTrim)) {
                throw new Error('Please enter a valid personal email, or leave it blank');
            }

            const studentIdTrim = (formData.studentId || '').trim();
            if (studentIdTrim && !/^GRT-\d{4}-\d{5}$/.test(studentIdTrim)) {
                throw new Error('Student ID must match GRT-YYYY-##### (e.g. GRT-2026-00042) or be left blank');
            }

            const token = getAuthToken();
            if (!token) {
                throw new Error('Admin session expired. Please login again.');
            }

            const selected = getSelectedStudent();
            if (
                selected?._id &&
                (personalTrim !== String(selected.personalEmail || '').trim() ||
                    (studentIdTrim && studentIdTrim !== String(selected.studentId || '').trim()))
            ) {
                await axios.put(
                    `${API_BASE_URL}/api/users/${selected._id}`,
                    { personalEmail: personalTrim, studentId: studentIdTrim || undefined },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
            }

            const payload = {
                studentUserId: formData.studentUserId,
                courseId: formData.courseId,
                status: formData.status,
            };

            const response = await axios.post(
                `${API_BASE_URL}/api/enrollments`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.success) {
                setSuccess('Student enrolled successfully!');
                if (onEnrollSuccess) {
                    onEnrollSuccess(response.data.enrollment);
                }
                setTimeout(() => { handleClose(); }, 1500);
            } else {
                throw new Error(response.data.message || 'Failed to enroll student');
            }
        } catch (err) {
            if (err.response) {
                setError(err.response.data.message || 'Server error. Please try again.');
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
        setFormData({
            studentUserId: preselectedStudent?._id || '',
            studentId: preselectedStudent?.studentId || '',
            personalEmail: preselectedStudent?.personalEmail || '',
            courseId: '',
            status: 'pending',
        });
        setError('');
        setSuccess('');
        onClose();
    };

    const getSelectedCourse = () => courses.find((c) => c._id === formData.courseId);

    if (!isOpen) return null;

    const selectedStudent = getSelectedStudent();

    return (
        <div className="modal-overlay enroll-modal-overlay">
            <div className="modal-container enroll-modal-container">
                <div className="modal-header enroll-modal-header">
                    <h2>
                        <i className="fas fa-user-plus"></i>{' '}
                        {preselectedStudent
                            ? `Enroll ${preselectedStudent.name} in a Course`
                            : 'Enroll Student in Course'}
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

                            {/* Student Selection */}
                            <div className="form-section form-card">
                                <h3><i className="fas fa-user-graduate"></i> Student</h3>

                                {preselectedStudent ? (
                                    <div className="preselected-student-card">
                                        <div className="student-avatar-large">
                                            {preselectedStudent.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="student-info-details">
                                            <strong>{preselectedStudent.name}</strong>
                                            {preselectedStudent.studentId && (
                                                <span className="student-id-badge">
                                                    <i className="fas fa-id-card"></i> {preselectedStudent.studentId}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="form-group">
                                        <label>
                                            <i className="fas fa-search"></i> Select Student *
                                        </label>
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
                                                disabled={loading || success || students.length === 0}
                                            >
                                                <option value="">
                                                    {students.length === 0
                                                        ? 'No students — add a learner with role “Student” in People'
                                                        : 'Choose a student...'}
                                                </option>
                                                {students.map(s => (
                                                    <option key={s._id} value={s._id}>
                                                        {s.studentId ? `[${s.studentId}] ` : ''}{s.name} — {s.email}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {students.length === 0 && !studentsLoading && (
                                            <small className="form-error">
                                                This list only includes users with role <strong>Student</strong> in People.
                                                Teachers and parents do not appear here.
                                            </small>
                                        )}
                                        {selectedStudent && (
                                            <div className="selected-student-preview">
                                                <i className="fas fa-user-check"></i>
                                                <span>{selectedStudent.name}</span>
                                                {selectedStudent.studentId && (
                                                    <span className="student-id-badge">
                                                        {selectedStudent.studentId}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(preselectedStudent || formData.studentUserId) && selectedStudent && (
                                    <>
                                        <div className="form-group">
                                            <label>
                                                <i className="fas fa-key"></i> Portal login email (People)
                                            </label>
                                            <div className="portal-email-readonly">
                                                {selectedStudent.email || '—'}
                                            </div>
                                            <small className="form-hint">Used to sign in to the Gorythm student portal. Edit this in People if needed.</small>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="enroll-student-id">
                                                <i className="fas fa-id-card"></i> Student ID (GRT-YYYY-#####)
                                            </label>
                                            <input
                                                id="enroll-student-id"
                                                type="text"
                                                name="studentId"
                                                value={formData.studentId}
                                                onChange={handleChange}
                                                className="form-input"
                                                placeholder="GRT-2026-00042"
                                                disabled={loading || success}
                                            />
                                            <small className="form-hint">Optional. If entered, it will be saved to the student account.</small>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="enroll-personal-email">
                                                <i className="fas fa-envelope"></i> Personal email (optional)
                                            </label>
                                            <input
                                                id="enroll-personal-email"
                                                type="email"
                                                name="personalEmail"
                                                value={formData.personalEmail}
                                                onChange={handleChange}
                                                className="form-input"
                                                placeholder="gmail.com, hotmail.com, etc."
                                                autoComplete="email"
                                                disabled={loading || success}
                                            />
                                            <small className="form-hint">Separate from portal login; for contact only.</small>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Course & status */}
                            <div className="form-section form-card">
                                <h3><i className="fas fa-book"></i> Course &amp; status</h3>

                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-graduation-cap"></i> Select Course *
                                    </label>
                                    <select
                                        name="courseId"
                                        value={formData.courseId}
                                        onChange={handleChange}
                                        required
                                        className="form-select"
                                        disabled={loading || success || courses.length === 0}
                                    >
                                        <option value="">
                                            {courses.length === 0 ? 'No courses available' : 'Choose a course...'}
                                        </option>
                                        {courses.map(course => (
                                            <option key={course._id} value={course._id}>
                                                {course.title} ({course.category})
                                            </option>
                                        ))}
                                    </select>
                                    {courses.length === 0 && (
                                        <small className="form-error">Create courses first in Courses Management</small>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-toggle-on"></i> Enrollment status
                                    </label>
                                    <div className="status-buttons">
                                        {statusOptions.map((status) => (
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
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="preview-section">
                            <h3><i className="fas fa-eye"></i> Preview</h3>
                            <div className="preview-card">
                                <div className="preview-header">
                                    <span className="preview-student">
                                        <i className="fas fa-user"></i>{' '}
                                        {selectedStudent?.name || '—'}
                                        {selectedStudent?.studentId && (
                                            <span className="student-id-badge" style={{ marginLeft: 8 }}>
                                                {selectedStudent.studentId}
                                            </span>
                                        )}
                                    </span>
                                    <span className={`preview-status ${formData.status}`}>
                                        {formData.status}
                                    </span>
                                </div>
                                <div className="preview-body">
                                    <div className="preview-grid">
                                        <div>
                                            <p><strong>Portal email:</strong> {selectedStudent?.email || '—'}</p>
                                            <p><strong>Student ID:</strong> {formData.studentId?.trim() || selectedStudent?.studentId || '—'}</p>
                                            <p><strong>Personal email:</strong> {formData.personalEmail?.trim() || '—'}</p>
                                            <p><strong>Course:</strong> {getSelectedCourse()?.title || '—'}</p>
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
                            disabled={loading || success || courses.length === 0 || (!preselectedStudent && students.length === 0)}
                        >
                            {loading ? (
                                <><i className="fas fa-spinner fa-spin"></i> Saving...</>
                            ) : success ? (
                                <><i className="fas fa-check"></i> Enrolled!</>
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
