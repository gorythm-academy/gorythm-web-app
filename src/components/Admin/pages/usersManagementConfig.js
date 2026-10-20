export const USERS_PAGE_SIZE = 25;
export const PARENT_LINK_STUDENT_LIMIT = 50;
export const SEARCH_DEBOUNCE_MS = 300;

const STAFF_ROLE_SLUGS = ['manager', 'super-admin', 'accountant'];

export const VARIANT_CONFIG = {
    staff: {
        roles: STAFF_ROLE_SLUGS,
        segment: 'staff',
        pageTitle: 'Staff Accounts (Users)',
        addLabel: 'Add Staff User',
        icon: 'fa-users-cog',
        defaultRole: 'manager',
        fixedRole: null,
        showEnroll: false,
    },
    teachers: {
        roles: ['teacher'],
        segment: 'teachers',
        pageTitle: 'Teachers',
        addLabel: 'Add Teacher',
        icon: 'fa-chalkboard-teacher',
        defaultRole: 'teacher',
        fixedRole: 'teacher',
        showEnroll: false,
    },
    parents: {
        roles: ['parent'],
        segment: 'parents',
        pageTitle: 'Parents',
        addLabel: 'Add Parent',
        icon: 'fa-people-roof',
        defaultRole: 'parent',
        fixedRole: 'parent',
        showEnroll: false,
    },
};

export const PEOPLE_ROLE_OPTIONS = [
    { value: 'student', label: 'Student', icon: 'fa-user-graduate' },
    { value: 'teacher', label: 'Teacher/Instructor', icon: 'fa-chalkboard-teacher' },
    { value: 'parent', label: 'Parent/Guardian', icon: 'fa-people-roof' },
];

const COLUMN_DEFS = ['checkbox', 'user', 'role', 'status', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'];
const DEFAULT_COLUMN_WIDTHS = [60, 220, 160, 140, 150, 250, 250, 130, 180, 1];
const COLUMN_MIN_WIDTHS = [50, 140, 110, 100, 110, 140, 140, 100, 120, 90];
const COLUMN_MAX_WIDTHS = [90, 360, 260, 240, 280, 420, 420, 220, 320, 320];

export const TABLE_LAYOUT = {
    staff: {
        keys: COLUMN_DEFS,
        widths: DEFAULT_COLUMN_WIDTHS,
        mins: COLUMN_MIN_WIDTHS,
        maxs: COLUMN_MAX_WIDTHS,
    },
    teachers: {
        keys: ['checkbox', 'user', 'status', 'assignedCourses', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'],
        widths: [60, 240, 160, 260, 150, 250, 250, 130, 180, 1],
        mins: [50, 160, 120, 160, 110, 140, 140, 100, 120, 90],
        maxs: [90, 380, 260, 420, 280, 420, 420, 220, 320, 320],
    },
    parents: {
        keys: ['checkbox', 'user', 'status', 'children', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'],
        widths: [60, 240, 140, 260, 150, 250, 250, 130, 180, 1],
        mins: [50, 160, 100, 160, 110, 140, 140, 100, 120, 90],
        maxs: [90, 380, 240, 420, 280, 420, 420, 220, 320, 320],
    },
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GORYTHM_EMAIL_REGEX = /^[^\s@]+@gorythmacademy\.com$/i;
export const PERSONAL_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
