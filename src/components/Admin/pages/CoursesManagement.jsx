import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import axios from 'axios';
import { getAuthToken, AUTH_REALM } from '../../../utils/authStorage';
import { buildListCacheKey, createListCache } from '../../../utils/adminListCache';
import {
    getCategorySortIndex,
    getDisplayOrder,
} from '../../../utils/courseMasonry';
import { slugifyCourseTitle } from '../../../utils/courseLinks';
import { API_BASE_URL } from '../../../config/constants';
import {
    cleanupCourseImage,
    deleteCourseGalleryImage,
    fetchCourseGalleryImages,
    uploadCourseImage,
} from '../../../utils/fileUploadApi';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import AdminMediaGallery from '../shared/AdminMediaGallery';
import { useAdminDialog } from '../AdminDialogContext';
import { QUARANTINE_LABEL, MOVED_TO_QUARANTINE_PHRASE, FAILED_MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import './CoursesManagement.scss';

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

const DEFAULT_COLUMN_WIDTHS = [60, 210, 260, 180, 220, 120, 120, 130, 170, 130, 160, 1];
// Allow shrinking without a noticeable minimum width.
// The table layout is fixed + column widths are applied via <colgroup>,
// so setting this to 0 enables full drag-shrink behavior.
const COLUMN_MIN_WIDTHS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const COLUMN_MAX_WIDTHS = [90, 360, 440, 300, 380, 180, 180, 220, 280, 220, 240, 360];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getCourseDisplayOrder = (course) => getDisplayOrder(course);

/** Given name only (first whitespace-separated token). */
const teacherFirstName = (name) => {
    const part = String(name || '')
        .trim()
        .split(/\s+/)[0];
    return part || '';
};

const isTeacherStatusActive = (teacher) =>
    !teacher?.deletedAt && (teacher?.status || 'active') === 'active';

const buildCoursePayloadFromRecord = (course, overrides = {}) => {
    const instructorIds =
        Array.isArray(course.instructorIds) && course.instructorIds.length
            ? course.instructorIds.map(String)
            : Array.isArray(course.instructors) && course.instructors.length
              ? course.instructors.map((t) => String(t._id || t))
              : course.instructor
                ? [String(course.instructor._id || course.instructor)]
                : [];
    return {
        title: course.title || '',
        description: course.description || '',
        category: course.category || 'Quranic Arabic',
        price: Number(course.price) || 0,
        duration: course.duration || '8 weeks',
        status: course.status || 'draft',
        level: course.level || 'beginner',
        instructorIds,
        displayOrder: getCourseDisplayOrder(course),
        masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? Number(course.masonryColumn) : null,
        homepageImage: course.homepageImage || '',
        slug: course.slug || slugifyCourseTitle(course.title),
        ...overrides,
    };
};

const TEACHER_PICKER_LIMIT = 50;

const EMPTY_COURSE_FORM = {
    title: '',
    slug: '',
    description: '',
    category: 'Quranic Arabic',
    price: '',
    duration: '8 weeks',
    status: 'draft',
    level: 'beginner',
    instructorIds: [],
    displayOrder: '',
    masonryColumn: '',
    homepageImage: '',
};

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

    const closeCourseForm = () => {
        const pendingImage = formData.homepageImage;
        const savedImage = savedImageOnEditRef.current;
        const sessionUploads = sessionUploadedPathsRef.current;
        setIsFormOpen(false);
        setEditingCourse(null);
        setSelectedCourses([]);
        setFormData({ ...EMPTY_COURSE_FORM });
        savedImageOnEditRef.current = '';
        slugTouchedRef.current = false;
        sessionUploadedPathsRef.current = new Set();
        if (
            pendingImage &&
            pendingImage !== savedImage &&
            sessionUploads.has(pendingImage)
        ) {
            cleanupCourseImage(pendingImage);
        }
    };

    const onCourseImageFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || imageUploadLockRef.current) return;

        imageUploadLockRef.current = true;
        setUploadingImage(true);
        try {
            const path = await uploadCourseImage(file, '');
            sessionUploadedPathsRef.current.add(path);
            setFormData((prev) => ({ ...prev, homepageImage: path }));
            await fetchGalleryImages();
        } catch (err) {
            showAlert(err.message || 'Could not upload image', 'error');
        } finally {
            setUploadingImage(false);
            imageUploadLockRef.current = false;
        }
    };

    const selectGalleryImage = (imagePath) => {
        setFormData((prev) => ({ ...prev, homepageImage: imagePath }));
    };

    const handleDeleteGalleryImage = async (image, event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!image?.path) return;
        const editingId = editingCourse?._id ? String(editingCourse._id) : null;
        const usedByOthers = (image.usedByCourseIds || []).some(
            (id) => !editingId || String(id) !== editingId
        );
        const confirmed = await showConfirm({
            title: 'Delete image?',
            message:
                image.usedBy > 0
                    ? usedByOthers
                        ? `Used by ${image.usedBy} course(s). Delete anyway and clear it from those courses?`
                        : 'This will remove the file and clear it from the course you are editing.'
                    : 'This will permanently remove the file from the server.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!confirmed) return;

        try {
            await deleteCourseGalleryImage(image.path, {
                excludeCourseId: editingId,
                force: image.usedBy > 0,
                realm: AUTH_REALM.ADMIN,
            });
            if (formData.homepageImage === image.path) {
                setFormData((prev) => ({ ...prev, homepageImage: '' }));
            }
            await fetchGalleryImages();
            showConfirmation('Image deleted.');
        } catch (err) {
            showAlert(err.message || 'Could not delete image', 'error');
        }
    };

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

    const reloadAfterMutation = useCallback(async () => {
        invalidateCoursesCache();
        await fetchCourses({ force: true, includeCounts: true });
    }, [fetchCourses, invalidateCoursesCache]);

    const handleManualRefresh = useCallback(() => {
        invalidateCoursesCache();
        fetchCourses({ force: true, includeCounts: true });
    }, [fetchCourses, invalidateCoursesCache]);

    const openCreateForm = () => {
        setEditingCourse(null);
        slugTouchedRef.current = false;
        savedImageOnEditRef.current = '';
        sessionUploadedPathsRef.current = new Set();
        setFormData({ ...EMPTY_COURSE_FORM });
        setTeacherSearch('');
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
            showAlert('Course data is invalid', 'error');
            return;
        }
        
        const courseId = course._id || course.id;
        if (!courseId) {
            console.error('Course ID not found. Course object:', course);
            showAlert('Course ID is missing. Cannot edit this course.', 'error');
            return;
        }
        
        setSelectedCourses([]);
        setEditingCourse(course);
        slugTouchedRef.current = true;
        savedImageOnEditRef.current = course.homepageImage || '';
        sessionUploadedPathsRef.current = new Set();
        setFormData({
            title: course.title || '',
            slug: course.slug || slugifyCourseTitle(course.title),
            description: course.description || '',
            category: course.category || 'Quranic Arabic',
            price: course.price != null ? String(course.price) : '0',
            duration: course.duration || '8 weeks',
            status: course.status || 'draft',
            level: course.level || 'beginner',
            instructorIds:
                Array.isArray(course.instructorIds) && course.instructorIds.length
                    ? course.instructorIds.map(String)
                    : Array.isArray(course.instructors) && course.instructors.length
                      ? course.instructors.map((t) => String(t._id || t))
                      : course.instructor
                        ? [String(course.instructor._id || course.instructor)]
                        : [],
            displayOrder: Number.isFinite(Number(course.displayOrder)) ? String(course.displayOrder) : '',
            masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? String(course.masonryColumn) : '',
            homepageImage: course.homepageImage || '',
        });
        setTeacherSearch('');
        setIsFormOpen(true);
        
        setTimeout(() => {
            const formCard = document.querySelector('.course-form-card');
            if (formCard) {
                formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        if (name === 'title') {
            setFormData((prev) => ({
                ...prev,
                title: value,
                slug: slugTouchedRef.current ? prev.slug : slugifyCourseTitle(value),
            }));
            return;
        }
        if (name === 'slug') {
            slugTouchedRef.current = true;
        }
        if (name === 'status' && value !== 'published') {
            setFormData((prev) => ({
                ...prev,
                status: value,
                instructorIds: [],
            }));
            return;
        }
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const toggleInstructorId = (teacherId) => {
        if (formData.status !== 'published') return;
        const id = String(teacherId);
        setFormData((prev) => {
            const ids = prev.instructorIds || [];
            const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
            return { ...prev, instructorIds: next };
        });
    };

    const buildFormPayload = () => {
        const displayOrderRaw = formData.displayOrder === '' ? 9999 : Number(formData.displayOrder);
        const published = formData.status === 'published';
        return {
            title: formData.title.trim(),
            description: formData.description.trim(),
            category: formData.category,
            price: Number(formData.price) || 0,
            duration: formData.duration.trim(),
            status: formData.status,
            level: formData.level,
            instructorIds: published
                ? (formData.instructorIds || []).filter((id) => activeTeacherIdSet.has(String(id)))
                : [],
            displayOrder: displayOrderRaw,
            masonryColumn: formData.masonryColumn === '' ? null : Number(formData.masonryColumn),
            homepageImage: (formData.homepageImage || '').trim(),
            slug: (formData.slug || '').trim() || slugifyCourseTitle(formData.title),
        };
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        if (isSubmitting) {
            return;
        }

        if (!formData.title.trim()) {
            showAlert('Please enter a course title', 'warning');
            return;
        }
        if (!formData.description.trim()) {
            showAlert('Please enter a course description', 'warning');
            return;
        }
        if (!formData.duration.trim()) {
            showAlert('Please enter course duration (e.g., "8 weeks")', 'warning');
            return;
        }
        if (formData.displayOrder !== '' && (Number.isNaN(Number(formData.displayOrder)) || Number(formData.displayOrder) < 0)) {
            showAlert('Display order must be 0 or greater', 'warning');
            return;
        }

        setIsSubmitting(true);
        const token = getAuthToken();
        
        if (!token) {
            showAlert('Authentication token not found. Please log in again.', 'error');
            setIsSubmitting(false);
            return;
        }

        const payload = buildFormPayload();

        try {
            if (editingCourse) {
                const courseId = editingCourse._id || editingCourse.id;
                
                if (!courseId) {
                    showAlert('Course ID is missing. Cannot update course.', 'error');
                    setIsSubmitting(false);
                    return;
                }
                
                await axios.put(
                    `${API_BASE_URL}/api/courses/${courseId}`,
                    payload,
                    { 
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        } 
                    }
                );
                showConfirmation('Course updated successfully!');
            } else {
                await axios.post(
                    `${API_BASE_URL}/api/courses`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                showConfirmation('Course created successfully!');
            }

            savedImageOnEditRef.current = payload.homepageImage;
            sessionUploadedPathsRef.current = new Set();
            setIsFormOpen(false);
            setEditingCourse(null);
            setSelectedCourses([]);
            setFormData({ ...EMPTY_COURSE_FORM });
        
            await reloadAfterMutation();
        } catch (error) {
            console.error('Error saving course:', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);
            
            let errorMessage = 'Failed to save course';
            
            if (error.response) {
                if (error.response.status === 404) {
                    errorMessage = `Course not found (404). ID: ${editingCourse?._id}`;
                    await reloadAfterMutation(); // Refresh list
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
            
            showAlert(`Failed to save course: ${errorMessage}`, 'error');
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
        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `This course will be unpublished and hidden from the website. Restore from the ${QUARANTINE_LABEL} tab.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) return;

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/courses/${courseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setSelectedCourses(prev => prev.filter(id => id !== courseId));
            await reloadAfterMutation();
            showConfirmation(`Course ${MOVED_TO_QUARANTINE_PHRASE}.`);
        } catch (error) {
            console.error(`Error moving course to ${QUARANTINE_LABEL}:`, error);
            const errorMessage = error.response?.data?.error || error.message || FAILED_MOVE_TO_QUARANTINE_PHRASE;
            showAlert(`${FAILED_MOVE_TO_QUARANTINE_PHRASE}: ${errorMessage}. Please try again.`, 'error');
        }
    };

    const restoreCourse = async (courseId) => {
        if (trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Restore course?',
            message: 'The course will be restored as a draft and stay hidden from the website until you publish it again.',
            confirmLabel: 'Restore',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/courses/${courseId}/restore`, null, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            showConfirmation('Course restored. It remains a draft — publish it when ready.');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to restore course', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const permanentDeleteCourse = async (courseId) => {
        if (listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete permanently?',
            message: 'This cannot be undone. The course will be removed from the database.',
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/courses/${courseId}/permanent`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            setSelectedCourses((prev) => prev.filter((id) => id !== courseId));
            showConfirmation('Course permanently deleted.');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to permanently delete course', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    // FIXED: Bulk delete function
    const deleteSelectedCourses = async () => {
        if (!selectedCourses.length || listTab !== 'active') {
            return;
        }
        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move ${selectedCourses.length} selected course(s) to ${QUARANTINE_LABEL}? They will be hidden from the website.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            // FIXED: Use correct endpoint and payload format
            const response = await axios.post(
                `${API_BASE_URL}/api/courses/bulk-delete`, 
                { ids: selectedCourses },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await reloadAfterMutation();
            setSelectedCourses([]);
            showConfirmation(response.data.message || `${selectedCourses.length} course(s) ${MOVED_TO_QUARANTINE_PHRASE}.`);
        } catch (error) {
            console.error('Error deleting selected courses:', error);
            console.error('Error details:', error.response?.data);
            showAlert(`Failed to delete selected courses: ${error.response?.data?.error || error.message}`, 'error');
        }
    };

    const restoreSelectedCourses = async () => {
        if (!selectedCourses.length || listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Restore selected courses?',
            message: `${selectedCourses.length} course(s) will be restored as drafts.`,
            confirmLabel: 'Restore',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            const response = await axios.post(
                `${API_BASE_URL}/api/courses/bulk-restore`,
                { ids: selectedCourses },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await reloadAfterMutation();
            setSelectedCourses([]);
            showConfirmation(response.data.message || 'Courses restored.');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to restore selected courses', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const permanentDeleteSelectedCourses = async () => {
        if (!selectedCourses.length || listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete permanently?',
            message: `Permanently delete ${selectedCourses.length} course(s)? This cannot be undone.`,
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            const response = await axios.post(
                `${API_BASE_URL}/api/courses/bulk-permanent`,
                { ids: selectedCourses },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await reloadAfterMutation();
            setSelectedCourses([]);
            showConfirmation(response.data.message || 'Courses permanently deleted.');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to permanently delete selected courses', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const toggleStatus = async (courseId, currentStatus) => {
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        await setCourseStatus(courseId, newStatus);
    };

    const setCourseStatus = async (courseId, newStatus) => {
        if (!['published', 'draft'].includes(newStatus)) return;
        try {
            const token = getAuthToken();
            await axios.patch(
                `${API_BASE_URL}/api/courses/${courseId}/status`,
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await reloadAfterMutation();
            showConfirmation('Status updated successfully.');
        } catch (error) {
            console.error('Error updating course status:', error);
            showAlert('Failed to update course status. Please try again.', 'error');
        }
    };

    const toggleSelectedStatus = async () => {
        if (listTab !== 'active') return;
        const targetStatus = await showChoice({
            title: 'Set Course Status',
            message: `Choose the status for ${selectedCourses.length} selected course(s).`,
            choices: [
                { value: 'published', label: 'Published' },
                { value: 'draft', label: 'Draft' },
            ],
        });
        if (!targetStatus || !['published', 'draft'].includes(targetStatus)) return;

        try {
            const token = getAuthToken();
            const response = await axios.patch(`${API_BASE_URL}/api/courses/bulk-status`, 
                { courseIds: selectedCourses, status: targetStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await reloadAfterMutation();
            showConfirmation(response.data?.message || `${selectedCourses.length} course(s) updated`);
        } catch (error) {
            console.error('Error updating selected courses status:', error);
            showAlert('Failed to update status for selected courses. Please try again.', 'error');
        }
    };

    const filteredCourses = courses.filter(course => {
        const matchesSearch = 
            course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            course.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (course.instructorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            formatCourseTeachersColumn(course).toLowerCase().includes(searchTerm.toLowerCase()) ||
            (course.instructors || []).some((t) => (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()));
        
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
            const orderA = getCourseDisplayOrder(a);
            const orderB = getCourseDisplayOrder(b);
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
            if (key === 'instructor') {
                return formatCourseTeachersColumn(c).toLowerCase();
            }
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

    const displayOrderUsage = useMemo(() => {
        if (listTab !== 'active') return new Map();
        const map = new Map();
        courses.forEach((course) => {
            const order = getCourseDisplayOrder(course);
            map.set(order, (map.get(order) || 0) + 1);
        });
        return map;
    }, [courses, listTab]);

    const duplicateDisplayOrderCount = useMemo(() => {
        let duplicates = 0;
        displayOrderUsage.forEach((count) => {
            if (count > 1) duplicates += count;
        });
        return duplicates;
    }, [displayOrderUsage]);

    const courseHasDuplicateDisplayOrder = (course) =>
        (displayOrderUsage.get(getCourseDisplayOrder(course)) || 0) > 1;

    const renumberCoursesByDisplayOrder = async () => {
        if (listTab !== 'active' || sortedCourses.length === 0) return;
        const confirmed = await showConfirm({
            title: 'Renumber display order?',
            message: `Assign display order 0, 1, 2… to ${sortedCourses.length} course(s) in the current table order (display order → category → title).`,
            confirmLabel: 'Renumber',
        });
        if (!confirmed) return;

        const token = getAuthToken();
        if (!token) {
            showAlert('Authentication token not found. Please log in again.', 'error');
            return;
        }

        setTrashBusy(true);
        try {
            await Promise.all(
                sortedCourses.map((course, index) => {
                    const courseId = course._id || course.id;
                    return axios.put(
                        `${API_BASE_URL}/api/courses/${courseId}`,
                        buildCoursePayloadFromRecord(course, { displayOrder: index }),
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                })
            );
            await reloadAfterMutation();
            showConfirmation('Display order renumbered.');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to renumber courses', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

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
        <div className="courses-management">
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-book"></i> Course Management</h1>
                    <p>Create, edit, and manage academy courses</p>
                </div>
                <div className="header-right">
                    {listTab === 'active' ? (
                        <button type="button" className="btn-primary btn-add" onClick={openCreateForm}>
                            <i className="fas fa-plus"></i> Add Course
                        </button>
                    ) : null}
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
                        <p>Catalog list price</p>
                    </div>
                </div>
            </div>

            <div className="students-list-tabs courses-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('active');
                        setSelectedCourses([]);
                    }}
                >
                    <i className="fas fa-list" /> Active courses
                </button>
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('trash');
                        setSelectedCourses([]);
                    }}
                >
                    <i className="fas fa-archive" /> {QUARANTINE_LABEL}
                    {trashCount > 0 ? ` (${trashCount})` : ''}
                </button>
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
                    {listTab === 'active' ? (
                        <select 
                            className="status-filter"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="all">All Status</option>
                            <option value="published">Published</option>
                            <option value="draft">Draft</option>
                        </select>
                    ) : null}
                    
                    <button className="refresh-btn" onClick={handleManualRefresh} type="button" title="Refresh" aria-label="Refresh">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                    {listTab === 'active' && duplicateDisplayOrderCount > 0 ? (
                        <button
                            type="button"
                            className="courses-renumber-btn"
                            onClick={renumberCoursesByDisplayOrder}
                            disabled={trashBusy}
                        >
                            <i className="fas fa-sort-numeric-down" aria-hidden="true"></i>
                            <span>Renumber</span>
                        </button>
                    ) : null}
                </div>
            </div>

            {listTab === 'active' && duplicateDisplayOrderCount > 0 ? (
                <div className="courses-order-warning" role="status">
                    <i className="fas fa-exclamation-triangle" aria-hidden="true" />
                    <span>
                        <strong>{duplicateDisplayOrderCount} courses share a display order.</strong>
                        {' '}Ties sort by category, then title. Use unique numbers or click Renumber.
                    </span>
                </div>
            ) : null}

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
                            </div>
                        )}
                        <button
                            type="button"
                            className="modal-close-btn"
                            onClick={closeCourseForm}
                            aria-label="Close"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                    <form onSubmit={handleFormSubmit} className="course-form">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Title <RequiredMark /></label>
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
                                <label>URL slug</label>
                                <input
                                    type="text"
                                    name="slug"
                                    value={formData.slug}
                                    onChange={handleFormChange}
                                    placeholder="url-friendly-slug"
                                />
                                <span className="form-field-hint">Public URL: /courses/{formData.slug || slugifyCourseTitle(formData.title) || '…'}</span>
                            </div>
                            <div className="form-group">
                                <label>Category <RequiredMark /></label>
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
                            <div className="form-group form-group-full">
                                <label>Assigned teachers (optional)</label>
                                {formData.status === 'published' ? (
                                    <input
                                        type="search"
                                        className="course-teachers-search"
                                        placeholder="Search teachers by name or email…"
                                        value={teacherSearch}
                                        onChange={(e) => setTeacherSearch(e.target.value)}
                                        disabled={isSubmitting}
                                    />
                                ) : null}
                                <div className="course-teachers-assign-list">
                                    {formData.status !== 'published' ? (
                                        <p className="form-field-hint">
                                            Publish the course to assign teachers. Draft and unpublished courses cannot have teachers.
                                        </p>
                                    ) : teachersLoading ? (
                                        <p className="form-field-hint">Loading teachers…</p>
                                    ) : activeTeachers.length === 0 ? (
                                        <p className="form-field-hint">No active teachers match. Try a different search.</p>
                                    ) : (
                                        activeTeachers.map((t) => (
                                            <label key={t._id} className="checkbox-label course-teachers-assign-item">
                                                <input
                                                    type="checkbox"
                                                    checked={(formData.instructorIds || []).includes(String(t._id))}
                                                    onChange={() => toggleInstructorId(t._id)}
                                                    disabled={isSubmitting}
                                                />
                                                <span>
                                                    {t.name} (<span className="admin-email">{t.email}</span>)
                                                </span>
                                            </label>
                                        ))
                                    )}
                                </div>
                                <span className="form-field-hint">
                                    Only on published courses. Same list as the Teachers tab.
                                </span>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group form-group-full">
                                <label>Description <RequiredMark /></label>
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
                                <label>Price ($) <RequiredMark /></label>
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
                                <label>Duration <RequiredMark /></label>
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
                                    <option value="3">Right (desktop)</option>
                                </select>
                                <span className="form-field-hint">Right column maps to the 2nd column on tablet/mobile layouts.</span>
                            </div>
                        </div>
                        <div className="course-image-section">
                            <div className="course-image-section__header">
                                <label>Course image</label>
                                <span className="course-image-section__hint">
                                    Upload a new image or pick one from the gallery
                                </span>
                            </div>
                            <div className="course-image-section__preview-row">
                                <div className="course-image-section__preview">
                                    {formData.homepageImage ? (
                                        <img
                                            src={resolveMediaUrl(formData.homepageImage)}
                                            alt="Selected course"
                                        />
                                    ) : (
                                        <div className="course-image-section__preview-empty">
                                            <i className="fas fa-image" aria-hidden="true" />
                                            <span>No image selected</span>
                                        </div>
                                    )}
                                    {formData.homepageImage && (
                                        <button
                                            type="button"
                                            className="course-image-section__clear"
                                            onClick={() => setFormData((prev) => ({ ...prev, homepageImage: '' }))}
                                            title="Clear selection"
                                        >
                                            <i className="fas fa-times" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                                <div className="course-image-section__upload">
                                    <label className="course-image-section__upload-btn">
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
                                            onChange={onCourseImageFile}
                                            disabled={uploadingImage}
                                        />
                                        <i className={`fas ${uploadingImage ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'}`} aria-hidden="true" />
                                        {uploadingImage ? 'Uploading…' : 'Upload image'}
                                    </label>
                                    <span className="course-image-section__upload-note">
                                        JPEG, PNG, WebP, or AVIF · large images are resized automatically
                                    </span>
                                </div>
                            </div>
                            <div className="course-image-section__gallery-head">
                                <span>Image Gallery</span>
                                {galleryLoading && (
                                    <span className="course-image-section__gallery-loading">
                                        <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Loading…
                                    </span>
                                )}
                            </div>
                            {brokenGalleryCount > 0 ? (
                                <p className="promo-thumb-gallery__warning" role="status">
                                    <i className="fas fa-exclamation-triangle" aria-hidden="true" />
                                    <strong>
                                        {brokenGalleryCount} image file{brokenGalleryCount === 1 ? '' : 's'} missing on
                                        disk
                                    </strong>
                                    — re-upload and save the course to fix.
                                </p>
                            ) : null}
                            <AdminMediaGallery
                                images={galleryImages}
                                loading={galleryLoading}
                                selectedPath={formData.homepageImage}
                                onSelect={selectGalleryImage}
                                onDelete={handleDeleteGalleryImage}
                                showFilename={false}
                                emptyMessage="No images yet. Upload one above — it will appear here for all courses."
                            />
                        </div>
                        <div className="form-actions">
                            <button 
                                type="submit" 
                                className={`btn-primary${editingCourse ? ' btn-save' : ' btn-add'}`}
                                disabled={isSubmitting || uploadingImage}
                            >
                                {isSubmitting ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin"></i> {editingCourse ? 'Updating...' : 'Creating...'}
                                    </>
                                ) : (
                                    <>
                                        <i className={editingCourse ? 'fas fa-save' : 'fas fa-plus'}></i> {editingCourse ? 'Update Course' : 'Create Course'}
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={closeCourseForm}
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
                        {listTab === 'active' ? (
                            <>
                                <button className="bulk-btn" onClick={toggleSelectedStatus}>
                                    <i className="fas fa-eye"></i> Set Status
                                </button>
                                <button className="bulk-btn delete" onClick={deleteSelectedCourses}>
                                    <i className="fas fa-archive"></i> Move to {QUARANTINE_LABEL}
                                </button>
                            </>
                        ) : (
                            <>
                                <button className="bulk-btn" onClick={restoreSelectedCourses} disabled={trashBusy}>
                                    <i className="fas fa-undo"></i> Restore selected
                                </button>
                                <button className="bulk-btn delete" onClick={permanentDeleteSelectedCourses} disabled={trashBusy}>
                                    <i className="fas fa-trash-alt"></i> Delete forever
                                </button>
                            </>
                        )}
                        <button
                            className="bulk-btn edit"
                            onClick={() => {
                                if (selectedCourses.length !== 1) {
                                    showAlert('Please select only one course to edit', 'warning');
                                    return;
                                }
                                const course = courses.find((c) => String(c._id || c.id) === String(selectedCourses[0]));
                                if (!course) {
                                    showAlert('Selected course not found', 'warning');
                                    return;
                                }
                                openEditForm(course);
                            }}
                        >
                            <i className="fas fa-edit"></i> Edit Selected
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
                                style={
                                    key === 'actions'
                                        ? { width: '1%' }
                                        : { width: `${columnWidths[idx]}px` }
                                }
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
                                Teachers
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
                                    aria-label="Resize Teachers column"
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
                            <th className="action-col">
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
                                <tr key={courseId} className={[
                                    selectedCourses.includes(courseId) ? 'selected' : '',
                                    courseHasDuplicateDisplayOrder(course) ? 'duplicate-display-order' : '',
                                ].filter(Boolean).join(' ')}>
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
                                                #{getCourseDisplayOrder(course)}
                                                {courseHasDuplicateDisplayOrder(course) ? ' (duplicate)' : ''}
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
                                    <td>{formatCourseTeachersColumn(course)}</td>
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
                                        <div className="status-cell">
                                            <span className={`status-badge ${course.status}`}>
                                                {course.status
                                                    ? course.status.charAt(0).toUpperCase() + course.status.slice(1)
                                                    : 'Draft'}
                                            </span>
                                            {listTab === 'active' ? (
                                                <select
                                                    className="status-select-inline"
                                                    value={course.status === 'published' ? 'published' : 'draft'}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        setCourseStatus(courseId, e.target.value);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    title="Change status"
                                                >
                                                    <option value="published">Published</option>
                                                    <option value="draft">Draft</option>
                                                </select>
                                            ) : null}
                                        </div>
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
                                    <td className="action-col cell-actions">
                                        <div className="action-buttons action-buttons--stacked">
                                            {listTab === 'trash' ? (
                                                <div className="action-buttons__row">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            restoreCourse(courseId);
                                                        }}
                                                        className="action-btn restore-btn"
                                                        title="Restore course"
                                                        disabled={trashBusy}
                                                    >
                                                        <i className="fas fa-undo"></i> Restore
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            permanentDeleteCourse(courseId);
                                                        }}
                                                        className="action-btn delete-btn"
                                                        title="Delete permanently"
                                                        disabled={trashBusy}
                                                    >
                                                        <i className="fas fa-times-circle"></i> Delete forever
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="action-buttons__row">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const segment = course.slug || courseId;
                                                                window.open(`/courses/${segment}?preview=1`, '_blank', 'noopener,noreferrer');
                                                            }}
                                                            className="action-btn view-btn"
                                                            title="Preview course page"
                                                        >
                                                            <i className="fas fa-external-link-alt"></i> Preview
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openEditForm(course);
                                                            }}
                                                            className="action-btn edit-btn"
                                                            title="Edit Course"
                                                        >
                                                            <i className="fas fa-edit"></i> Edit
                                                        </button>
                                                    </div>
                                                    <div className="action-buttons__row">
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
                                                            {course.status === 'published' ? ' Unpublish' : ' Publish'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteCourse(courseId);
                                                            }}
                                                            className="action-btn delete-btn"
                                                            title={`Move to ${QUARANTINE_LABEL}`}
                                                        >
                                                            <i className="fas fa-trash"></i> Delete
                                                        </button>
                                                    </div>
                                                </>
                                            )}
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
                                <button type="button" className="refresh-btn" onClick={handleManualRefresh} title="Refresh" aria-label="Refresh">
                                    <i className="fas fa-sync-alt"></i>
                                </button>
                            ) : (
                                <button type="button" className="btn-primary btn-add no-results-cta" onClick={openCreateForm}>
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