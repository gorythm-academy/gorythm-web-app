import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import AddStudentUnifiedModal from './AddStudentUnifiedModal';
import { useAdminDialog } from '../AdminDialogContext';
import { formatTime12h } from '../../../utils/formatTime12h';
import {
    displayPortalEmail,
    isUnsetPortalEmail,
    localFromPortalEmail as portalEmailLocalPart,
} from '../../../utils/studentPortalEmail';
import './StudentsData.scss';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatScheduleLabel = (slot) => {
    if (!slot) return '';
    const day = DAY_LABELS[slot.dayOfWeek] ?? `Day ${slot.dayOfWeek}`;
    const teacher = slot.teacher?.name || 'Teacher';
    return `${day} ${formatTime12h(slot.startTime)}–${formatTime12h(slot.endTime)} · ${teacher}`;
};

const COLUMN_DEFS = ['checkbox', 'studentId', 'student', 'personalEmail', 'phone', 'course', 'teachers', 'enrollmentDate', 'addedAt', 'paymentStatus', 'status', 'action'];
const DEFAULT_COLUMN_WIDTHS = [60, 120, 180, 220, 150, 200, 180, 130, 150, 140, 120, 130];
const COLUMN_MIN_WIDTHS = [50, 70, 120, 160, 110, 120, 120, 100, 110, 100, 90, 90];
const COLUMN_MAX_WIDTHS = [90, 180, 280, 320, 240, 400, 280, 220, 240, 260, 180, 200];
const ENROLLMENT_STATUS_OPTIONS = ['active', 'inactive', 'completed'];
const GORYTHM_EMAIL_DOMAIN = '@gorythmacademy.com';
const GORYTHM_EMAIL_REGEX = /^[^\s@]+@gorythmacademy\.com$/i;

const sanitizePortalEmailLocal = (raw) => {
    const value = String(raw ?? '');
    const beforeAt = value.includes('@') ? value.split('@')[0] : value;
    return beforeAt.replace(/\s+/g, '');
};

const normalizeEnrollmentStatus = (status) => {
    if (!status || status === 'pending') return 'inactive';
    return ENROLLMENT_STATUS_OPTIONS.includes(status) ? status : 'inactive';
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const StudentsData = () => {
    const [searchParams] = useSearchParams();
    const { showAlert, showConfirm } = useAdminDialog();
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
        inactiveEnrollments: 0
    });
    
    // Modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [courses, setCourses] = useState([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [listTab, setListTab] = useState('active');
    const [trashCount, setTrashCount] = useState(0);
    const [trashBusy, setTrashBusy] = useState(false);
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
        const statusPriority = ['active', 'inactive', 'completed'];
        data.forEach((enrollment) => {
            const student = enrollment?.student || {};
            const key = student._id || student.email || `${student.name || ''}-${student.studentId || ''}`;
            if (!key) return;
            const normalizedEnrollmentStatus = normalizeEnrollmentStatus(enrollment?.status);
            if (!uniqueStudents.has(key)) {
                uniqueStudents.set(key, { statuses: new Set([normalizedEnrollmentStatus]) });
                return;
            }
            uniqueStudents.get(key).statuses.add(normalizedEnrollmentStatus);
        });

        const resolvedStatuses = [...uniqueStudents.values()].map((entry) => {
            const statuses = [...entry.statuses];
            return statusPriority.find((status) => statuses.includes(status)) || 'inactive';
        });
        const total = resolvedStatuses.length;
        const active = resolvedStatuses.filter((status) => status === 'active').length;
        const inactive = resolvedStatuses.filter((status) => status === 'inactive').length;
        const completed = resolvedStatuses.filter((status) => status === 'completed').length;

        setStats({
            totalEnrollments: total,
            activeEnrollments: active,
            completedEnrollments: completed,
            inactiveEnrollments: inactive,
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
                params: listTab === 'trash' ? { trash: '1' } : {},
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.data.success) {
                setEnrollments(response.data.enrollments || []);
                if (typeof response.data.trashCount === 'number') {
                    setTrashCount(response.data.trashCount);
                }
                if (listTab !== 'trash') {
                    calculateStats(response.data.enrollments || []);
                }
                setLoading(false);
            } else {
                throw new Error(response.data.message || 'Failed to fetch enrollments');
            }
            
        } catch (error) {
            console.error('Error fetching enrollments:', error);
            setErrorMessage(
                error.response?.data?.error
                || error.response?.data?.message
                || error.message
                || 'Failed to load enrollments'
            );
            setEnrollments([]);
            calculateStats([]);
            setLoading(false);
        }
    }, [calculateStats, listTab]);

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
                portalEmail: displayPortalEmail(s.email),
                personalEmail: s.personalEmail || '',
                phone: s.phone || '',
                course: c.title || '',
                enrollmentDate: enrollment.enrollmentDate ? new Date(enrollment.enrollmentDate).toISOString().slice(0, 10) : '',
                addedAt: s.createdAt ? new Date(s.createdAt).toISOString() : '',
                status: normalizeEnrollmentStatus(enrollment.status),
            };
        });

        const columns = [
            ['studentId', 'Student ID'],
            ['name', 'Name'],
            ['portalEmail', 'Portal email'],
            ['personalEmail', 'Personal email'],
            ['phone', 'Phone'],
            ['course', 'Course'],
            ['enrollmentDate', 'Enrollment date'],
            ['addedAt', 'Added'],
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

    useEffect(() => {
        const emailFromQuery = searchParams.get('email');
        if (emailFromQuery) {
            setSearchTerm(emailFromQuery);
        }
    }, [searchParams]);

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
        
        const confirmed = await showConfirm({
            title: 'Update Enrollment Status?',
            message: `Change status to "${newStatus}" for ${selectedEnrollments.length} enrollment(s)?`,
            confirmLabel: 'Update Status',
        });
        if (!confirmed) return;

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
            showAlert(`Status updated to "${newStatus}" for ${selectedEnrollments.length} enrollment(s)`, 'success');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to update status';
            setErrorMessage(message);
            showAlert(message, 'error');
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

    const handleDeleteEnrollment = async (enrollment) => {
        const studentName = enrollment.student?.name || 'this student';
        const courseTitle = enrollment.course?.title || 'this course';
        const confirmed = await showConfirm({
            title: 'Move to trash?',
            message: `Move ${studentName} — "${courseTitle}" to trash? You can restore or permanently delete from the Trash tab.`,
            confirmLabel: 'Move to trash',
        });
        if (!confirmed) return;

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/enrollments/${enrollment._id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchEnrollments();
            setSelectedEnrollments((prev) => prev.filter((id) => id !== enrollment._id));
            setSuccessMessage('Moved to trash');
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            const message = error.response?.data?.message || error.response?.data?.error || 'Failed to move to trash';
            setErrorMessage(message);
            showAlert(message, 'error');
        }
    };

    const handleDeleteSelected = async () => {
        if (!selectedEnrollments.length) return;
        const confirmed = await showConfirm({
            title: 'Move to trash?',
            message: `Move ${selectedEnrollments.length} enrollment row(s) to trash?`,
            confirmLabel: 'Move to trash',
        });
        if (!confirmed) return;

        try {
            const token = getAuthToken();
            const idsToDelete = [...selectedEnrollments];
            await Promise.all(
                idsToDelete.map((id) =>
                    axios.delete(`${API_BASE_URL}/api/enrollments/${id}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                )
            );
            setSelectedEnrollments([]);
            await fetchEnrollments();
            setSuccessMessage(`${idsToDelete.length} enrollment(s) moved to trash`);
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            const message = error.response?.data?.message || error.response?.data?.error || 'Failed to move to trash';
            setErrorMessage(message);
            showAlert(message, 'error');
        }
    };

    const handleRestoreEnrollment = async (enrollmentId) => {
        if (trashBusy) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/enrollments/${enrollmentId}/restore`, null, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchEnrollments();
            showAlert('Enrollment restored.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.message || 'Failed to restore enrollment.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handlePermanentDelete = async (enrollmentId) => {
        if (listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete permanently?',
            message:
                'This cannot be undone. The enrollment row will be removed. If this is the student\'s only record, their portal account will be deleted from the database too.',
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            const res = await axios.delete(`${API_BASE_URL}/api/enrollments/${enrollmentId}/permanent`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchEnrollments();
            showAlert(
                res.data?.userDeleted
                    ? 'Student enrollment and account permanently deleted.'
                    : 'Enrollment permanently deleted.',
                'success'
            );
        } catch (error) {
            showAlert(error.response?.data?.message || 'Failed to delete permanently.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handlePermanentDeleteSelected = async () => {
        if (listTab !== 'trash' || !selectedEnrollments.length || trashBusy) return;
        const count = selectedEnrollments.length;
        const confirmed = await showConfirm({
            title: 'Delete permanently?',
            message: `Permanently delete ${count} selected enrollment row(s)? If a student has no other records, their portal account will be removed too. This cannot be undone.`,
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            const ids = [...selectedEnrollments];
            const results = await Promise.all(
                ids.map((id) =>
                    axios.delete(`${API_BASE_URL}/api/enrollments/${id}/permanent`, {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                )
            );
            const usersDeleted = results.filter((res) => res.data?.userDeleted).length;
            setSelectedEnrollments([]);
            await fetchEnrollments();
            showAlert(
                usersDeleted > 0
                    ? `${count} enrollment(s) permanently deleted (${usersDeleted} student account(s) removed).`
                    : `${count} enrollment(s) permanently deleted.`,
                'success'
            );
        } catch (error) {
            showAlert(error.response?.data?.message || 'Failed to delete permanently.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    // Open modal
    const handleAddStudent = () => {
        setShowAddModal(true);
    };

    // Handle modal success
    const handleEnrollSuccess = (newEnrollment) => {
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
        setShowAddModal(false);
    };

    const filteredEnrollments = enrollments.filter(enrollment => {
        const student = enrollment.student || {};
        const course = enrollment.course || {};
        
        const matchesSearch = 
            student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (student.personalEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (student.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.title?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const enrollmentStatus = normalizeEnrollmentStatus(enrollment.status);
        const matchesStatus = filterStatus === 'all' || enrollmentStatus === filterStatus;
        
        return matchesSearch && matchesStatus;
    });

    const sortedEnrollments = [...filteredEnrollments].sort((a, b) => {
        const mult = sortOrder === 'asc' ? 1 : -1;
        const getVal = (enrollment, key) => {
            if (key === 'student') return (enrollment.student?.name || '').toLowerCase();
            if (key === 'personalEmail') return (enrollment.student?.personalEmail || '').toLowerCase();
            if (key === 'phone') return (enrollment.student?.phone || '').toLowerCase();
            if (key === 'course') return (enrollment.course?.title || '').toLowerCase();
            if (key === 'enrollmentDate') return new Date(enrollment.enrollmentDate || 0).getTime();
            if (key === 'addedAt') return new Date(enrollment.student?.createdAt || 0).getTime();
            if (key === 'status') return normalizeEnrollmentStatus(enrollment.status);
            return 0;
        };
        const va = getVal(a, sortBy);
        const vb = getVal(b, sortBy);
        if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
        return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });

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
    const [courseSchedules, setCourseSchedules] = useState([]);
    const [schedulesLoading, setSchedulesLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [formData, setFormData] = useState(() => ({
        studentName: editingEnrollment?.student?.name || '',
        studentId: editingEnrollment?.student?.studentId || '',
        portalEmailLocal: portalEmailLocalPart(editingEnrollment?.student?.email),
        personalEmail: editingEnrollment?.student?.personalEmail || '',
        phone: editingEnrollment?.student?.phone || '',
        password: '',
        confirmPassword: '',
        courseId: editingEnrollment?.course?._id || '',
        assignedScheduleId: editingEnrollment?.assignedSchedule?._id || editingEnrollment?.assignedSchedule || '',
        status: normalizeEnrollmentStatus(editingEnrollment?.status),
        paymentStatus: editingEnrollment?.paymentStatus || 'pending',
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

        const phoneTrim = (formData.phone || '').trim();
        const portalLocal = sanitizePortalEmailLocal(formData.portalEmailLocal);
        const portalEmail = portalLocal ? `${portalLocal}${GORYTHM_EMAIL_DOMAIN}`.toLowerCase() : '';
        if (portalLocal && !GORYTHM_EMAIL_REGEX.test(portalEmail)) {
            setFormError('Portal email must be a valid @gorythmacademy.com address.');
            setLoading(false);
            return;
        }

        if (!portalLocal && (formData.password || formData.status === 'active')) {
            setFormError('Assign a portal email before activating the student or setting a password.');
            setLoading(false);
            return;
        }

        if (formData.password || formData.confirmPassword) {
            if ((formData.password || '').length < 6) {
                setFormError('Password must be at least 6 characters.');
                setLoading(false);
                return;
            }
            if (formData.password !== formData.confirmPassword) {
                setFormError('Password and confirmation do not match.');
                setLoading(false);
                return;
            }
        }

        if (editingEnrollment.student?._id) {
            const currentStudentId = String(editingEnrollment.student?.studentId || '').trim();
            const trimmedName = (formData.studentName || '').trim();
            const currentName = (editingEnrollment.student?.name || '').trim();
            const currentEmail = (editingEnrollment.student?.email || '').trim().toLowerCase();
            const currentPersonal = String(editingEnrollment.student?.personalEmail || '').trim();
            const currentPhone = String(editingEnrollment.student?.phone || '').trim();

            const shouldUpdateStudentId = !!studentIdTrim && studentIdTrim !== currentStudentId;
            const shouldUpdateName = !!trimmedName && trimmedName !== currentName;
            const shouldUpdatePortalEmail =
                portalLocal && portalEmail !== currentEmail;
            const shouldUpdatePersonalEmail = currentPersonal !== personalTrim;
            const shouldUpdatePhone = currentPhone !== phoneTrim;

            if (!trimmedName) {
                setFormError('Student name is required.');
                setLoading(false);
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
                if (shouldUpdatePortalEmail) {
                    userUpdatePayload.email = portalEmail;
                }
                if (shouldUpdateStudentId) userUpdatePayload.studentId = studentIdTrim;

                await axios.put(
                    `${API_BASE_URL}/api/users/${editingEnrollment.student._id}`,
                    userUpdatePayload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            }

            if (formData.password) {
                await axios.patch(
                    `${API_BASE_URL}/api/users/${editingEnrollment.student._id}/password`,
                    { password: formData.password },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
            }
        }

        // Update enrollment (including course change)
        const updateData = {
            enrollmentDate: formData.enrollmentDate,
            courseId: formData.courseId || undefined,
            assignedScheduleId: formData.assignedScheduleId || null,
            status: formData.status,
            paymentStatus: formData.paymentStatus,
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
                            email: portalLocal ? portalEmail : enrollment.student?.email,
                            studentId: studentIdTrim || enrollment.student?.studentId,
                            personalEmail: personalTrim,
                            phone: phoneTrim,
                        },
                        status: formData.status,
                        paymentStatus: response.data.enrollment?.paymentStatus ?? formData.paymentStatus,
                        course: newCourse
                    }
                    : enrollment
            );
            setEnrollments(updated);
            calculateStats(updated);
            fetchEnrollments();

            setSuccessMessage('Enrollment updated successfully');
            setTimeout(() => setSuccessMessage(''), 3000);
            handleClose();
        }
    } catch (error) {
        const data = error.response?.data;
        setFormError(data?.error || data?.message || error.message || 'Failed to update');
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
                        <span className={`status-badge ${formData.status || normalizeEnrollmentStatus(editingEnrollment?.status)}`}>
                            {formData.status || normalizeEnrollmentStatus(editingEnrollment?.status)}
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
                            <p className="form-hint-muted form-section-note">
                                Name, portal email, personal email, and phone apply to this student on{' '}
                                <strong>all courses</strong> (one shared account).
                            </p>
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
                                    <i className="fas fa-envelope"></i> Portal email
                                </label>
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
                                        aria-label="Portal email ID"
                                    />
                                    <span className="email-input-group__suffix" aria-hidden="true">
                                        {GORYTHM_EMAIL_DOMAIN}
                                    </span>
                                </div>
                                <small className="form-hint-muted">
                                    Leave blank for payment-created students until you assign portal login. Only enter the ID — <strong>@gorythmacademy.com</strong> is added automatically.
                                </small>
                            </div>
                            <div className="form-group">
                                <label>
                                    <i className="fas fa-lock"></i> New password (optional)
                                </label>
                                <div className="password-field">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="form-input"
                                        placeholder="Leave blank to keep current password"
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
                            <div className="form-group">
                                <label>
                                    <i className="fas fa-phone"></i> Phone number (optional)
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="form-input"
                                    placeholder="+1 (123) 456-7890"
                                    autoComplete="tel"
                                />
                                <small className="form-hint-muted">Shown in Students data.</small>
                            </div>
                        </div>

{/* Course Section */}
<div className="form-section">
    <h3><i className="fas fa-book"></i> Course Information</h3>
    <div className="form-group">
        <label>Select Course</label>
        <select
            value={formData.courseId}
            onChange={(e) => setFormData({
                ...formData,
                courseId: e.target.value,
                assignedScheduleId: '',
            })}
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
    {formData.courseId ? (
        <div className="form-group">
            <label>
                <i className="fas fa-clock" /> Class timeslot (teacher + schedule)
            </label>
            <select
                value={formData.assignedScheduleId}
                onChange={(e) => setFormData({ ...formData, assignedScheduleId: e.target.value })}
                className="form-select"
                disabled={schedulesLoading}
            >
                <option value="">Select a timeslot…</option>
                {courseSchedules.map((slot) => (
                    <option key={slot._id} value={slot._id}>
                        {formatScheduleLabel(slot)}
                    </option>
                ))}
            </select>
            <small className="form-hint-muted">
                {schedulesLoading
                    ? 'Loading schedule slots…'
                    : courseSchedules.length
                      ? 'Student portal shows only this assigned slot.'
                      : 'No schedule slots for this course yet — add them in LMS → Schedule.'}
            </small>
        </div>
    ) : null}
    {formData.courseId && formData.courseId !== editingEnrollment.course?._id && (
        <div className="form-group">
            <label>Course change</label>
            <div className="current-course-info">
                <small>
                    From <strong>{editingEnrollment.course?.title || '—'}</strong> to{' '}
                    <strong>{sortedActiveCourses.find(c => c._id === formData.courseId)?.title || 'New course'}</strong>
                </small>
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
                                        <option value="inactive">Inactive</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                    <small className="form-hint-muted">
                                        Setting <strong>Active</strong> enables portal login. Set a portal password above if the student cannot sign in yet.
                                    </small>
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
                                <small className="form-hint-muted">
                                    Overrides display for this enrollment. Stripe payments may sync this automatically.
                                </small>
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
                                    <span className="preview-value">
                                        {formData.portalEmailLocal
                                            ? `${sanitizePortalEmailLocal(formData.portalEmailLocal)}${GORYTHM_EMAIL_DOMAIN}`
                                            : '—'}
                                    </span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Personal email:</span>
                                    <span className="preview-value">{formData.personalEmail?.trim() || '—'}</span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Phone:</span>
                                    <span className="preview-value">{formData.phone?.trim() || '—'}</span>
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
                                {formData.assignedScheduleId ? (
                                    <div className="preview-row">
                                        <span className="preview-label">Timeslot:</span>
                                        <span className="preview-value">
                                            {formatScheduleLabel(
                                                courseSchedules.find(
                                                    (s) => String(s._id) === String(formData.assignedScheduleId)
                                                ) || editingEnrollment?.assignedSchedule
                                            ) || '—'}
                                        </span>
                                    </div>
                                ) : null}
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
            {showAddModal && (
                <AddStudentUnifiedModal
                    isOpen={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={handleEnrollSuccess}
                    courses={courses}
                />
            )}
		{showEditModal && <EditEnrollmentModal />}
            {/* Header */}
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-user-graduate"></i> Students</h1>
                    <p>Accounts, enrollments, fee status, and course assignments in one place</p>
                    <small>
                        <i className="fas fa-database" aria-hidden="true" />
                        Data stored in MongoDB | {enrollments.length} total records
                    </small>
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
                        {listTab === 'active' ? (
                            <>
                                <button className="bulk-btn" onClick={() => updateSelectedStatus('active')}>
                                    <i className="fas fa-play"></i> Set Active
                                </button>
                                <button className="bulk-btn" onClick={() => updateSelectedStatus('inactive')}>
                                    <i className="fas fa-pause"></i> Set Inactive
                                </button>
                                <button className="bulk-btn" onClick={() => updateSelectedStatus('completed')}>
                                    <i className="fas fa-flag-checkered"></i> Set Completed
                                </button>
                            </>
                        ) : null}
                        {listTab === 'active' ? (
                            <button className="bulk-btn delete" onClick={handleDeleteSelected}>
                                <i className="fas fa-trash"></i> Move to Trash
                            </button>
                        ) : (
                            <>
                                <button
                                    className="bulk-btn"
                                    disabled={trashBusy}
                                    onClick={async () => {
                                        for (const id of selectedEnrollments) {
                                            await handleRestoreEnrollment(id);
                                        }
                                        setSelectedEnrollments([]);
                                    }}
                                >
                                    <i className="fas fa-undo" /> Restore Selected
                                </button>
                                <button
                                    className="bulk-btn delete"
                                    disabled={trashBusy || !selectedEnrollments.length}
                                    onClick={handlePermanentDeleteSelected}
                                >
                                    <i className="fas fa-times-circle" /> Delete Forever
                                </button>
                            </>
                        )}
<button 
    className="bulk-btn edit"
    onClick={() => {
        if (selectedEnrollments.length === 1) {
            const enrollment = enrollments.find(e => e._id === selectedEnrollments[0]);
            handleEditEnrollment(enrollment);
        } else {
            showAlert('Please select only one enrollment to edit', 'warning');
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

            <div className="students-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('active');
                        setSelectedEnrollments([]);
                    }}
                >
                    <i className="fas fa-list" /> Active records
                </button>
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('trash');
                        setSelectedEnrollments([]);
                    }}
                >
                    <i className="fas fa-trash-alt" /> Trash
                    {trashCount > 0 ? ` (${trashCount})` : ''}
                </button>
            </div>

            {/* Controls Bar */}
            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search by student name, email, phone, or course..."
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
                        <option value="inactive">Inactive</option>
                        <option value="completed">Completed</option>
                    </select>
                    
                    <button className="refresh-btn" onClick={fetchEnrollments}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                    {listTab === 'active' ? (
                        <button className="btn-primary enroll-btn" onClick={handleAddStudent}>
                            <i className="fas fa-user-plus"></i> Add Student
                        </button>
                    ) : null}
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
                            <th className="sortable" onClick={() => handleSort('phone')}>Phone
                                {sortBy === 'phone' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 4)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(4); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('course')}>Course
                                {sortBy === 'course' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 5)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(5); }} />
                            </th>
                            <th>Teacher(s)</th>
                            <th className="sortable" onClick={() => handleSort('enrollmentDate')}>Enrollment Date
                                {sortBy === 'enrollmentDate' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 7)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(7); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('addedAt')}>Added
                                {sortBy === 'addedAt' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 8)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(8); }} />
                            </th>
                            <th>Fee status</th>
                            <th className="sortable" onClick={() => handleSort('status')}>Status
                                {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 10)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(10); }} />
                            </th>
                            <th className="action-col">Action
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 11)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(11); }} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedEnrollments.length > 0 ? (
                            sortedEnrollments.map((enrollment) => {
                                const student = enrollment.student || {};
                                const course = enrollment.course || {};
                                const teachersLabel = (() => {
                                    if (enrollment.assignedSchedule) {
                                        const label = formatScheduleLabel(enrollment.assignedSchedule);
                                        return label ? [label] : [];
                                    }
                                    if (Array.isArray(enrollment.courseTeachers) && enrollment.courseTeachers.length) {
                                        return enrollment.courseTeachers.map((t) => t.name).filter(Boolean);
                                    }
                                    return [];
                                })();

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
                                            <div className="student-info no-avatar">
                                                <div className="student-details">
                                                    <strong>{student.name || 'Unknown Student'}</strong>
                                                    <span className="student-email">
                                                        {displayPortalEmail(student.email) || '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="student-email-cell">{student.personalEmail || '—'}</span>
                                        </td>
                                        <td>
                                            <span className="student-phone-cell">
                                                {student.phone ? (
                                                    <>
                                                        <i className="fas fa-phone" aria-hidden="true"></i> {student.phone}
                                                    </>
                                                ) : (
                                                    '—'
                                                )}
                                            </span>
                                        </td>
                                        <td>
                                            {course._id ? (
                                                <div className="course-info">
                                                    <div className="course-title">{course.title || 'Unknown Course'}</div>
                                                    <div className="course-meta">
                                                        <span className="course-category">{course.category || 'General'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="no-course-assigned">
                                                    <i className="fas fa-book-open"></i> No course assigned
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {teachersLabel.length > 0 ? (
                                                <ul className="teachers-list-cell">
                                                    {teachersLabel.map((name) => (
                                                        <li key={name}>{name}</li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <span className="teachers-list-cell teachers-list-cell--empty">—</span>
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
                                            {student.createdAt ? (
                                                <span className="student-added-at" title={new Date(student.createdAt).toLocaleString()}>
                                                    {new Date(student.createdAt).toLocaleString('en-US', {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: 'numeric',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge payment-${enrollment.paymentStatus || 'pending'}`}>
                                                {(enrollment.paymentStatus || 'pending').charAt(0).toUpperCase() +
                                                    (enrollment.paymentStatus || 'pending').slice(1)}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="status-cell">
                                                <span className={`status-badge ${normalizeEnrollmentStatus(enrollment.status)}`}>
                                                    <i className={`fas fa-${getEnrollmentStatusIcon(normalizeEnrollmentStatus(enrollment.status))}`}></i>
                                                    {normalizeEnrollmentStatus(enrollment.status).charAt(0).toUpperCase() +
                                                        normalizeEnrollmentStatus(enrollment.status).slice(1)}
                                                </span>
                                                <select
                                                    className="status-select-inline"
                                                    value={normalizeEnrollmentStatus(enrollment.status)}
                                                    onChange={(e) => updateEnrollmentStatus(enrollment, e.target.value)}
                                                    title="Change status"
                                                >
                                                    <option value="active">Active</option>
                                                    <option value="inactive">Inactive</option>
                                                    <option value="completed">Completed</option>
                                                </select>
                                            </div>
                                        </td>
                                        <td className="action-cell">
                                            <div className="action-buttons">
                                                {listTab === 'active' ? (
                                                    <>
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
                                                            title="Move to trash"
                                                            onClick={() => handleDeleteEnrollment(enrollment)}
                                                        >
                                                            <i className="fas fa-trash"></i> Delete
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="action-btn edit-btn"
                                                            title="Restore"
                                                            disabled={trashBusy}
                                                            onClick={() => handleRestoreEnrollment(enrollment._id)}
                                                        >
                                                            <i className="fas fa-undo" /> Restore
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="action-btn delete-btn"
                                                            title="Delete permanently"
                                                            disabled={trashBusy}
                                                            onClick={() => handlePermanentDelete(enrollment._id)}
                                                        >
                                                            <i className="fas fa-times-circle" /> Delete forever
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="12" className="no-data-row">
                                    <div className="no-data-message">
                                        <i className="fas fa-user-graduate"></i>
                                        <p><strong>No course enrollments yet.</strong></p>
                                        <p className="no-data-hint">
                                            One row per student per course. Use <strong>Add Student</strong> to create an account and enroll in a course.
                                        </p>
                                        <button className="btn-primary" onClick={handleAddStudent}>
                                            <i className="fas fa-user-plus"></i> Add Student
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