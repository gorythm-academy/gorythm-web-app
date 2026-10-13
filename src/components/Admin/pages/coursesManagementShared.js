import { getDisplayOrder } from '../../../utils/courseMasonry';

export const COLUMN_DEFS = [
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

export const formatCourseDueDate = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString();
};

export const getCourseDisplayOrder = (course) => getDisplayOrder(course);
