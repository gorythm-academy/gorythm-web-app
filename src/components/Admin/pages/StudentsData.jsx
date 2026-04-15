import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import EnrollStudentModal from './EnrollStudentModal';
import './StudentsData.scss';

const COLUMN_DEFS = ['checkbox', 'studentId', 'student', 'personalEmail', 'course', 'enrollmentDate', 'status', 'action'];
const DEFAULT_COLUMN_WIDTHS = [60, 120, 180, 220, 220, 130, 140, 120];
const COLUMN_MIN_WIDTHS = [50, 70, 120, 160, 120, 100, 100, 90];
const COLUMN_MAX_WIDTHS = [90, 180, 280, 320, 400, 220, 260, 180];
const ENROLLMENT_STATUS_OPTIONS = ['active', 'pending', 'inactive', 'completed'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const StudentsData = () => {
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
        const uniqueStudents = new Map();
        const statusPriority = ['active', 'pending', 'inactive', 'completed'];
        data.forEach((enrollment) => {
            const student = enrollment?.student || {};
            const key = student._id || student.email || `${student.name || ''}-${student.studentId || ''}`;
            if (!key) return;
            const normalizedEnrollmentStatus = ENROLLMENT_STATUS_OPTIONS.includes(enrollment?.status)
                ? enrollment.status
                : 'pending';
            if (!uniqueStudents.has(key)) {
                uniqueStudents.set(key, { statuses: new Set([normalizedEnrollmentStatus]) });
                return;
            }
            uniqueStudents.get(key).statuses.add(normalizedEnrollmentStatus);
        });

        const resolvedStatuses = [...uniqueStudents.values()].map((entry) => {
            const statuses = [...entry.statuses];
            return statusPriority.find((status) => statuses.includes(status)) || 'pending';
        });
        const total = resolvedStatuses.length;
        const active = resolvedStatuses.filter((status) => status === 'active').length;
        const pending = resolvedStatuses.filter((status) => status === 'pending').length;
        const inactive = resolvedStatuses.filter((status) => status === 'inactive').length;
        const completed = resolvedStatuses.filter((status) => status === 'completed').length;
            
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

            const response = await axios.get(`${API_BASE_URL}/api/enrollments`, {
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
            const response = await axios.get(`${API_BASE_URL}/api/courses`, {
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

    const downloadStudentsDataCsv = () => {
        const data = (sortedEnrollments || []).map((enrollment) => {
            const s = enrollment.student || {};
            const c = enrollment.course || {};
            return {
                studentId: s.studentId || '',
                name: s.name || '',
                portalEmail: s.email || '',
                personalEmail: s.personalEmail || '',
                course: c.title || '',
                enrollmentDate: enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate).toISOString().slice(0, 10) : '',
                status: enrollment.status || 'pending',
            };
        });

        const columns = [
            ['studentId', 'Student ID'],
            ['name', 'Name'],
            ['portalEmail', 'Portal email'],
            ['personalEmail', 'Personal email'],
            ['course', 'Course'],
            ['enrollmentDate', 'Enrollment date'],
            ['status', 'Status'],
        ];

        const esc = (v) => {
            const s = String(v ?? '');
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const csv = [
            columns.map((c) => esc(c[1])).join(','),
            ...data.map((row) => columns.map((c) => esc(row[c[0]])).join(',')),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gorythm-students-data-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        fetchEnrollments();
        fetchCourses();
    }, [fetchEnrollments, fetchCourses]);

    // 👇 ADD THIS NEW useEffect HERE 👇
    useEffect(() => {
        const checkTableScroll = () => {
            const tableContainer = document.querySelector('.students-data-table-container');
            const table = document.querySelector('.students-data-table');
            
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
            setSortOrder(column === 'enrollmentDate' ? 'desc' : 'asc');
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
                await axios.post(
                    `${API_BASE_URL}/api/enrollments/bulk-update`,
                    { enrollmentIds: selectedEnrollments, status: newStatus },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const updated = enrollments.map((enrollment) => {
                    if (!selectedEnrollments.includes(enrollment._id)) return enrollment;
                    return {
                        ...enrollment,
                        status: newStatus,
                    };
                });
                setEnrollments(updated);
                calculateStats(updated);
                setSelectedEnrollments([]);

                setSuccessMessage(`Status updated to "${newStatus}" for ${selectedEnrollments.length} enrollment(s)`);
                setTimeout(() => setSuccessMessage(''), 3000);
            } catch (error) {
                setErrorMessage(error.response?.data?.message || 'Failed to update status');
            }
        }
    };

    const updateEnrollmentStatus = async (enrollment, newStatus) => {
        try {
            const token = getAuthToken();
            await axios.put(`${API_BASE_URL}/api/enrollments/${enrollment._id}`, {
                status: newStatus
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const updated = enrollments.map((row) =>
                row._id === enrollment._id
                    ? {
                          ...row,
                          status: newStatus,
                      }
                    : row
            );
            setEnrollments(updated);
            calculateStats(updated);

            setSuccessMessage('Enrollment status updated successfully');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            setErrorMessage(error.response?.data?.message || 'Failed to update status');
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
        const updatedEnrollments = enrollments.some((enrollment) => enrollment._id === newEnrollment._id)
            ? enrollments.map((enrollment) =>
                enrollment._id === newEnrollment._id ? newEnrollment : enrollment
            )
            : [newEnrollment, ...enrollments];
        setEnrollments(updatedEnrollments);
        
        // Update stats
        calculateStats(updatedEnrollments);
        
        // Show success message
        const courseName = newEnrollment.course?.title || 'a course';
        setSuccessMessage(`Successfully enrolled ${newEnrollment.student?.name || 'student'} in ${courseName}!`);
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
            (student.personalEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.title?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const enrollmentStatus = ENROLLMENT_STATUS_OPTIONS.includes(enrollment.status)
            ? enrollment.status
            : 'pending';
        const matchesStatus = filterStatus === 'all' || enrollmentStatus === filterStatus;
        
        return matchesSearch && matchesStatus;
    });

    const sortedEnrollments = [...filteredEnrollments].sort((a, b) => {
        const mult = sortOrder === 'asc' ? 1 : -1;
        const getVal = (enrollment, key) => {
            if (key === 'student') return (enrollment.student?.name || '').toLowerCase();
            if (key === 'personalEmail') return (enrollment.student?.personalEmail || '').toLowerCase();
            if (key === 'course') return (enrollment.course?.title || '').toLowerCase();
            if (key === 'enrollmentDate') return new Date(enrollment.enrollmentDate || 0).getTime();
            if (key === 'status') return (enrollment.status || 'pending');
            return 0;
        };
        const va = getVal(a, sortBy);
        const vb = getVal(b, sortBy);
        if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
        return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });

    const getStudentAvatar = (student) => {
        if (student.avatar) return student.avatar;
        return student.name ? student.name.charAt(0).toUpperCase() : '?';
    };

    if (loading) {
        return (
            <div className="students-data-page loading">
                <div className="loading-spinner">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading students data...</p>
                    <small>Connected to MongoDB</small>
                </div>
            </div>
        );
    }
// Helper function
const getEnrollmentStatusIcon = (status) => {
    switch(status) {
        case 'active': return 'play-circle';
        case 'pending': return 'clock';
        case 'completed': return 'flag-checkered';
        case 'inactive': return 'pause-circle';
        default: return 'question-circle';
    }
};

const EditEnrollmentModal = () => {
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState('');
    const [availableCourses, setAvailableCourses] = useState([]);
    const [formData, setFormData] = useState(() => ({
        studentName: editingEnrollment?.student?.name || '',
        studentId: editingEnrollment?.student?.studentId || '',
        personalEmail: editingEnrollment?.student?.personalEmail || '',
        courseId: editingEnrollment?.course?._id || '',
        status: editingEnrollment?.status || 'pending',
        enrollmentDate: editingEnrollment?.enrollmentDate
            ? new Date(editingEnrollment.enrollmentDate).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0]
    }));

    // Keep scroll inside modal (touch + mouse), not the page behind it
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev || '';
        };
    }, []);

    // Fetch available courses
    useEffect(() => {
        const fetchCourses = async () => {
            try {
                const token = getAuthToken();
                const response = await axios.get(`${API_BASE_URL}/api/courses`, {
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

    const sortedActiveCourses = useMemo(() => {
        const list = Array.isArray(availableCourses)
            ? availableCourses.filter((course) => course?.status === 'published' || course?.isPublished === true)
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
    }, [availableCourses]);

    const handleSave = async () => {
    try {
        setLoading(true);
        setFormError('');
        const token = getAuthToken();

        const studentIdTrim = (formData.studentId || '').trim();
        if (studentIdTrim && !/^GRT-\d{4}-\d{3}$/.test(studentIdTrim)) {
            setFormError('Student ID must match GRT-YYYY-### (e.g. GRT-2026-001) or be left blank.');
            setLoading(false);
            return;
        }

        const personalTrim = (formData.personalEmail || '').trim();
        if (personalTrim && personalTrim !== personalTrim.toLowerCase()) {
            setFormError('Personal email must be in lowercase letters.');
            setLoading(false);
            return;
        }
        if (personalTrim && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(personalTrim)) {
            setFormError('Personal email must be in valid email format, or leave it blank.');
            setLoading(false);
            return;
        }

        if (editingEnrollment.student?._id) {
            const currentStudentId = String(editingEnrollment.student?.studentId || '').trim();
            const shouldUpdateStudentId = !!studentIdTrim && studentIdTrim !== currentStudentId;
            const shouldUpdateName = editingEnrollment.student?.name !== formData.studentName;
            const shouldUpdatePersonalEmail =
                String(editingEnrollment.student?.personalEmail || '').trim() !== personalTrim;

            const userUpdatePayload = {};
            if (shouldUpdateName) userUpdatePayload.name = formData.studentName;
            if (shouldUpdatePersonalEmail) userUpdatePayload.personalEmail = personalTrim;
            // Only set studentId when admin explicitly enters it
            if (shouldUpdateStudentId) userUpdatePayload.studentId = studentIdTrim;

            if (Object.keys(userUpdatePayload).length) {
                await axios.put(
                    `${API_BASE_URL}/api/users/${editingEnrollment.student._id}`,
                    userUpdatePayload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            }
        }

        // Update enrollment (including course change)
        const updateData = {
            enrollmentDate: formData.enrollmentDate,
            courseId: formData.courseId || undefined,
            status: formData.status,
        };

        const response = await axios.put(
            `${API_BASE_URL}/api/enrollments/${editingEnrollment._id}`,
            updateData,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.success) {
            // Find the new course data
            const newCourse = sortedActiveCourses.find(c => c._id === formData.courseId) || 
                            editingEnrollment.course;
            
            const updated = enrollments.map(enrollment =>
                enrollment._id === editingEnrollment._id
                    ? {
                        ...enrollment,
                        ...response.data.enrollment,
                        student: {
                            ...enrollment.student,
                            name: formData.studentName,
                            studentId: studentIdTrim || enrollment.student?.studentId,
                            personalEmail: personalTrim,
                        },
                        status: formData.status,
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
        setFormError(error.response?.data?.message || 'Failed to update');
    } finally {
        setLoading(false);
    }
};

    const handleClose = () => {
        setFormError('');
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
                        <span className={`status-badge ${formData.status || editingEnrollment?.status || 'pending'}`}>
                            {formData.status || editingEnrollment?.status || 'pending'}
                        </span>
                    </div>
                    <button className="close-btn" onClick={handleClose}>
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
                                <label>
                                    <i className="fas fa-id-card"></i> Student ID (GRT-YYYY-###)
                                </label>
                                <input
                                    type="text"
                                    value={formData.studentId}
                                    onChange={(e) => setFormData({...formData, studentId: e.target.value})}
                                    className="form-input"
                                    placeholder="GRT-2026-001"
                                />
                                <small className="form-hint-muted">Leave blank to keep existing ID (if any).</small>
                            </div>
                            <div className="form-group">
                                <label>
                                    <i className="fas fa-key"></i> Portal login email (People)
                                </label>
                                <div className="portal-email-readonly-edit">
                                    {editingEnrollment.student?.email || '—'}
                                </div>
                                <small className="form-hint-muted">Student portal sign-in. Change account email in People if required.</small>
                            </div>
                            <div className="form-group">
                                <label>
                                    <i className="fas fa-envelope"></i> Personal email (optional)
                                </label>
                                <input
                                    type="email"
                                    value={formData.personalEmail}
                                    onChange={(e) => setFormData({...formData, personalEmail: e.target.value})}
                                    className="form-input"
                                    placeholder="Gmail, Hotmail, etc."
                                    autoComplete="email"
                                />
                                <small className="form-hint-muted">Separate from portal login; same field as Enroll Student form.</small>
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
            {sortedActiveCourses.map(course => (
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
                    sortedActiveCourses.find(c => c._id === formData.courseId)?.title || 'New course'
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
                                    <label>Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                                        className="form-select"
                                    >
                                        <option value="active">Active</option>
                                        <option value="pending">Pending</option>
                                        <option value="inactive">Inactive</option>
                                        <option value="completed">Completed</option>
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
                                    <span className="preview-value">{formData.studentName || editingEnrollment.student?.name}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Portal email:</span>
                                    <span className="preview-value">{editingEnrollment.student?.email || '—'}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Personal email:</span>
                                    <span className="preview-value">{formData.personalEmail?.trim() || '—'}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Student ID:</span>
                                    <span className="preview-value" style={{ fontFamily: 'monospace', color: '#2563eb' }}>
                                        {formData.studentId?.trim() || editingEnrollment.student?.studentId || '—'}
                                    </span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Course:</span>
                                    <span className="preview-value">
                                        {sortedActiveCourses.find(c => c._id === formData.courseId)?.title || editingEnrollment.course?.title}
                                    </span>
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
};

    return (
        <div className="students-data-page">
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
                    <h1><i className="fas fa-user-graduate"></i> Students data</h1>
                    <p>View and manage student records and course assignments</p>
                    <small>Data stored in MongoDB | {enrollments.length} total records</small>
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
                        {selectedEnrollments.length} row(s) selected
                    </div>
                    <div className="bulk-buttons">
                        <button className="bulk-btn" onClick={() => updateSelectedStatus('active')}>
                            <i className="fas fa-play"></i> Set Active
                        </button>
                        <button className="bulk-btn" onClick={() => updateSelectedStatus('pending')}>
                            <i className="fas fa-clock"></i> Set Pending
                        </button>
                        <button className="bulk-btn" onClick={() => updateSelectedStatus('inactive')}>
                            <i className="fas fa-pause"></i> Set Inactive
                        </button>
                        <button className="bulk-btn" onClick={() => updateSelectedStatus('completed')}>
                            <i className="fas fa-flag-checkered"></i> Set Completed
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
                        <p>Total students</p>
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
                <div className="stat-card completed">
                    <div className="stat-icon">
                        <i className="fas fa-flag-checkered"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.completedEnrollments}</h3>
                        <p>Completed</p>
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
                        <option value="pending">Pending</option>
                        <option value="inactive">Inactive</option>
                        <option value="completed">Completed</option>
                    </select>
                    
                    <button className="refresh-btn" onClick={fetchEnrollments}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                    <button className="btn-primary enroll-btn" onClick={handleEnrollStudent}>
                        <i className="fas fa-user-plus"></i> Enroll Student
                    </button>
                    <button className="btn-secondary download-btn" onClick={downloadStudentsDataCsv}>
                        <i className="fas fa-file-export"></i> Download Excel
                    </button>
                </div>
            </div>

            {/* Students data table */}
            <div
                ref={tableContainerRef}
                className={`students-data-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="students-data-table">
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
                            <th>Student ID
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 1)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(1); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('student')}>Student
                                {sortBy === 'student' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 2)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(2); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('personalEmail')}>Personal email
                                {sortBy === 'personalEmail' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 3)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(3); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('course')}>Course
                                {sortBy === 'course' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 4)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(4); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('enrollmentDate')}>Enrollment Date
                                {sortBy === 'enrollmentDate' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 5)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(5); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>Status
                                {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 6)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(6); }} />
                            </th>
                            <th className="action-col">Action
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 7)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(7); }} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedEnrollments.length > 0 ? (
                            sortedEnrollments.map((enrollment) => {
                                const student = enrollment.student || {};
                                const course = enrollment.course || {};
                                const courseInstructorLabel =
                                    course.instructorName ||
                                    (typeof course.instructor === 'object' && course.instructor?.name
                                        ? course.instructor.name
                                        : '') ||
                                    '';

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
                                            {student.studentId ? (
                                                <span className="student-id-cell">
                                                    {student.studentId}
                                                </span>
                                            ) : (
                                                <span className="student-id-cell no-id">—</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="student-info">
                                                <div className="student-avatar">
                                                    {getStudentAvatar(student)}
                                                </div>
                                                <div className="student-details">
                                                    <strong>{student.name || 'Unknown Student'}</strong>
                                                    <span className="student-email">{student.email || 'No portal email'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="student-email-cell">{student.personalEmail || '—'}</span>
                                        </td>
                                        <td>
                                            {course._id ? (
                                                <div className="course-info">
                                                    <div className="course-title">{course.title || 'Unknown Course'}</div>
                                                    <div className="course-meta">
                                                        <span className="course-category">{course.category || 'General'}</span>
                                                        {courseInstructorLabel ? (
                                                            <span className="course-instructor">By {courseInstructorLabel}</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="no-course-assigned">
                                                    <i className="fas fa-book-open"></i> No course assigned
                                                </div>
                                            )}
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
                                            <div className="status-cell">
                                                <span className={`status-badge ${enrollment.status || 'pending'}`}>
                                                    <i className={`fas fa-${getEnrollmentStatusIcon(enrollment.status || 'pending')}`}></i>
                                                    {(enrollment.status || 'pending').charAt(0).toUpperCase() + (enrollment.status || 'pending').slice(1)}
                                                </span>
                                                <select
                                                    className="status-select-inline"
                                                    value={enrollment.status || 'pending'}
                                                    onChange={(e) => updateEnrollmentStatus(enrollment, e.target.value)}
                                                    title="Change status"
                                                >
                                                    <option value="active">Active</option>
                                                    <option value="pending">Pending</option>
                                                    <option value="inactive">Inactive</option>
                                                    <option value="completed">Completed</option>
                                                </select>
                                            </div>
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
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="8" className="no-data-row">
                                    <div className="no-data-message">
                                        <i className="fas fa-user-graduate"></i>
                                        <p><strong>No course enrollments yet.</strong></p>
                                        <p className="no-data-hint">
                                            This table shows one row per student per course. Students from the People tab appear here only after you assign them to a course (use <strong>Enroll Student</strong> or the graduation-cap button on a student row in People).
                                        </p>
                                        <button className="btn-primary" onClick={handleEnrollStudent}>
                                            <i className="fas fa-user-plus"></i> Enroll Student in a Course
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
                        <p>All student records are stored permanently in MongoDB</p>
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

export default StudentsData;