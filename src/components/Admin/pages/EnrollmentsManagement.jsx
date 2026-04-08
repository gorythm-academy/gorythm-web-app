import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import EnrollStudentModal from './EnrollStudentModal';
import './EnrollmentsManagement.scss';

const COLUMN_DEFS = ['checkbox', 'student', 'course', 'enrollmentDate', 'progress', 'status', 'lastAccessed', 'grade', 'action'];
const DEFAULT_COLUMN_WIDTHS = [60, 240, 260, 150, 160, 180, 140, 100, 170];
const COLUMN_MIN_WIDTHS = [50, 160, 160, 110, 110, 120, 110, 80, 130];
const COLUMN_MAX_WIDTHS = [90, 380, 420, 280, 260, 320, 240, 180, 280];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const EnrollmentsManagement = () => {
    const [enrollments, setEnrollments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedEnrollments, setSelectedEnrollments] = useState([]);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [editingEnrollment, setEditingEnrollment] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [stats, setStats] = useState({
        totalEnrollments: 0,
        activeEnrollments: 0,
        completedEnrollments: 0,
        pendingEnrollments: 0,
	inactiveEnrollments: 0
    });
    
    // Modal state
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [courses, setCourses] = useState([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const tableContainerRef = useRef(null);
    const dragStateRef = useRef({
        isDragging: false,
        startX: 0,
        startScrollLeft: 0,
    });
    const [isTableDragging, setIsTableDragging] = useState(false);
    const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
    const [sortBy, setSortBy] = useState('enrollmentDate');
    const [sortOrder, setSortOrder] = useState('desc');

    const calculateStats = useCallback((data = []) => {
        const total = data.length;
        const active = data.filter(e => e.status === 'active').length;
        const completed = data.filter(e => e.status === 'completed').length;
        const pending = data.filter(e => e.status === 'pending').length;
        const inactive = data.filter(e => e.status === 'inactive').length;
            
        setStats({
            totalEnrollments: total,
            activeEnrollments: active,
            completedEnrollments: completed,
            pendingEnrollments: pending,
            inactiveEnrollments: inactive
        });
    }, []);

    const fetchEnrollments = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage('');
            
            const token = getAuthToken();
            if (!token) {
                throw new Error('No authentication token found');
            }

            const response = await axios.get('http://localhost:5000/api/enrollments', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (response.data.success) {
                setEnrollments(response.data.enrollments || []);
                calculateStats(response.data.enrollments || []);
                setLoading(false);
            } else {
                throw new Error(response.data.message || 'Failed to fetch enrollments');
            }
            
        } catch (error) {
            console.error('Error fetching enrollments:', error);
            setErrorMessage(error.response?.data?.message || error.message || 'Failed to load enrollments');
            setEnrollments([]);
            calculateStats([]);
            setLoading(false);
        }
    }, [calculateStats]);

    const fetchCourses = useCallback(async () => {
        try {
            const token = getAuthToken();
            const response = await axios.get('http://localhost:5000/api/courses', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.courses) {
                setCourses(response.data.courses);
            }
        } catch (error) {
            console.error('Error fetching courses:', error);
            setCourses([]);
        }
    }, []);

    useEffect(() => {
        fetchEnrollments();
        fetchCourses();
    }, [fetchEnrollments, fetchCourses]);

    // 👇 ADD THIS NEW useEffect HERE 👇
    useEffect(() => {
        const checkTableScroll = () => {
            const tableContainer = document.querySelector('.enrollments-table-container');
            const table = document.querySelector('.enrollments-table');
            
            if (tableContainer && table) {
                if (table.scrollWidth > tableContainer.clientWidth) {
                    tableContainer.classList.add('has-scroll');
                } else {
                    tableContainer.classList.remove('has-scroll');
                }
            }
        };
        
        // Check on mount and when enrollments change
        checkTableScroll();
        
        // Add event listener for window resize
        window.addEventListener('resize', checkTableScroll);
        
        return () => {
            window.removeEventListener('resize', checkTableScroll);
        };
    }, [enrollments]); // Run when enrollments change
    // 👆 NEW useEffect ENDS HERE 👆

    const startTableDragScroll = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, label, .col-resizer')) return;

        const el = tableContainerRef.current;
        if (!el) return;

        dragStateRef.current = {
            isDragging: true,
            startX: e.clientX,
            startScrollLeft: el.scrollLeft,
        };
        setIsTableDragging(true);
    };

    const onTableDragScroll = (e) => {
        const el = tableContainerRef.current;
        const dragState = dragStateRef.current;
        if (!el || !dragState.isDragging) return;
        const deltaX = e.clientX - dragState.startX;
        el.scrollLeft = dragState.startScrollLeft - deltaX;
    };

    const stopTableDragScroll = () => {
        if (!dragStateRef.current.isDragging) return;
        dragStateRef.current.isDragging = false;
        setIsTableDragging(false);
    };

    const startColumnResize = (e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = columnWidths[colIndex];
        const minWidth = COLUMN_MIN_WIDTHS[colIndex] ?? 80;
        const maxWidth = COLUMN_MAX_WIDTHS[colIndex] ?? 600;
        let rafId = null;
        let latestWidth = startWidth;

        const onPointerMove = (ev) => {
            latestWidth = clamp(startWidth + (ev.clientX - startX), minWidth, maxWidth);
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                setColumnWidths((prev) => {
                    const next = [...prev];
                    next[colIndex] = latestWidth;
                    return next;
                });
            });
        };

        const stop = () => {
            window.removeEventListener('pointermove', onPointerMove);
            if (rafId) window.cancelAnimationFrame(rafId);
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
        document.body.style.cursor = 'col-resize';
    };

    const resetColumnWidth = (colIndex) => {
        setColumnWidths((prev) => {
            const next = [...prev];
            next[colIndex] = DEFAULT_COLUMN_WIDTHS[colIndex];
            return next;
        });
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(column);
            setSortOrder(column === 'enrollmentDate' || column === 'lastAccessed' ? 'desc' : 'asc');
        }
    };

    const toggleEnrollmentSelection = (enrollmentId) => {
        setSelectedEnrollments(prev => 
            prev.includes(enrollmentId) 
                ? prev.filter(id => id !== enrollmentId)
                : [...prev, enrollmentId]
        );
    };

    useEffect(() => {
        setShowBulkActions(selectedEnrollments.length > 0);
    }, [selectedEnrollments]);

    const toggleAllEnrollments = () => {
        if (selectedEnrollments.length === filteredEnrollments.length) {
            setSelectedEnrollments([]);
        } else {
            setSelectedEnrollments(filteredEnrollments.map(enrollment => enrollment._id));
        }
    };

    const updateSelectedStatus = async (newStatus) => {
        if (!selectedEnrollments.length) return;
        
        if (window.confirm(`Change status to "${newStatus}" for ${selectedEnrollments.length} enrollment(s)?`)) {
            try {
                const token = getAuthToken();
                const response = await axios.post('http://localhost:5000/api/enrollments/bulk-update', {
                    enrollmentIds: selectedEnrollments,
                    status: newStatus
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (response.data.success) {
                    // Update local state
                    const updated = enrollments.map(enrollment => 
                        selectedEnrollments.includes(enrollment._id) 
                            ? { 
                                ...enrollment, 
                                status: newStatus,
                                ...(newStatus === 'completed' && { completionDate: new Date().toISOString() })
                            }
                            : enrollment
                    );
                    setEnrollments(updated);
                    calculateStats(updated);
                    setSelectedEnrollments([]);
                    
                    setSuccessMessage(`Status updated for ${selectedEnrollments.length} enrollment(s)`);
                    setTimeout(() => setSuccessMessage(''), 3000);
                }
            } catch (error) {
                setErrorMessage(error.response?.data?.message || 'Failed to update status');
            }
        }
    };

    const deleteSelectedEnrollments = async () => {
        if (!selectedEnrollments.length || !window.confirm(`Delete ${selectedEnrollments.length} selected enrollment(s)?`)) {
            return;
        }

        try {
            const token = getAuthToken();
            
            // Delete each enrollment
            for (const enrollmentId of selectedEnrollments) {
                await axios.delete(`http://localhost:5000/api/enrollments/${enrollmentId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            // Update local state
            const updated = enrollments.filter(enrollment => !selectedEnrollments.includes(enrollment._id));
            setEnrollments(updated);
            setSelectedEnrollments([]);
            calculateStats(updated);
            
            setSuccessMessage(`${selectedEnrollments.length} enrollment(s) deleted successfully`);
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            setErrorMessage(error.response?.data?.message || 'Failed to delete enrollments');
        }
    };

    const updateEnrollmentStatus = async (enrollmentId, newStatus) => {
        try {
            const token = getAuthToken();
            const response = await axios.put(`http://localhost:5000/api/enrollments/${enrollmentId}`, {
                status: newStatus
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                const updated = enrollments.map(enrollment => 
                    enrollment._id === enrollmentId 
                        ? { 
                            ...enrollment, 
                            status: newStatus,
                            ...(newStatus === 'completed' && { completionDate: new Date().toISOString() })
                        }
                        : enrollment
                );
                setEnrollments(updated);
                calculateStats(updated);
                
                setSuccessMessage('Status updated successfully');
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch (error) {
            setErrorMessage(error.response?.data?.message || 'Failed to update status');
        }
    };

    const deleteEnrollment = async (enrollmentId) => {
        if (!window.confirm('Delete this enrollment?')) return;

        try {
            const token = getAuthToken();
            const response = await axios.delete(`http://localhost:5000/api/enrollments/${enrollmentId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.success) {
                const updated = enrollments.filter(enrollment => enrollment._id !== enrollmentId);
                setEnrollments(updated);
                setSelectedEnrollments(prev => prev.filter(id => id !== enrollmentId));
                calculateStats(updated);
                
                setSuccessMessage('Enrollment deleted successfully');
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch (error) {
            setErrorMessage(error.response?.data?.message || 'Failed to delete enrollment');
        }
    };

const handleEditEnrollment = (enrollment) => {
    setEditingEnrollment(enrollment);
    setShowEditModal(true);
};

    // Open modal
    const handleEnrollStudent = () => {
        setShowEnrollModal(true);
    };

    // Handle modal success
    const handleEnrollSuccess = (newEnrollment) => {
        console.log('New enrollment added:', newEnrollment);
        
        // Add to beginning of the list
        const updatedEnrollments = [newEnrollment, ...enrollments];
        setEnrollments(updatedEnrollments);
        
        // Update stats
        calculateStats(updatedEnrollments);
        
        // Show success message
        setSuccessMessage(`Successfully enrolled ${newEnrollment.student.name} in ${newEnrollment.course.title}!`);
        setTimeout(() => setSuccessMessage(''), 3000);
        
        // Close modal
        setShowEnrollModal(false);
    };

    const filteredEnrollments = enrollments.filter(enrollment => {
        const student = enrollment.student || {};
        const course = enrollment.course || {};
        
        const matchesSearch = 
            student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.title?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = filterStatus === 'all' || enrollment.status === filterStatus;
        
        return matchesSearch && matchesStatus;
    });

    const sortedEnrollments = [...filteredEnrollments].sort((a, b) => {
        const mult = sortOrder === 'asc' ? 1 : -1;
        const getVal = (enrollment, key) => {
            if (key === 'student') return (enrollment.student?.name || '').toLowerCase();
            if (key === 'course') return (enrollment.course?.title || '').toLowerCase();
            if (key === 'enrollmentDate') return new Date(enrollment.enrollmentDate || 0).getTime();
            if (key === 'progress') return Number(enrollment.progress) || 0;
            if (key === 'status') return (enrollment.status || '').toLowerCase();
            if (key === 'lastAccessed') return new Date(enrollment.lastAccessed || 0).getTime();
            if (key === 'grade') return (enrollment.grade || '').toLowerCase();
            return 0;
        };
        const va = getVal(a, sortBy);
        const vb = getVal(b, sortBy);
        if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
        return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });

    const getProgressColor = (progress) => {
        if (progress >= 80) return '#10b981';
        if (progress >= 50) return '#f59e0b';
        return '#ef4444';
    };

    const getStudentAvatar = (student) => {
        if (student.avatar) return student.avatar;
        return student.name ? student.name.charAt(0).toUpperCase() : '?';
    };

    if (loading) {
        return (
            <div className="enrollments-management loading">
                <div className="loading-spinner">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading enrollments from database...</p>
                    <small>Connected to MongoDB</small>
                </div>
            </div>
        );
    }
// Helper function
const getEnrollmentStatusIcon = (status) => {
    switch(status) {
        case 'active': return 'play-circle';
        case 'completed': return 'check-circle';
        case 'pending': return 'clock';
        case 'inactive': return 'pause-circle';
        default: return 'question-circle';
    }
};

const EditEnrollmentModal = () => {
    const [loading, setLoading] = useState(false);
    const [availableCourses, setAvailableCourses] = useState([]);
    const [formData, setFormData] = useState(() => ({
        studentName: editingEnrollment?.student?.name || '',
        studentEmail: editingEnrollment?.student?.email || '',
        courseId: editingEnrollment?.course?._id || '',
        progress: editingEnrollment?.progress || 0,
        status: editingEnrollment?.status || 'pending',
        grade: editingEnrollment?.grade || '',
        enrollmentDate: editingEnrollment?.enrollmentDate
            ? new Date(editingEnrollment.enrollmentDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0]
    }));

    // Fetch available courses
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const token = getAuthToken();
                const response = await axios.get('http://localhost:5000/api/courses', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.data.courses) {
                    setAvailableCourses(response.data.courses);
                }
            } catch (error) {
                console.error('Error fetching courses:', error);
            }
        };
        
        fetchCourses();
    }, []);

    const handleSave = async () => {
    try {
        setLoading(true);
        const token = getAuthToken();
        
        // Update student info
        if (editingEnrollment.student?.email !== formData.studentEmail || 
            editingEnrollment.student?.name !== formData.studentName) {
            
            await axios.put(
                `http://localhost:5000/api/users/${editingEnrollment.student?._id}`,
                {
                    name: formData.studentName,
                    email: formData.studentEmail
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        }

        // Update enrollment (including course change)
        const updateData = {
            progress: formData.progress,
            status: formData.status,
            grade: formData.grade,
            enrollmentDate: formData.enrollmentDate
        };

        // Only include courseId if changed
        if (formData.courseId && formData.courseId !== editingEnrollment.course?._id) {
            updateData.courseId = formData.courseId;
        }

        const response = await axios.put(
            `http://localhost:5000/api/enrollments/${editingEnrollment._id}`,
            updateData,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.success) {
            // Find the new course data
            const newCourse = availableCourses.find(c => c._id === formData.courseId) || 
                            editingEnrollment.course;
            
            const updated = enrollments.map(enrollment =>
                enrollment._id === editingEnrollment._id
                    ? { 
                        ...enrollment, 
                        ...response.data.enrollment,
                        student: {
                            ...enrollment.student,
                            name: formData.studentName,
                            email: formData.studentEmail
                        },
                        course: newCourse
                    }
                    : enrollment
            );
            setEnrollments(updated);
            calculateStats(updated);
            
            setSuccessMessage('Enrollment updated successfully');
            setTimeout(() => setSuccessMessage(''), 3000);
            handleClose();
        }
    } catch (error) {
        setErrorMessage(error.response?.data?.message || 'Failed to update');
    } finally {
        setLoading(false);
    }
};

    const handleClose = () => {
        setShowEditModal(false);
        setEditingEnrollment(null);
    };

    if (!showEditModal || !editingEnrollment) return null;

    return (
        <div className="modal-overlay fullscreen">
            <div className="modal-container fullscreen-modal">
                <div className="modal-header">
                    <h2><i className="fas fa-edit"></i> Edit Enrollment</h2>
                    <div className="header-subtitle">
                        <span className="enrollment-id">ID: {editingEnrollment._id}</span>
                        <span className={`status-badge ${editingEnrollment.status}`}>
                            {editingEnrollment.status}
                        </span>
                    </div>
                    <button className="close-btn" onClick={handleClose}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>

                <div className="modal-body">
                    <div className="edit-form-grid">
                        {/* Student Section */}
                        <div className="form-section">
                            <h3><i className="fas fa-user"></i> Student Information</h3>
                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    value={formData.studentName}
                                    onChange={(e) => setFormData({...formData, studentName: e.target.value})}
                                    className="form-input"
                                    placeholder="Student name"
                                />
                            </div>
                            <div className="form-group">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    value={formData.studentEmail}
                                    onChange={(e) => setFormData({...formData, studentEmail: e.target.value})}
                                    className="form-input"
                                    placeholder="student@example.com"
                                />
                            </div>
                        </div>

{/* Course Section */}
<div className="form-section">
    <h3><i className="fas fa-book"></i> Course Information</h3>
    <div className="form-group">
        <label>Select Course</label>
        <select
            value={formData.courseId}
            onChange={(e) => setFormData({...formData, courseId: e.target.value})}
            className="form-select"
        >
            <option value="">Select a course...</option>
            {availableCourses.map(course => (
                <option key={course._id} value={course._id}>
                    {course.title} ({course.category})
                </option>
            ))}
        </select>
    </div>
    {formData.courseId && (
        <div className="form-group">
            <label>Current Course</label>
            <div className="current-course-info">
                <strong>{editingEnrollment.course?.title}</strong>
                <small>Will be changed to: {
                    availableCourses.find(c => c._id === formData.courseId)?.title || 'New course'
                }</small>
            </div>
        </div>
    )}
</div>
                        {/* Enrollment Details */}
                        <div className="form-section">
                            <h3><i className="fas fa-cog"></i> Enrollment Details</h3>
                            <div className="form-row">
                                <div className="form-group half">
                                    <label>Enrollment Date</label>
                                    <input
                                        type="date"
                                        value={formData.enrollmentDate}
                                        onChange={(e) => setFormData({...formData, enrollmentDate: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group half">
                                    <label>Progress (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={formData.progress}
                                        onChange={(e) => setFormData({...formData, progress: parseInt(e.target.value) || 0})}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group half">
                                    <label>Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                                        className="form-select"
                                    >
                                        <option value="pending">Pending</option>
                                        <option value="active">Active</option>
                                        <option value="completed">Completed</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                                <div className="form-group half">
                                    <label>Grade</label>
                                    <select
                                        value={formData.grade}
                                        onChange={(e) => setFormData({...formData, grade: e.target.value})}
                                        className="form-select"
                                    >
                                        <option value="">Not Graded</option>
                                        <option value="A+">A+</option>
                                        <option value="A">A</option>
                                        <option value="A-">A-</option>
                                        <option value="B+">B+</option>
                                        <option value="B">B</option>
                                        <option value="C">C</option>
                                        <option value="D">D</option>
                                        <option value="F">F</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="form-section">
                            <h3><i className="fas fa-eye"></i> Preview</h3>
                            <div className="preview-card">
                                <div className="preview-row">
                                    <span className="preview-label">Student:</span>
                                    <span className="preview-value">{formData.studentName}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Email:</span>
                                    <span className="preview-value">{formData.studentEmail}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Course:</span>
                                    <span className="preview-value">{editingEnrollment.course?.title}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Progress:</span>
                                    <span className="preview-value">{formData.progress}%</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Status:</span>
                                    <span className={`status-badge ${formData.status}`}>{formData.status}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <div className="footer-left">
                        <small>Last updated: {editingEnrollment.updatedAt 
                            ? new Date(editingEnrollment.updatedAt).toLocaleString()
                            : 'Never'
                        }</small>
                    </div>
                    <div className="footer-right">
                        <button className="btn-secondary" onClick={handleClose} disabled={loading}>
                            Cancel
                        </button>
                        <button className="btn-primary" onClick={handleSave} disabled={loading}>
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
        </div>
    );
};    return (
        <div className="enrollments-management">
            {/* MODAL */}
            {showEnrollModal && (
                <EnrollStudentModal 
                    isOpen={showEnrollModal}
                    onClose={() => setShowEnrollModal(false)}
                    onEnrollSuccess={handleEnrollSuccess}
                    courses={courses}
                />
            )}
		{showEditModal && <EditEnrollmentModal />}
            {/* Header */}
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-user-graduate"></i> Enrollment Management</h1>
                    <p>Track student enrollments and course progress</p>
                    <small>Data stored in MongoDB | {enrollments.length} total enrollments</small>
                </div>
                <div className="header-right">
                    <button className="btn-primary" onClick={handleEnrollStudent}>
                        <i className="fas fa-user-plus"></i> Enroll Student
                    </button>
                    <button className="btn-secondary" onClick={fetchEnrollments}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            </div>

            {/* Messages */}
            {errorMessage && (
                <div className="alert alert-error">
                    <i className="fas fa-exclamation-circle"></i>
                    {errorMessage}
                    <button onClick={() => setErrorMessage('')} className="alert-close">×</button>
                </div>
            )}
            
            {successMessage && (
                <div className="alert alert-success">
                    <i className="fas fa-check-circle"></i>
                    {successMessage}
                    <button onClick={() => setSuccessMessage('')} className="alert-close">×</button>
                </div>
            )}

            {/* Bulk Actions Bar */}
            {showBulkActions && selectedEnrollments.length > 0 && (
                <div className="bulk-actions-bar">
                    <div className="selected-count">
                        <i className="fas fa-check-circle"></i>
                        {selectedEnrollments.length} enrollment(s) selected
                    </div>
                    <div className="bulk-buttons">
                        <button className="bulk-btn" onClick={() => updateSelectedStatus('active')}>
                            <i className="fas fa-play"></i> Set Active
                        </button>
                        <button className="bulk-btn" onClick={() => updateSelectedStatus('completed')}>
                            <i className="fas fa-check"></i> Set Completed
                        </button>
                        <button className="bulk-btn" onClick={() => updateSelectedStatus('pending')}>
                            <i className="fas fa-clock"></i> Set Pending
                        </button>
<button className="bulk-btn" onClick={() => updateSelectedStatus('inactive')}>
    <i className="fas fa-pause"></i> Set Inactive
</button>
{/* 👇 ADD THIS LINE AFTER INACTIVE BUTTON 👇 */}
<button 
    className="bulk-btn edit"
    onClick={() => {
        if (selectedEnrollments.length === 1) {
            const enrollment = enrollments.find(e => e._id === selectedEnrollments[0]);
            handleEditEnrollment(enrollment);
        } else {
            alert('Please select only one enrollment to edit');
        }
    }}
>
    <i className="fas fa-edit"></i> Edit Selected
</button>
                        <button className="bulk-btn delete" onClick={deleteSelectedEnrollments}>
                            <i className="fas fa-trash"></i> Delete Selected
                        </button>
                        <button className="bulk-btn cancel" onClick={() => setSelectedEnrollments([])}>
                            <i className="fas fa-times"></i> Clear Selection
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card total">
                    <div className="stat-icon">
                        <i className="fas fa-users"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.totalEnrollments}</h3>
                        <p>Total Enrollments</p>
                    </div>
                </div>
                <div className="stat-card active">
                    <div className="stat-icon">
                        <i className="fas fa-chart-line"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.activeEnrollments}</h3>
                        <p>Active Students</p>
                    </div>
                </div>
                <div className="stat-card completed">
                    <div className="stat-icon">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.completedEnrollments}</h3>
                        <p>Completed</p>
                    </div>
                </div>
                <div className="stat-card pending">
                    <div className="stat-icon">
                        <i className="fas fa-clock"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.pendingEnrollments}</h3>
                        <p>Pending</p>
                    </div>
                </div>
    <div className="stat-card inactive">
        <div className="stat-icon">
            <i className="fas fa-pause-circle"></i>
        </div>
        <div className="stat-info">
            <h3>{stats.inactiveEnrollments}</h3>
            <p>Inactive</p>
        </div>
    </div>
            </div>

            {/* Controls Bar */}
            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search by student name, email, or course..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="filter-controls">
                    <select 
                        className="status-filter"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    
                    <button className="refresh-btn" onClick={fetchEnrollments}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            </div>

            {/* Enrollments Table */}
            <div
                ref={tableContainerRef}
                className={`enrollments-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="enrollments-table">
                    <colgroup>
                        {COLUMN_DEFS.map((key, idx) => (
                            <col key={key} style={{ width: `${columnWidths[idx]}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    type="checkbox"
                                    checked={selectedEnrollments.length === filteredEnrollments.length && filteredEnrollments.length > 0}
                                    onChange={toggleAllEnrollments}
                                    disabled={filteredEnrollments.length === 0}
                                />
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 0)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(0); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('student')}>Student
                                {sortBy === 'student' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 1)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(1); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('course')}>Course
                                {sortBy === 'course' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 2)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(2); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('enrollmentDate')}>Enrollment Date
                                {sortBy === 'enrollmentDate' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 3)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(3); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('progress')}>Progress
                                {sortBy === 'progress' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 4)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(4); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>Status
                                {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 5)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(5); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('lastAccessed')}>Last Accessed
                                {sortBy === 'lastAccessed' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 6)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(6); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('grade')}>Grade
                                {sortBy === 'grade' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 7)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(7); }} />
                            </th>
                            <th className="action-col">Action
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 8)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(8); }} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedEnrollments.length > 0 ? (
                            sortedEnrollments.map((enrollment) => {
                                const student = enrollment.student || {};
                                const course = enrollment.course || {};
                                
                                return (
                                    <tr key={enrollment._id} className={selectedEnrollments.includes(enrollment._id) ? 'selected' : ''}>
                                        <td className="checkbox-cell">
                                            <input
                                                type="checkbox"
                                                checked={selectedEnrollments.includes(enrollment._id)}
                                                onChange={() => toggleEnrollmentSelection(enrollment._id)}
                                            />
                                        </td>
                                        <td>
                                            <div className="student-info">
                                                <div className="student-avatar">
                                                    {getStudentAvatar(student)}
                                                </div>
                                                <div className="student-details">
                                                    <strong>{student.name || 'Unknown Student'}</strong>
                                                    <span className="student-email">{student.email || 'No email'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="course-info">
                                                <div className="course-title">{course.title || 'Unknown Course'}</div>
                                                <div className="course-meta">
                                                    <span className="course-category">{course.category || 'General'}</span>
                                                    {course.instructor && (
                                                        <span className="course-instructor">By {course.instructor}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {enrollment.enrollmentDate ? 
                                                new Date(enrollment.enrollmentDate).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric'
                                                }) : 
                                                'Not set'
                                            }
                                        </td>
                                        <td>
                                            <div className="progress-container">
                                                <div className="progress-bar">
                                                    <div 
                                                        className="progress-fill"
                                                        style={{
                                                            width: `${enrollment.progress || 0}%`,
                                                            backgroundColor: getProgressColor(enrollment.progress || 0)
                                                        }}
                                                    ></div>
                                                </div>
                                                <span className="progress-text">{enrollment.progress || 0}%</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="status-cell">
                                                <span className={`status-badge ${enrollment.status || 'pending'}`}>
                                                    <i className={`fas fa-${getEnrollmentStatusIcon(enrollment.status)}`}></i>
                                                    {(enrollment.status || 'pending').charAt(0).toUpperCase() + (enrollment.status || 'pending').slice(1)}
                                                </span>
                                                <select
                                                    className="status-select-inline"
                                                    value={enrollment.status || 'pending'}
                                                    onChange={(e) => updateEnrollmentStatus(enrollment._id, e.target.value)}
                                                    title="Change status"
                                                >
                                                    <option value="pending">Pending</option>
                                                    <option value="active">Active</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="inactive">Inactive</option>
                                                </select>
                                            </div>
                                        </td>
                                        <td>
                                            {enrollment.lastAccessed ? 
                                                new Date(enrollment.lastAccessed).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric'
                                                }) : 
                                                'Never'
                                            }
                                        </td>
                                        <td>
                                            {enrollment.grade ? (
                                                <span className={`grade-badge grade-${enrollment.grade.charAt(0)}`}>
                                                    {enrollment.grade}
                                                </span>
                                            ) : (
                                                <span className="grade-badge no-grade">-</span>
                                            )}
                                        </td>
                                        <td className="action-cell">
                                            <div className="action-buttons">
                                                <button
                                                    type="button"
                                                    className="action-btn edit-btn"
                                                    title="Edit"
                                                    onClick={() => handleEditEnrollment(enrollment)}
                                                >
                                                    <i className="fas fa-edit"></i> Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="action-btn delete-btn"
                                                    title="Delete"
                                                    onClick={() => deleteEnrollment(enrollment._id)}
                                                >
                                                    <i className="fas fa-trash"></i> Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="9" className="no-data-row">
                                    <div className="no-data-message">
                                        <i className="fas fa-user-graduate"></i>
                                        <p>No enrollments found in database.</p>
                                        <button className="btn-primary" onClick={handleEnrollStudent}>
                                            <i className="fas fa-user-plus"></i> Enroll First Student
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Database Info */}
            <div className="database-info">
                <div className="info-card">
                    <i className="fas fa-database"></i>
                    <div>
                        <h4>MongoDB Storage</h4>
                        <p>All enrollments are stored permanently in MongoDB</p>
                        <small>Total: {enrollments.length} records</small>
                    </div>
                </div>
                <div className="info-card">
                    <i className="fas fa-sync-alt"></i>
                    <div>
                        <h4>Auto Refresh</h4>
                        <p>Data persists after page refresh</p>
                        <small>Changes saved to database</small>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EnrollmentsManagement;