export const GORYTHM_EMAIL_DOMAIN = '@gorythmacademy.com';
export const GORYTHM_EMAIL_REGEX = /^[^\s@]+@gorythmacademy\.com$/i;
export const STUDENT_ID_REGEX = /^GRT-\d{4}-\d{3}$/;
export const PERSONAL_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
export const MIN_STUDENT_PASSWORD_LENGTH = 8;

export const ENROLLMENT_STATUS_OPTIONS = ['active', 'inactive', 'completed'];

export const ENROLLMENT_STATUS_BUTTONS = [
    { value: 'active', label: 'Active', color: '#10b981' },
    { value: 'inactive', label: 'Inactive', color: '#64748b' },
    { value: 'completed', label: 'Completed', color: 'var(--color-accent)' },
];

export const FEE_STATUS_VALUES = [
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' },
];

export const sanitizePortalEmailLocal = (raw) => {
    const value = String(raw ?? '');
    const beforeAt = value.includes('@') ? value.split('@')[0] : value;
    return beforeAt.replace(/\s+/g, '');
};

/** Map legacy/empty DB values to the three admin UI statuses. */
export const normalizeEnrollmentStatus = (status) => {
    if (!status || status === 'pending') return 'inactive';
    return ENROLLMENT_STATUS_OPTIONS.includes(status) ? status : 'inactive';
};

/** User account status aligned with enrollment status on create. */
export const userStatusFromEnrollmentStatus = (enrollmentStatus) =>
    normalizeEnrollmentStatus(enrollmentStatus);

export const validatePasswordPair = (password, confirmPassword, { required = false } = {}) => {
    const pwd = String(password || '');
    const confirm = String(confirmPassword || '');
    if (!pwd && !confirm) {
        if (required) return 'Password is required.';
        return null;
    }
    if (!pwd && confirm) {
        return 'Please enter the new password.';
    }
    if (pwd && !confirm) {
        return 'Please confirm the new password.';
    }
    if (pwd.length < MIN_STUDENT_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_STUDENT_PASSWORD_LENGTH} characters.`;
    }
    if (pwd !== confirm) return 'Passwords do not match.';
    return null;
};

export const validateStudentId = (studentId) => {
    const trimmed = String(studentId || '').trim();
    if (!trimmed) return null;
    if (!STUDENT_ID_REGEX.test(trimmed)) {
        return 'Student ID must match GRT-YYYY-### (e.g. GRT-2026-001) or be left blank.';
    }
    return null;
};

export const validatePersonalEmail = (personalEmail) => {
    const trimmed = String(personalEmail || '').trim();
    if (!trimmed) return null;
    if (trimmed !== trimmed.toLowerCase()) {
        return 'Personal email must be in lowercase letters.';
    }
    if (!PERSONAL_EMAIL_REGEX.test(trimmed)) {
        return 'Please enter a valid personal email format, or leave it blank.';
    }
    return null;
};

export const sortPublishedCourses = (courses) => {
    const list = Array.isArray(courses)
        ? courses.filter((c) => c?.status === 'published' || c?.isPublished === true)
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
};

export const getEnrollmentStatusIcon = (status) => {
    const normalized = normalizeEnrollmentStatus(status);
    switch (normalized) {
        case 'active':
            return 'play-circle';
        case 'completed':
            return 'flag-checkered';
        case 'inactive':
            return 'pause-circle';
        default:
            return 'question-circle';
    }
};
