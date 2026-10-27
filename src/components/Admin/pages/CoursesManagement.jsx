import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CoursesManagementView } from './CoursesManagementView';
import { useCoursesForm } from './useCoursesForm';
import { useCoursesListActions } from './useCoursesListActions';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { buildListCacheKey, createListCache } from '../../../utils/adminListCache';
import { API_BASE_URL } from '../../../config/constants';
import { fetchCourseGalleryImages } from '../../../utils/fileUploadApi';
import { useAdminDialog } from '../AdminDialogContext';
import {
    DEFAULT_COLUMN_WIDTHS,
    COLUMN_MIN_WIDTHS,
    COLUMN_MAX_WIDTHS,
    clamp,
    teacherFirstName,
    isTeacherStatusActive,
    TEACHER_PICKER_LIMIT,
    EMPTY_COURSE_FORM,
} from './coursesManagementConfig';
import './CoursesManagement.scss';

const CoursesManagement = () => {
    const { showAlert, showConfirm, showChoice } = useAdminDialog();
    const [courses, setCourses] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [teacherSearch, setTeacherSearch] = useState('');
    const [teachersLoading, setTeachersLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedCourses, setSelectedCourses] = useState([]);
    const [totalUniqueStudents, setTotalUniqueStudents] = useState(0);
    const [listTab, setListTab] = useState('active');
    const [trashCount, setTrashCount] = useState(0);
    const [trashBusy, setTrashBusy] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);
    const [academyDueDate, setAcademyDueDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ ...EMPTY_COURSE_FORM });
    const [galleryImages, setGalleryImages] = useState([]);
    const [galleryLoading, setGalleryLoading] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const savedImageOnEditRef = useRef('');
    const slugTouchedRef = useRef(false);
    const sessionUploadedPathsRef = useRef(new Set());
    const imageUploadLockRef = useRef(false);
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
    const listCacheRef = useRef(createListCache());
    const isFirstListLoadRef = useRef(true);
    const [isTableDragging, setIsTableDragging] = useState(false);

    const invalidateCoursesCache = useCallback(() => {
        listCacheRef.current.clear();
    }, []);

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

    const activeTeachers = useMemo(
        () => (teachers || []).filter(isTeacherStatusActive),
        [teachers]
    );

    const activeTeacherIdSet = useMemo(
        () => new Set(activeTeachers.map((t) => String(t._id))),
        [activeTeachers]
    );

    const teacherNameById = useMemo(() => {
        const map = new Map();
        for (const t of teachers || []) {
            map.set(String(t._id), t.name || '');
        }
        return map;
    }, [teachers]);

    /** Teachers column: populated API data (list view does not rely on form picker state). */
    const formatCourseTeachersColumn = useCallback(
        (course) => {
            const names = [];
            const seen = new Set();
            const pushTeacher = (rawId, fallbackName = '') => {
                const id = String(rawId || '');
                const full =
                    fallbackName ||
                    (id ? teacherNameById.get(id) : '') ||
                    '';
                const first = teacherFirstName(full);
                const dedupeKey = id || first.toLowerCase();
                if (!first || seen.has(dedupeKey)) return;
                seen.add(dedupeKey);
                names.push(first);
            };

            for (const t of course.instructors || []) {
                pushTeacher(t?._id || t, typeof t === 'object' ? t.name : '');
            }
            if (course.instructor) {
                pushTeacher(
                    course.instructor._id || course.instructor,
                    typeof course.instructor === 'object' ? course.instructor.name : ''
                );
            }
            for (const id of course.instructorIds || []) {
                pushTeacher(id);
            }
            if (!names.length && course.instructorName) {
                return course.instructorName
                    .split(',')
                    .map((part) => teacherFirstName(part.trim()))
                    .filter(Boolean)
                    .join(', ') || '—';
            }
            return names.length ? names.join(', ') : '—';
        },
        [teacherNameById]
    );

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

    const mergeTeachersForForm = useCallback((incoming, assigned = []) => {
        const map = new Map();
        for (const t of incoming || []) {
            if (t?._id) map.set(String(t._id), t);
        }
        for (const t of assigned || []) {
            const id = String(t?._id || t);
            if (id && !map.has(id)) {
                map.set(id, typeof t === 'object' ? t : { _id: id, name: '' });
            }
        }
        setTeachers([...map.values()]);
    }, []);

    const fetchTeachersForForm = useCallback(async (search = '', assigned = []) => {
        const token = getAuthToken();
        if (!token) return;
        setTeachersLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    role: 'teacher',
                    limit: TEACHER_PICKER_LIMIT,
                    search: search.trim() || undefined,
                    sortBy: 'name',
                    sortOrder: 'asc',
                },
            });
            mergeTeachersForForm(res.data?.users || [], assigned);
        } catch {
            mergeTeachersForForm([], assigned);
        } finally {
            setTeachersLoading(false);
        }
    }, [mergeTeachersForForm]);

    useEffect(() => {
        if (!isFormOpen) return undefined;
        const delay = teacherSearch.trim() ? 300 : 0;
        const assigned =
            editingCourse?.instructors ||
            (editingCourse?.instructor ? [editingCourse.instructor] : []);
        const timer = window.setTimeout(() => {
            fetchTeachersForForm(teacherSearch, assigned);
        }, delay);
        return () => window.clearTimeout(timer);
    }, [isFormOpen, teacherSearch, editingCourse, fetchTeachersForForm]);

    const fetchGalleryImages = useCallback(async () => {
        setGalleryLoading(true);
        try {
            const images = await fetchCourseGalleryImages();
            setGalleryImages(images);
        } catch {
            setGalleryImages([]);
        } finally {
            setGalleryLoading(false);
        }
    }, []);

    const brokenGalleryCount = useMemo(
        () => galleryImages.filter((img) => img.onDisk === false).length,
        [galleryImages]
    );

    useEffect(() => {
        if (isFormOpen) {
            fetchGalleryImages();
        }
    }, [isFormOpen, fetchGalleryImages]);

    const fetchCourses = useCallback(async (options = {}) => {
        const cacheKey = buildListCacheKey({ listTab });
        if (!options.force && listCacheRef.current.has(cacheKey)) {
            const cached = listCacheRef.current.get(cacheKey);
            setCourses(cached.courses);
            setTotalUniqueStudents(cached.totalUniqueStudents);
            if (typeof cached.trashCount === 'number') setTrashCount(cached.trashCount);
            setLoading(false);
            setHasLoadedOnce(true);
            return;
        }

        try {
            if (!options.force) setCourses([]);
            setLoading(true);
            const token = getAuthToken();
            const includeCounts = options.includeCounts
                || isFirstListLoadRef.current
                || options.tabChanged;

            const requests = [
                axios.get(`${API_BASE_URL}/api/courses`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        ...(listTab === 'trash' ? { trash: '1' } : {}),
                        ...(includeCounts ? { includeCounts: 1 } : {}),
                    },
                }),
            ];

            const results = await Promise.all(requests);
            const coursesRes = results[0];

            const raw = coursesRes.data?.courses || [];
            if (typeof coursesRes.data?.trashCount === 'number') {
                setTrashCount(coursesRes.data.trashCount);
            }
            const coursesFromDb = raw.map((c) => ({
                ...c,
                status: c.status === 'published' || c.status === 'draft'
                    ? c.status
                    : (c.isPublished === true ? 'published' : 'draft'),
            }));
            const uniqueTotal = Number(coursesRes.data?.totalUniqueStudents) || 0;
            listCacheRef.current.set(cacheKey, {
                courses: coursesFromDb,
                totalUniqueStudents: uniqueTotal,
                trashCount: coursesRes.data?.trashCount,
            });
            setCourses(coursesFromDb);
            setTotalUniqueStudents(uniqueTotal);
            setHasLoadedOnce(true);
            isFirstListLoadRef.current = false;
        } catch (error) {
            console.error('Error fetching courses:', error);
            setCourses([]);
            setTotalUniqueStudents(0);
        } finally {
            setLoading(false);
        }
    }, [listTab]);

    useEffect(() => {
        fetchCourses({ includeCounts: true, tabChanged: true });
    }, [listTab, fetchCourses]);

    useEffect(() => {
        const token = getAuthToken();
        if (!token) return;
        axios.get(`${API_BASE_URL}/api/payments/admin/fee-due-settings`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            if (res.data?.success) setAcademyDueDate(res.data.defaultFeeDueDate || '');
        }).catch(() => {});
    }, []);

    const reloadAfterMutation = useCallback(async () => {
        invalidateCoursesCache();
        await fetchCourses({ force: true, includeCounts: true });
    }, [fetchCourses, invalidateCoursesCache]);

    const handleManualRefresh = useCallback(() => {
        invalidateCoursesCache();
        fetchCourses({ force: true, includeCounts: true });
    }, [fetchCourses, invalidateCoursesCache]);

    const {
        closeCourseForm,
        onCourseImageFile,
        selectGalleryImage,
        handleDeleteGalleryImage,
        openCreateForm,
        openEditForm,
        handleFormChange,
        toggleInstructorId,
        handleFormSubmit,
    } = useCoursesForm({
        formData,
        savedImageOnEditRef,
        sessionUploadedPathsRef,
        setIsFormOpen,
        setEditingCourse,
        setSelectedCourses,
        setFormData,
        slugTouchedRef,
        imageUploadLockRef,
        setUploadingImage,
        fetchGalleryImages,
        showAlert,
        editingCourse,
        showConfirm,
        showConfirmation,
        setTeacherSearch,
        activeTeacherIdSet,
        isSubmitting,
        setIsSubmitting,
        reloadAfterMutation,
    });

    const {
        toggleCourseSelection,
        toggleAllCourses,
        deleteCourse,
        restoreCourse,
        permanentDeleteCourse,
        deleteSelectedCourses,
        restoreSelectedCourses,
        permanentDeleteSelectedCourses,
        toggleStatus,
        setCourseStatus,
        toggleSelectedStatus,
        handleSort,
        sortedCourses,
        duplicateDisplayOrderCount,
        courseHasDuplicateDisplayOrder,
        renumberCoursesByDisplayOrder,
    } = useCoursesListActions({
        setSelectedCourses,
        selectedCourses,
        showConfirm,
        reloadAfterMutation,
        showConfirmation,
        showAlert,
        trashBusy,
        setTrashBusy,
        listTab,
        showChoice,
        courses,
        searchTerm,
        formatCourseTeachersColumn,
        filterStatus,
        sortBy,
        setSortOrder,
        setSortBy,
        sortOrder,
    });

    if (loading && !hasLoadedOnce && !courses.length) {
        return (
            <div className="courses-management">
                <div className="page-header">
                    <div className="header-left">
                        <h1><i className="fas fa-book"></i> Course Management</h1>
                    </div>
                </div>
                <div className="courses-table-skeleton" aria-hidden>
                    {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="courses-table-skeleton__row" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <CoursesManagementView
            state={{
                academyDueDate,
                activeTeachers,
                brokenGalleryCount,
                closeCourseForm,
                columnWidths,
                courseHasDuplicateDisplayOrder,
                courses,
                deleteCourse,
                deleteSelectedCourses,
                duplicateDisplayOrderCount,
                editingCourse,
                filterStatus,
                formData,
                formatCourseTeachersColumn,
                galleryImages,
                galleryLoading,
                handleDeleteGalleryImage,
                handleFormChange,
                handleFormSubmit,
                handleManualRefresh,
                handleSort,
                isFormOpen,
                isSubmitting,
                isTableDragging,
                listTab,
                onCourseImageFile,
                onTableDragScroll,
                openCreateForm,
                openEditForm,
                permanentDeleteCourse,
                permanentDeleteSelectedCourses,
                renumberCoursesByDisplayOrder,
                resetColumnWidth,
                restoreCourse,
                restoreSelectedCourses,
                searchTerm,
                selectGalleryImage,
                selectedCourses,
                setCourseStatus,
                setFilterStatus,
                setFormData,
                setListTab,
                setSearchTerm,
                setSelectedCourses,
                setTeacherSearch,
                showAlert,
                sortBy,
                sortOrder,
                sortedCourses,
                startColumnResize,
                startTableDragScroll,
                stopTableDragScroll,
                tableContainerRef,
                teacherSearch,
                teachersLoading,
                toast,
                toggleAllCourses,
                toggleCourseSelection,
                toggleInstructorId,
                toggleSelectedStatus,
                toggleStatus,
                totalUniqueStudents,
                trashBusy,
                trashCount,
                uploadingImage,
            }}
        />
    );
};

export default CoursesManagement;
