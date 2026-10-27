import { useMemo } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { getCategorySortIndex } from '../../../utils/courseMasonry';
import { getCourseDisplayOrder } from './coursesManagementShared';
import { API_BASE_URL } from '../../../config/constants';
import {
    QUARANTINE_LABEL,
    MOVED_TO_QUARANTINE_PHRASE,
    FAILED_MOVE_TO_QUARANTINE_PHRASE,
} from '../../../utils/adminListLabels';
import { buildCoursePayloadFromRecord } from './coursesManagementConfig';

export function useCoursesListActions({
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
}) {
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

    return {
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
    };
}
