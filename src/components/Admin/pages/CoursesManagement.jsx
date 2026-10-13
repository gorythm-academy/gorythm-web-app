import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CoursesManagementView } from './CoursesManagementView';
import axios from 'axios';
import { getAuthToken, AUTH_REALM } from '../../../utils/authStorage';
import { buildListCacheKey, createListCache } from '../../../utils/adminListCache';
import { getCategorySortIndex } from '../../../utils/courseMasonry';
import { getCourseDisplayOrder } from './coursesManagementShared';
import { slugifyCourseTitle } from '../../../utils/courseLinks';
import { API_BASE_URL } from '../../../config/constants';
import {
    cleanupCourseImage,
    deleteCourseGalleryImage,
    fetchCourseGalleryImages,
    uploadCourseImage,
} from '../../../utils/fileUploadApi';
import { useAdminDialog } from '../AdminDialogContext';
import { QUARANTINE_LABEL, MOVED_TO_QUARANTINE_PHRASE, FAILED_MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import './CoursesManagement.scss';

const DEFAULT_COLUMN_WIDTHS = [60, 210, 260, 180, 220, 120, 120, 130, 170, 130, 160, 1];
// Allow shrinking without a noticeable minimum width.
// The table layout is fixed + column widths are applied via <colgroup>,
// so setting this to 0 enables full drag-shrink behavior.
const COLUMN_MIN_WIDTHS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const COLUMN_MAX_WIDTHS = [90, 360, 440, 300, 380, 180, 180, 220, 280, 220, 240, 360];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toDateInputValue = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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
        feeDueDate: toDateInputValue(course.feeDueDate),
        totalFeeCount: course.totalFeeCount ? String(course.totalFeeCount) : '',
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
    feeDueDate: '',
    totalFeeCount: '',
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
            feeDueDate: toDateInputValue(course.feeDueDate),
            totalFeeCount: course.totalFeeCount ? String(course.totalFeeCount) : '',
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
            feeDueDate: formData.feeDueDate || '',
            totalFeeCount: formData.totalFeeCount === '' ? '' : Number(formData.totalFeeCount),
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
        if (formData.totalFeeCount !== '' && Number(formData.totalFeeCount) < 1) {
            showAlert('Total number of fees must be 1 or more, or left empty', 'warning');
            return;
        }
        if (formData.displayOrder !== '' && (Number.isNaN(Number(formData.displayOrder)) || Number(formData.displayOrder) < 0)) {
            showAlert('Display order must be 0 or greater', 'warning');
            return;
        }

        const previousDue = editingCourse ? toDateInputValue(editingCourse.feeDueDate) : '';
        const nextDue = formData.feeDueDate || '';
        if (nextDue && nextDue !== previousDue) {
            const confirmed = await showConfirm({
                title: 'Apply this due date to students?',
                message: editingCourse
                    ? 'This due date will be saved on this course and applied to every student enrolled in it. It will show on Admin → Students, the student Fees page, and the parent Fees page.'
                    : 'This due date will be saved on this course. Students enrolled in it later will receive this date on Admin → Students, the student Fees page, and the parent Fees page.',
                confirmLabel: 'Save due date',
            });
            if (!confirmed) return;
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
            title: 'Delete Permanently?',
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
            title: 'Delete Permanently?',
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
