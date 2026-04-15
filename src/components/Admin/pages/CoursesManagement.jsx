import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { CATEGORY_ORDER } from '../../HomeSections/Courses';
import { API_BASE_URL } from '../../../config/constants';
import './CoursesManagement.scss';

const getCategorySortIndex = (category) => {
    const i = CATEGORY_ORDER.indexOf(category || '');
    return i === -1 ? CATEGORY_ORDER.length : i;
};

const COLUMN_DEFS = [
    'checkbox',
    'title',
    'description',
    'category',
    'instructor',
    'students',
    'price',
    'status',
    'duration',
    'level',
    'created',
    'actions',
];

const DEFAULT_COLUMN_WIDTHS = [60, 210, 260, 180, 220, 120, 120, 130, 170, 130, 160, 220];
// Allow shrinking without a noticeable minimum width.
// The table layout is fixed + column widths are applied via <colgroup>,
// so setting this to 0 enables full drag-shrink behavior.
const COLUMN_MIN_WIDTHS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const COLUMN_MAX_WIDTHS = [90, 360, 440, 300, 380, 180, 180, 220, 280, 220, 240, 360];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const CoursesManagement = () => {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedCourses, setSelectedCourses] = useState([]);
    const [totalUniqueStudents, setTotalUniqueStudents] = useState(0);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'Quranic Arabic',
        price: '',
        duration: '8 weeks',
        status: 'draft',
        level: 'beginner',
        instructorName: '',
        homepageImage: '',
        displayOrder: '',
        masonryColumn: '',
    });
    const [sortBy, setSortBy] = useState('');
    const [sortOrder, setSortOrder] = useState('asc');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const toastTimerRef = React.useRef(null);
    const tableContainerRef = React.useRef(null);
    const dragStateRef = React.useRef({
        isDragging: false,
        startX: 0,
        startScrollLeft: 0,
    });
    const [isTableDragging, setIsTableDragging] = useState(false);

    // Interactive column resize (drag handles in <th>, applied via <colgroup>)
    const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);

    const showConfirmation = (message, type = 'success') => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ show: true, message, type });
        toastTimerRef.current = setTimeout(() => {
            setToast({ show: false, message: '', type: 'success' });
            toastTimerRef.current = null;
        }, 3500);
    };

    const startColumnResize = (e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = columnWidths[colIndex];
        const minWidth = COLUMN_MIN_WIDTHS[colIndex] ?? 0;
        const maxWidth = COLUMN_MAX_WIDTHS[colIndex] ?? 600;

        let rafId = null;
        let latestWidth = startWidth;

        const onPointerMove = (ev) => {
            latestWidth = clamp(startWidth + (ev.clientX - startX), minWidth, maxWidth);

            // Throttle updates to animation frames while dragging.
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

    const startTableDragScroll = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, .col-resizer')) return;

        const tableContainer = tableContainerRef.current;
        if (!tableContainer) return;

        dragStateRef.current = {
            isDragging: true,
            startX: e.clientX,
            startScrollLeft: tableContainer.scrollLeft,
        };
        setIsTableDragging(true);
    };

    const onTableDragScroll = (e) => {
        const tableContainer = tableContainerRef.current;
        const dragState = dragStateRef.current;
        if (!tableContainer || !dragState.isDragging) return;

        const deltaX = e.clientX - dragState.startX;
        tableContainer.scrollLeft = dragState.startScrollLeft - deltaX;
    };

    const stopTableDragScroll = () => {
        if (!dragStateRef.current.isDragging) return;
        dragStateRef.current.isDragging = false;
        setIsTableDragging(false);
    };

    useEffect(() => {
        fetchCourses();
    }, []);

    useEffect(() => {
        if (isFormOpen) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.left = '0';
            document.body.style.right = '0';
        } else {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.left = '';
            document.body.style.right = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.left = '';
            document.body.style.right = '';
        };
    }, [isFormOpen]);

    const fetchCourses = async () => {
        try {
            setLoading(true);
            const token = getAuthToken();
            
            console.log('Fetching courses...');
            const response = await axios.get(`${API_BASE_URL}/api/courses`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const raw = response.data?.courses || [];
            const coursesFromDb = raw.map((c) => ({
                ...c,
                status: c.status === 'published' || c.status === 'draft'
                    ? c.status
                    : (c.isPublished === true ? 'published' : 'draft'),
            }));
            console.log('Fetched courses from DB:', coursesFromDb.length, 'courses');
            if (coursesFromDb.length > 0) {
                console.log('First course sample:', {
                    id: coursesFromDb[0]._id,
                    title: coursesFromDb[0].title,
                    status: coursesFromDb[0].status
                });
            }
            setCourses(coursesFromDb);
            setTotalUniqueStudents(Number(response.data?.totalUniqueStudents) || 0);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching courses:', error);
            console.error('Error details:', error.response?.data);
            setCourses([]);
            setTotalUniqueStudents(0);
            setLoading(false);
        }
    };

    const openCreateForm = () => {
        setEditingCourse(null);
        setFormData({
            title: '',
            description: '',
            category: 'Quranic Arabic',
            price: '',
            duration: '8 weeks',
            status: 'draft',
            level: 'beginner',
            instructorName: '',
            homepageImage: '',
            displayOrder: '',
            masonryColumn: '',
        });
        setIsFormOpen(true);
        
        setTimeout(() => {
            const formCard = document.querySelector('.course-form-card');
            if (formCard) {
                formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    };

    const openEditForm = (course) => {
        if (!course) {
            alert('Error: Course data is invalid');
            return;
        }
        
        const courseId = course._id || course.id;
        if (!courseId) {
            console.error('Course ID not found. Course object:', course);
            alert('Error: Course ID is missing. Cannot edit this course.');
            return;
        }
        
        console.log('Opening edit form for course:', course);
        console.log('Course duration from DB:', course.duration);
        
        setEditingCourse(course);
        setFormData({
            title: course.title || '',
            description: course.description || '',
            category: course.category || 'Quranic Arabic',
            price: course.price != null ? String(course.price) : '0',
            duration: course.duration || '8 weeks',
            status: course.status || 'draft',
            level: course.level || 'beginner',
            instructorName: course.instructorName || course.instructor?.name || '',
            homepageImage: course.homepageImage || '',
            displayOrder: Number.isFinite(Number(course.displayOrder)) ? String(course.displayOrder) : '',
            masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? String(course.masonryColumn) : '',
        });
        
        console.log('Form data set to:', formData);
        
        setIsFormOpen(true);
        
        setTimeout(() => {
            const formCard = document.querySelector('.course-form-card');
            if (formCard) {
                formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    };

    const openBulkEditForm = () => {
        if (selectedCourses.length === 0) {
            alert('Please select courses to edit');
            return;
        }
        
        const firstSelected = courses.find(course => 
            selectedCourses.includes(course._id)
        );
        
        if (firstSelected) {
            openEditForm(firstSelected);
        } else {
            alert('Selected course not found. Please refresh and try again.');
        }
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        if (isSubmitting) {
            return;
        }

        if (!formData.title.trim()) {
            alert('Please enter a course title');
            return;
        }
        if (!formData.description.trim()) {
            alert('Please enter a course description');
            return;
        }
        if (!formData.duration.trim()) {
            alert('Please enter course duration (e.g., "8 weeks")');
            return;
        }

        setIsSubmitting(true);
        const token = getAuthToken();
        
        if (!token) {
            alert('Authentication token not found. Please log in again.');
            setIsSubmitting(false);
            return;
        }

        const payload = {
            title: formData.title.trim(),
            description: formData.description.trim(),
            category: formData.category,
            price: Number(formData.price) || 0,
            duration: formData.duration.trim(),
            status: formData.status,
            level: formData.level,
            instructorName: (formData.instructorName || '').trim(),
            homepageImage: (formData.homepageImage || '').trim(),
            displayOrder: formData.displayOrder === '' ? 9999 : Number(formData.displayOrder),
            masonryColumn: formData.masonryColumn === '' ? null : Number(formData.masonryColumn),
        };

        try {
            if (editingCourse) {
                const courseId = editingCourse._id || editingCourse.id;
                
                if (!courseId) {
                    alert('Error: Course ID is missing. Cannot update course.');
                    setIsSubmitting(false);
                    return;
                }
                
                console.log('Updating course - ID:', courseId);
                console.log('Payload:', payload);
                console.log('URL:', `${API_BASE_URL}/api/courses/${courseId}`);
                
                const response = await axios.put(
                    `${API_BASE_URL}/api/courses/${courseId}`,
                    payload,
                    { 
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        } 
                    }
                );
                
                console.log('Course updated successfully:', response.data);
                
                if (selectedCourses.length > 1) {
                    showConfirmation(`Course updated! Changes will be applied to ${selectedCourses.length - 1} other selected courses.`);
                    
                    const bulkUpdatePromises = selectedCourses
                        .filter(id => id !== courseId)
                        .map(id => 
                            axios.put(
                                `${API_BASE_URL}/api/courses/${id}`,
                                payload,
                                { headers: { Authorization: `Bearer ${token}` } }
                            ).catch(err => {
                                console.error(`Failed to update course ${id}:`, err);
                                return null;
                            })
                        );
                    
                    await Promise.all(bulkUpdatePromises);
                } else {
                    showConfirmation('Course updated successfully!');
                }
            } else {
                console.log('Creating new course:', payload);
                const response = await axios.post(
                    `${API_BASE_URL}/api/courses`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                console.log('Course created successfully:', response.data);
                showConfirmation('Course created successfully!');
            }

            setIsFormOpen(false);
            setEditingCourse(null);
            setSelectedCourses([]);
setFormData({
            title: '',
            description: '',
            category: 'Quranic Arabic',
            price: '',
            duration: '8 weeks',
            status: 'draft',
            level: 'beginner',
            instructorName: '',
            homepageImage: '',
            displayOrder: '',
            masonryColumn: '',
        });
        
            await fetchCourses();
        } catch (error) {
            console.error('Error saving course:', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);
            
            let errorMessage = 'Failed to save course';
            
            if (error.response) {
                if (error.response.status === 404) {
                    errorMessage = `Course not found (404). ID: ${editingCourse?._id}`;
                    await fetchCourses(); // Refresh list
                } else if (error.response.status === 401) {
                    errorMessage = 'Unauthorized. Please log in again.';
                } else if (error.response.status === 403) {
                    errorMessage = 'Forbidden. You do not have permission.';
                } else {
                    errorMessage = error.response.data?.error || 
                                 `Server error (${error.response.status})`;
                }
            } else if (error.request) {
                errorMessage = 'No response from server. Check if backend is running.';
            } else {
                errorMessage = error.message || 'Failed to save course';
            }
            
            alert(`Failed to save course: ${errorMessage}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleCourseSelection = (courseId) => {
        setSelectedCourses(prev => 
            prev.includes(courseId) 
                ? prev.filter(id => id !== courseId)
                : [...prev, courseId]
        );
    };

    const toggleAllCourses = () => {
        if (selectedCourses.length === sortedCourses.length && sortedCourses.length > 0) {
            setSelectedCourses([]);
        } else {
            const allCourseIds = sortedCourses.map(course => course._id || course.id);
            setSelectedCourses(allCourseIds);
        }
    };

    const deleteCourse = async (courseId) => {
        if (window.confirm('Are you sure you want to delete this course?')) {
            try {
                const token = getAuthToken();
                await axios.delete(`${API_BASE_URL}/api/courses/${courseId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                setSelectedCourses(prev => prev.filter(id => id !== courseId));
                await fetchCourses();
                showConfirmation('Course deleted successfully!');
            } catch (error) {
                console.error('Error deleting course:', error);
                const errorMessage = error.response?.data?.error || error.message || 'Failed to delete course';
                alert(`Failed to delete course: ${errorMessage}. Please try again.`);
            }
        }
    };

    // FIXED: Bulk delete function
    const deleteSelectedCourses = async () => {
        if (!selectedCourses.length || !window.confirm(`Delete ${selectedCourses.length} selected course(s)?`)) {
            return;
        }

        try {
            const token = getAuthToken();
            console.log('Deleting courses:', selectedCourses);
            
            // FIXED: Use correct endpoint and payload format
            const response = await axios.post(
                `${API_BASE_URL}/api/courses/bulk-delete`, 
                { ids: selectedCourses },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            console.log('Bulk delete response:', response.data);
            
            await fetchCourses();
            setSelectedCourses([]);
            showConfirmation(response.data.message || `${selectedCourses.length} course(s) deleted successfully!`);
        } catch (error) {
            console.error('Error deleting selected courses:', error);
            console.error('Error details:', error.response?.data);
            alert(`Failed to delete selected courses: ${error.response?.data?.error || error.message}`);
        }
    };

    const toggleStatus = async (courseId, currentStatus) => {
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/courses/${courseId}/status`, 
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchCourses();
            showConfirmation('Status updated successfully.');
        } catch (error) {
            console.error('Error updating course status:', error);
            alert('Failed to update course status. Please try again.');
        }
    };

    const toggleSelectedStatus = async () => {
        const targetStatus = prompt('Set all selected courses to (published/draft):', 'published');
        if (!targetStatus || !['published', 'draft'].includes(targetStatus)) return;

        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/courses/bulk-status`, 
                { courseIds: selectedCourses, status: targetStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchCourses();
            showConfirmation(`${selectedCourses.length} course(s) set to ${targetStatus}`);
        } catch (error) {
            console.error('Error updating selected courses status:', error);
            alert('Failed to update status for selected courses. Please try again.');
        }
    };

    const filteredCourses = courses.filter(course => {
        const matchesSearch = 
            course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (course.instructorName || course.instructor?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = filterStatus === 'all' || course.status === filterStatus;
        
        return matchesSearch && matchesStatus;
    });

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const sortedCourses = [...filteredCourses].sort((a, b) => {
        if (!sortBy) {
            const orderA = Number.isFinite(Number(a.displayOrder)) ? Number(a.displayOrder) : 9999;
            const orderB = Number.isFinite(Number(b.displayOrder)) ? Number(b.displayOrder) : 9999;
            if (orderA !== orderB) return orderA - orderB;
            const catA = getCategorySortIndex(a.category);
            const catB = getCategorySortIndex(b.category);
            if (catA !== catB) return catA - catB;
            return (a.title || '').localeCompare(b.title || '');
        }
        const mult = sortOrder === 'asc' ? 1 : -1;
        const getVal = (c, key) => {
            if (key === 'title') return (c.title || '').toLowerCase();
            if (key === 'category') return (c.category || '').toLowerCase();
            if (key === 'instructor') return (c.instructorName || c.instructor?.name || '').toLowerCase();
            if (key === 'students') return c.students ?? 0;
            if (key === 'price') return Number(c.price) || 0;
            if (key === 'status') return (c.status || '').toLowerCase();
            if (key === 'duration') return (c.duration || '').toLowerCase();
            if (key === 'level') return (c.level || '').toLowerCase();
            if (key === 'created') return new Date(c.createdAt || 0).getTime();
            return 0;
        };
        const va = getVal(a, sortBy);
        const vb = getVal(b, sortBy);
        if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
        return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });

    if (loading) {
        return (
            <div className="courses-management loading">
                <div className="loading-spinner">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading courses...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="courses-management">
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-book"></i> Course Management</h1>
                    <p>Create, edit, and manage academy courses</p>
                </div>
                <div className="header-right">
                    <button type="button" className="btn-primary" onClick={openCreateForm}>
                        <i className="fas fa-plus"></i> Add Course
                    </button>
                </div>
            </div>

            <div className="page-stats">
                <div className="stat-card">
                    <div className="stat-icon total">
                        <i className="fas fa-book"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{courses.length}</h3>
                        <p>Total Courses</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon published">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{courses.filter(c => c.status === 'published').length}</h3>
                        <p>Published</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon students">
                        <i className="fas fa-users"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{totalUniqueStudents}</h3>
                        <p>Total Students</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon revenue">
                        <i className="fas fa-dollar-sign"></i>
                    </div>
                    <div className="stat-info">
                        <h3>${courses.reduce((sum, course) => sum + (course.price || 0), 0)}</h3>
                        <p>Total Value</p>
                    </div>
                </div>
            </div>

            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search courses by title, category, or instructor..."
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
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                    </select>
                    
                    <button className="refresh-btn" onClick={fetchCourses}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            </div>

            {isFormOpen && (


	  <div className="course-modal-overlay">
    <div className="course-modal">
                <div className="course-form-card">
                    <div className="form-header">
                        <h2>
                            <i className={`fas ${editingCourse ? 'fa-edit' : 'fa-plus-circle'}`}></i>
                            {editingCourse ? 'Edit Course' : 'Add New Course'}
                        </h2>
                        {editingCourse && (
                            <div className="editing-indicator">
                                <i className="fas fa-info-circle"></i>
                                Editing: <strong>{editingCourse.title}</strong>
                                {selectedCourses.length > 1 && (
                                    <span style={{marginLeft: '10px', color: 'var(--color-accent)'}}>
                                        (and {selectedCourses.length - 1} other selected course(s))
                                    </span>
                                )}
                            </div>
                        )}
                        <button
                            type="button"
                            className="modal-close-btn"
                            onClick={() => {
                                setIsFormOpen(false);
                                setEditingCourse(null);
                                setSelectedCourses([]);
                            }}
                            aria-label="Close"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                    <form onSubmit={handleFormSubmit} className="course-form">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Title *</label>
                                <input
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleFormChange}
                                    required
                                    placeholder="e.g., Quranic Arabic for Beginners"
                                />
                            </div>
                            <div className="form-group">
                                <label>Category *</label>
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleFormChange}
                                    required
                                >
                                    <option value="Quranic Arabic">Quranic Arabic</option>
                                    <option value="Tajweed">Tajweed</option>
                                    <option value="Islamic Studies">Islamic Studies</option>
                                    <option value="STEM">STEM</option>
                                    <option value="Memorization (Hifz)">Memorization (Hifz)</option>
                                    <option value="Fiqh">Fiqh</option>
                                    <option value="Hadith">Hadith</option>
                                    <option value="Seerah">Seerah</option>
                                    <option value="Aqeedah">Aqeedah</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Instructor</label>
                                <input
                                    type="text"
                                    name="instructorName"
                                    value={formData.instructorName}
                                    onChange={handleFormChange}
                                    placeholder="e.g., Dr. Ahmed Hassan"
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group form-group-full">
                                <label>Description *</label>
                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleFormChange}
                                    rows="3"
                                    placeholder="Describe what students will learn in this course. Shown on homepage, All Courses, and Single Course."
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Price ($) *</label>
                                <input
                                    type="number"
                                    name="price"
                                    value={formData.price}
                                    min="0"
                                    step="0.01"
                                    onChange={handleFormChange}
                                    required
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleFormChange}
                                >
                                    <option value="published">Published</option>
                                    <option value="draft">Draft</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Duration *</label>
                                <input
                                    type="text"
                                    name="duration"
                                    value={formData.duration}
                                    onChange={handleFormChange}
                                    placeholder="e.g., 8 weeks, Self-paced"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Level</label>
                                <select
                                    name="level"
                                    value={formData.level}
                                    onChange={handleFormChange}
                                >
                                    <option value="beginner">Beginner</option>
                                    <option value="intermediate">Intermediate</option>
                                    <option value="advanced">Advanced</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Display order</label>
                                <input
                                    type="number"
                                    name="displayOrder"
                                    value={formData.displayOrder}
                                    onChange={handleFormChange}
                                    min="0"
                                    step="1"
                                    placeholder="0 = first (blank = last)"
                                />
                            </div>
                            <div className="form-group">
                                <label>Masonry column</label>
                                <select
                                    name="masonryColumn"
                                    value={formData.masonryColumn}
                                    onChange={handleFormChange}
                                >
                                    <option value="">Auto</option>
                                    <option value="1">Left</option>
                                    <option value="2">Middle</option>
                                    <option value="3">Right</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group form-group-full">
                                <label>Homepage card image (URL or path)</label>
                                <input
                                    type="text"
                                    name="homepageImage"
                                    value={formData.homepageImage}
                                    onChange={handleFormChange}
                                    placeholder="e.g. https://example.com/image.jpg or /images/course.jpg from public folder"
                                />
                                <small className="form-hint">Used only on the homepage course section. Leave empty for placeholder. Use a full URL or a path from your public folder (e.g. /images/photo.jpg).</small>
                            </div>
                        </div>
                        <div className="form-actions">
                            <button 
                                type="submit" 
                                className="btn-primary"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i> {editingCourse ? 'Updating...' : 'Creating...'}
                                    </>
                                ) : (
                                    <>
                                        <i className={editingCourse ? 'fas fa-save' : 'fas fa-plus'}></i> {editingCourse ? 'Update Course' : 'Create Course'}
                                        {selectedCourses.length > 1 && editingCourse && ' (Apply to All Selected)'}
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setIsFormOpen(false);
                                    setEditingCourse(null);
                                    setSelectedCourses([]);
                                    setFormData({
                                        title: '',
                                        description: '',
                                        category: 'Quranic Arabic',
                                        price: '',
                                        duration: '8 weeks',
                                        status: 'draft',
                                        level: 'beginner',
                                        instructorName: '',
                                        homepageImage: '',
                                        displayOrder: '',
                                        masonryColumn: '',
                                    });
                                }}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
    </div>
  </div>
            )}

            {selectedCourses.length > 0 && (
                <div className="bulk-actions-bar">
                    <div className="selected-count">
                        <i className="fas fa-check-circle"></i>
                        {selectedCourses.length} course(s) selected
                    </div>
                    <div className="bulk-buttons">
                        <button className="bulk-btn" onClick={openBulkEditForm}>
                            <i className="fas fa-edit"></i> Edit Selected
                        </button>
                        <button className="bulk-btn" onClick={toggleSelectedStatus}>
                            <i className="fas fa-eye"></i> Set Status
                        </button>
                        <button className="bulk-btn delete" onClick={deleteSelectedCourses}>
                            <i className="fas fa-trash"></i> Delete Selected
                        </button>
                        <button
                            className="bulk-btn cancel"
                            onClick={() => {
                                setSelectedCourses([]);
                            }}
                        >
                            <i className="fas fa-times"></i> Clear Selection
                        </button>
                    </div>
                </div>
            )}

            <div
                ref={tableContainerRef}
                className={`courses-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="courses-table">
                    <colgroup>
                        {COLUMN_DEFS.map((key, idx) => (
                            <col
                                key={key}
                                style={{ width: `${columnWidths[idx]}px` }}
                            />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    type="checkbox"
                                    checked={selectedCourses.length === sortedCourses.length && sortedCourses.length > 0}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        toggleAllCourses();
                                    }}
                                />
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 0)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(0);
                                    }}
                                    role="separator"
                                    aria-label="Resize checkbox column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('title')}>
                                Title
                                {sortBy === 'title' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'title' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 1)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(1);
                                    }}
                                    role="separator"
                                    aria-label="Resize Title column"
                                />
                            </th>
                            <th>
                                Description
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 2)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(2);
                                    }}
                                    role="separator"
                                    aria-label="Resize Description column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('category')}>
                                Category
                                {sortBy === 'category' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'category' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 3)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(3);
                                    }}
                                    role="separator"
                                    aria-label="Resize Category column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('instructor')}>
                                Instructor
                                {sortBy === 'instructor' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'instructor' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 4)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(4);
                                    }}
                                    role="separator"
                                    aria-label="Resize Instructor column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('students')}>
                                Students
                                {sortBy === 'students' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'students' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 5)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(5);
                                    }}
                                    role="separator"
                                    aria-label="Resize Students column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('price')}>
                                Price
                                {sortBy === 'price' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'price' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 6)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(6);
                                    }}
                                    role="separator"
                                    aria-label="Resize Price column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>
                                Status
                                {sortBy === 'status' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'status' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 7)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(7);
                                    }}
                                    role="separator"
                                    aria-label="Resize Status column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('duration')}>
                                Duration
                                {sortBy === 'duration' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'duration' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 8)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(8);
                                    }}
                                    role="separator"
                                    aria-label="Resize Duration column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('level')}>
                                Level
                                {sortBy === 'level' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'level' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 9)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(9);
                                    }}
                                    role="separator"
                                    aria-label="Resize Level column"
                                />
                            </th>
                            <th className="sortable" onClick={() => handleSort('created')}>
                                Created
                                {sortBy === 'created' && <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>}
                                {sortBy !== 'created' && <i className="fas fa-sort"></i>}
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 10)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(10);
                                    }}
                                    role="separator"
                                    aria-label="Resize Created column"
                                />
                            </th>
                            <th>
                                Actions
                                <span
                                    className="col-resizer"
                                    onPointerDown={(e) => startColumnResize(e, 11)}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        resetColumnWidth(11);
                                    }}
                                    role="separator"
                                    aria-label="Resize Actions column"
                                />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedCourses.map((course) => {
                            const courseId = course._id || course.id;
                            return (
                                <tr key={courseId} className={selectedCourses.includes(courseId) ? 'selected' : ''}>
                                    <td className="checkbox-cell">
                                        <input
                                            type="checkbox"
                                            checked={selectedCourses.includes(courseId)}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                toggleCourseSelection(courseId);
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <div className="course-title-cell">
                                            <strong>{course.title}</strong>
                                            <small style={{ display: 'block', opacity: 0.8 }}>
                                                #{Number.isFinite(Number(course.displayOrder)) ? Number(course.displayOrder) : 9999}
                                                {' '}•{' '}
                                                {course.masonryColumn ? `Column ${course.masonryColumn}` : 'Column auto'}
                                            </small>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="course-description-cell" title={course.description}>
                                            {course.description ? (course.description.length > 60 ? `${course.description.slice(0, 60)}…` : course.description) : '—'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="category-badge">{course.category}</span>
                                    </td>
                                    <td>{course.instructorName || course.instructor?.name || '—'}</td>
                                    <td>
                                        <div className="student-count">
                                            <i className="fas fa-users"></i>
                                            {course.students ?? 0}
                                        </div>
                                    </td>
                                    <td>
                                        <span className="price-tag">
                                            ${course.price ?? 0}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-badge ${course.status}`}>
                                            {course.status ? course.status.charAt(0).toUpperCase() + course.status.slice(1) : 'Draft'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="duration-badge">
                                            {course.duration || '—'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="level-badge">
                                            {course.level ? String(course.level).charAt(0).toUpperCase() + String(course.level).slice(1) : '—'}
                                        </span>
                                    </td>
                                    <td>
                                        {course.createdAt ? new Date(course.createdAt).toLocaleDateString() : '—'}
                                    </td>
                                    <td>
                                        <div className="action-buttons">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEditForm(course);
                                                }}
                                                className="action-btn edit-btn"
                                                title="Edit Course"
                                            >
                                                <i className="fas fa-edit"></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleStatus(courseId, course.status);
                                                }}
                                                className={`action-btn status-btn ${course.status}`}
                                                title={course.status === 'published' ? 'Set to Draft' : 'Publish'}
                                            >
                                                <i className={`fas fa-${course.status === 'published' ? 'eye-slash' : 'eye'}`}></i>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteCourse(courseId);
                                                }}
                                                className="action-btn delete-btn"
                                                title="Delete Course"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {sortedCourses.length === 0 && (
                    <div className="no-results">
                        <div className="no-results-inner">
                            <div className="no-results-icon">
                                <i className="fas fa-book-open"></i>
                            </div>
                            <h3>
                                {courses.length === 0
                                    ? 'No courses loaded'
                                    : filterStatus === 'published'
                                        ? 'No published courses'
                                        : filterStatus === 'draft'
                                            ? 'No draft courses'
                                            : 'No courses found'}
                            </h3>
                            <p>
                                {courses.length === 0
                                    ? 'Check that the backend is running and you are logged in, then refresh.'
                                    : filterStatus !== 'all'
                                        ? 'Try "All Status" or create a course and set its status to Published.'
                                        : 'Try a different search term or create your first course to get started.'}
                            </p>
                            {courses.length === 0 ? (
                                <button type="button" className="btn-primary no-results-cta" onClick={fetchCourses}>
                                    <i className="fas fa-sync-alt"></i> Refresh
                                </button>
                            ) : (
                                <button type="button" className="btn-primary no-results-cta" onClick={openCreateForm}>
                                    <i className="fas fa-plus"></i> Create Your First Course
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {toast.show && (
                <div className={`admin-toast admin-toast--${toast.type}`} role="status" aria-live="polite">
                    <div className="admin-toast-inner">
                        <div className="admin-toast-icon">
                            <i className={`fas fa-${toast.type === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
                        </div>
                        <p className="admin-toast-message">{toast.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CoursesManagement;