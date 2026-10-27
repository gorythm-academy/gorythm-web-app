import axios from 'axios';
import { AUTH_REALM, getAuthToken } from '../../../utils/authStorage';
import { slugifyCourseTitle } from '../../../utils/courseLinks';
import { API_BASE_URL } from '../../../config/constants';
import {
    cleanupCourseImage,
    uploadCourseImage,
    deleteCourseGalleryImage,
} from '../../../utils/fileUploadApi';
import { EMPTY_COURSE_FORM, toDateInputValue } from './coursesManagementConfig';

export function useCoursesForm({
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
}) {
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

    return {
        closeCourseForm,
        onCourseImageFile,
        selectGalleryImage,
        handleDeleteGalleryImage,
        openCreateForm,
        openEditForm,
        handleFormChange,
        toggleInstructorId,
        handleFormSubmit,
    };
}
