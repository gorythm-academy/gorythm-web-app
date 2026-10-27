import { getCourseDisplayOrder } from './coursesManagementShared';
import { slugifyCourseTitle } from '../../../utils/courseLinks';

export const DEFAULT_COLUMN_WIDTHS = [60, 210, 260, 180, 220, 120, 120, 130, 170, 130, 160, 1];
// Allow shrinking without a noticeable minimum width.
// The table layout is fixed + column widths are applied via <colgroup>,
// so setting this to 0 enables full drag-shrink behavior.
export const COLUMN_MIN_WIDTHS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
export const COLUMN_MAX_WIDTHS = [90, 360, 440, 300, 380, 180, 180, 220, 280, 220, 240, 360];

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const toDateInputValue = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/** Given name only (first whitespace-separated token). */
export const teacherFirstName = (name) => {
    const part = String(name || '')
        .trim()
        .split(/\s+/)[0];
    return part || '';
};

export const isTeacherStatusActive = (teacher) =>
    !teacher?.deletedAt && (teacher?.status || 'active') === 'active';

export const buildCoursePayloadFromRecord = (course, overrides = {}) => {
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

export const TEACHER_PICKER_LIMIT = 50;

export const EMPTY_COURSE_FORM = {
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
