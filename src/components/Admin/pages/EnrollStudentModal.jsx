import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import './EnrollStudentModal.scss';

const EnrollStudentModal = ({ isOpen, onClose, onEnrollSuccess, courses }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [backendConnected, setBackendConnected] = useState(true);
    
    // Form data
    const [formData, setFormData] = useState({
        studentName: '',
        studentEmail: '',
        courseId: '',
        enrollmentDate: new Date().toISOString().split('T')[0],
        status: 'pending',
        progress: 0,
        grade: ''
    });

    // Status options
    const statusOptions = [
        { value: 'pending', label: 'Pending', color: '#f59e0b' },
        { value: 'active', label: 'Active', color: '#10b981' },
        { value: 'completed', label: 'Completed', color: 'var(--color-accent)' },
        { value: 'inactive', label: 'Inactive', color: '#64748b' }
    ];

    // Grade options
    const gradeOptions = [
        { value: '', label: 'Not Graded' },
        { value: 'A+', label: 'A+ (Excellent)' },
        { value: 'A', label: 'A (Very Good)' },
        { value: 'A-', label: 'A- (Good)' },
        { value: 'B+', label: 'B+ (Above Average)' },
        { value: 'B', label: 'B (Average)' },
        { value: 'C', label: 'C (Below Average)' },
        { value: 'D', label: 'D (Poor)' },
        { value: 'F', label: 'F (Fail)' }
    ];

    // Lock body scroll when modal is open so background page doesn't scroll
    useEffect(() => {
        if (isOpen) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev || ''; };
        }
    }, [isOpen]);

    // Check backend connection on open
    useEffect(() => {
        if (isOpen) {
            checkBackendConnection();
        }
    }, [isOpen]);

    const checkBackendConnection = async () => {
        try {
            await axios.get('http://localhost:5000/health');
            setBackendConnected(true);
        } catch {
            setBackendConnected(false);
            setError('Backend server is not responding. Enrollment data will not be saved.');
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            // Validation
            if (!formData.studentName.trim()) {
                throw new Error('Student name is required');
            }
            if (!formData.studentEmail.trim()) {
                throw new Error('Student email is required');
            }
            if (!formData.courseId) {
                throw new Error('Please select a course');
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.studentEmail)) {
                throw new Error('Please enter a valid email address');
            }

            // Create enrollment data for backend
            const enrollmentData = {
                studentName: formData.studentName.trim(),
                studentEmail: formData.studentEmail.trim().toLowerCase(),
                courseId: formData.courseId,
                enrollmentDate: formData.enrollmentDate,
                status: formData.status,
                progress: parseInt(formData.progress) || 0,
                grade: formData.grade || null
            };

            console.log('Sending enrollment data to backend:', enrollmentData);

            // Check if we have courses
            if (!courses || courses.length === 0) {
                throw new Error('No courses available. Please create a course first.');
            }

            // Check backend connection
            if (!backendConnected) {
                throw new Error('Cannot connect to server. Please check backend connection.');
            }

            // Get token
            const token = getAuthToken();
            if (!token) {
                throw new Error('Admin session expired. Please login again.');
            }

            // Send to backend API - REAL DATABASE SAVE
            const response = await axios.post(
                'http://localhost:5000/api/enrollments', 
                enrollmentData, 
                {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('Backend response:', response.data);

            if (response.data.success) {
                const newEnrollment = response.data.enrollment;
                
                setSuccess(`Student enrolled successfully! Data saved to MongoDB.`);
                
                // Call success callback with REAL data from backend
                if (onEnrollSuccess) {
                    onEnrollSuccess(newEnrollment);
                }
                
                // Close modal after 2 seconds
                setTimeout(() => {
                    handleClose();
                }, 2000);
                
            } else {
                throw new Error(response.data.message || 'Failed to enroll student');
            }

        } catch (err) {
            console.error('Enrollment error:', err);
            
            // Handle specific error cases
            if (err.response) {
                // Backend returned an error
                if (err.response.status === 400) {
                    setError(err.response.data.message || 'Invalid data provided');
                } else if (err.response.status === 401) {
                    setError('Session expired. Please login again.');
                } else if (err.response.status === 404) {
                    setError('Course not found. Please select a different course.');
                } else {
                    setError(`Server error: ${err.response.data.message || err.message}`);
                }
            } else if (err.request) {
                // No response received
                setError('Cannot connect to server. Please check if backend is running on port 5000.');
                setBackendConnected(false);
            } else {
                // Other errors
                setError(err.message || 'Failed to enroll student');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        // Reset form
        setFormData({
            studentName: '',
            studentEmail: '',
            courseId: '',
            enrollmentDate: new Date().toISOString().split('T')[0],
            status: 'pending',
            progress: 0,
            grade: ''
        });
        setError('');
        setSuccess('');
        setBackendConnected(true);
        onClose();
    };

    const handleStatusSelect = (statusValue) => {
        setFormData(prev => ({
            ...prev,
            status: statusValue
        }));
    };

    const getSelectedCourse = () => {
        return courses.find(c => c._id === formData.courseId);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay enroll-modal-overlay">
            <div className="modal-container enroll-modal-container">
                <div className="modal-header enroll-modal-header">
                    <h2><i className="fas fa-user-plus"></i> Enroll New Student</h2>
                    <div className="modal-subtitle">
                        <span className={`backend-status ${backendConnected ? 'connected' : 'disconnected'}`}>
                            <i className={`fas fa-${backendConnected ? 'database' : 'exclamation-triangle'}`}></i>
                            {backendConnected ? 'Connected to MongoDB' : 'Backend disconnected'}
                        </span>
                    </div>
                    <button type="button" className="close-btn" onClick={handleClose} disabled={loading}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                {error && (
                    <div className="alert alert-error">
                        <i className="fas fa-exclamation-circle"></i>
                        <div className="alert-content">
                            <strong>Error:</strong> {error}
                            {error.includes('Cannot connect') && (
                                <small>Make sure backend server is running on http://localhost:5000</small>
                            )}
                        </div>
                        <button type="button" onClick={() => setError('')} className="alert-close">×</button>
                    </div>
                )}

                {success && (
                    <div className="alert alert-success">
                        <i className="fas fa-check-circle"></i>
                        <div className="alert-content">
                            <strong>Success!</strong> {success}
                            <small>Data saved permanently in database.</small>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="enrollment-form">
                    {/* Scrollable form body: cursor (desktop) and touch (mobile/tablet) scroll only inside this area */}
                    <div className="enrollment-form-scroll">
                        <div className="form-grid">
                            {/* Student Information */}
                            <div className="form-section form-card">
                                <h3><i className="fas fa-user"></i> Student Information</h3>
                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-user-circle"></i> Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        name="studentName"
                                        value={formData.studentName}
                                        onChange={handleChange}
                                        placeholder="Enter student's full name"
                                        required
                                        className="form-input"
                                        disabled={loading || success}
                                    />
                                    <small className="form-help">This will create a student account</small>
                                </div>
                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-envelope"></i> Email Address *
                                    </label>
                                    <input
                                        type="email"
                                        name="studentEmail"
                                        value={formData.studentEmail}
                                        onChange={handleChange}
                                        placeholder="student@example.com"
                                        required
                                        className="form-input"
                                        disabled={loading || success}
                                    />
                                    <small className="form-help">Student's login email</small>
                                </div>
                            </div>

                            {/* Course & Enrollment Details */}
                            <div className="form-section form-card">
                                <h3><i className="fas fa-book"></i> Course Details</h3>
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
                                        <option value="">{courses.length === 0 ? 'No courses available' : 'Choose a course...'}</option>
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

                                {/* Calendar-style enrollment date */}
                                <div className="form-group enrollment-date-block">
                                    <label>
                                        <i className="fas fa-calendar-alt"></i> Enrollment Date
                                    </label>
                                    <div className="calendar-date-wrapper">
                                        <i className="fas fa-calendar-check calendar-icon"></i>
                                        <input
                                            type="date"
                                            name="enrollmentDate"
                                            value={formData.enrollmentDate}
                                            onChange={handleChange}
                                            className="form-input calendar-input"
                                            disabled={loading || success}
                                            max={new Date().toISOString().split('T')[0]}
                                            title="Pick enrollment date"
                                        />
                                        <span className="calendar-hint">Click to open calendar</span>
                                    </div>
                                    <small className="form-help">Date of enrollment</small>
                                </div>

                                <div className="form-group">
                                    <label>
                                        <i className="fas fa-percentage"></i> Initial Progress (%)
                                    </label>
                                    <input
                                        type="number"
                                        name="progress"
                                        value={formData.progress}
                                        onChange={handleChange}
                                        min="0"
                                        max="100"
                                        className="form-input"
                                        disabled={loading || success}
                                    />
                                    <small className="form-help">Starting progress percentage</small>
                                </div>
                            </div>

                            {/* Status & Grading */}
                            <div className="form-section form-card">
                                <h3><i className="fas fa-cog"></i> Status & Grading</h3>
                                <div className="form-row">
                                    <div className="form-group half">
                                        <label>
                                            <i className="fas fa-toggle-on"></i> Enrollment Status
                                        </label>
                                        <div className="status-buttons">
                                            {statusOptions.map(status => (
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
                                        <input type="hidden" name="status" value={formData.status} />
                                    </div>
                                    <div className="form-group half">
                                        <label>
                                            <i className="fas fa-star"></i> Initial Grade (Optional)
                                        </label>
                                        <select
                                            name="grade"
                                            value={formData.grade}
                                            onChange={handleChange}
                                            className="form-select"
                                            disabled={loading || success}
                                        >
                                            {gradeOptions.map(grade => (
                                                <option key={grade.value} value={grade.value}>
                                                    {grade.label}
                                                </option>
                                            ))}
                                        </select>
                                        <small className="form-help">Set initial grade if applicable</small>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Database Preview */}
                        <div className="preview-section">
                            <h3><i className="fas fa-database"></i> Database Preview</h3>
                            <div className="preview-card">
                                <div className="preview-header">
                                    <span className="preview-student">
                                        <i className="fas fa-user"></i> {formData.studentName || 'New Student'}
                                    </span>
                                    <span className={`preview-status ${formData.status}`}>
                                        <i className="fas fa-database"></i> MongoDB Ready
                                    </span>
                                </div>
                                <div className="preview-body">
                                    <div className="preview-grid">
                                        <div>
                                            <p><strong>Email:</strong> {formData.studentEmail || 'student@example.com'}</p>
                                            <p><strong>Course:</strong> {getSelectedCourse()?.title || 'No course selected'}</p>
                                        </div>
                                        <div>
                                            <p><strong>Progress:</strong> {formData.progress}%</p>
                                            <p><strong>Status:</strong> <span className={`status-label ${formData.status}`}>{formData.status}</span></p>
                                        </div>
                                    </div>
                                    <div className="database-info">
                                        <i className="fas fa-info-circle"></i>
                                        <small>This data will be saved permanently in MongoDB database</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Form Actions - fixed at bottom of modal */}
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
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                                setFormData({
                                    studentName: '',
                                    studentEmail: '',
                                    courseId: '',
                                    enrollmentDate: new Date().toISOString().split('T')[0],
                                    status: 'pending',
                                    progress: 0,
                                    grade: ''
                                });
                                setError('');
                            }}
                            disabled={loading || success}
                        >
                            <i className="fas fa-redo"></i> Clear
                        </button>
                        
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={loading || success || !backendConnected || courses.length === 0}
                        >
                            {loading ? (
                                <>
                                    <i className="fas fa-spinner fa-spin"></i> Saving to Database...
                                </>
                            ) : success ? (
                                <>
                                    <i className="fas fa-check"></i> Saved Successfully
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-database"></i> Save to MongoDB
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {/* Database Connection Info */}
                {!backendConnected && (
                    <div className="connection-info">
                        <h4><i className="fas fa-server"></i> Backend Connection Required</h4>
                        <p>To save enrollments permanently, ensure backend server is running:</p>
                        <code>node backend/server.js</code>
                        <p className="connection-status">
                            <i className="fas fa-exclamation-triangle"></i>
                            Currently running in demo mode - data will not persist
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EnrollStudentModal;