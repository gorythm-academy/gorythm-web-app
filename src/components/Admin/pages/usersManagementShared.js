export function displayRoleLabel(role) {
    if (role === 'manager') return 'Manager';
    if (role === 'super-admin') return 'Super Admin';
    if (role === 'teacher') return 'Teacher';
    if (role === 'parent') return 'Parent';
    if (role === 'student') return 'Student';
    if (role === 'accountant') return 'Accountant';
    return role || '—';
}

export const COLUMN_LABELS = {
    checkbox: '',
    user: 'User',
    role: 'Role',
    status: 'Status',
    assignedCourses: 'Assigned Courses',
    children: 'Children',
    phone: 'Phone',
    email: 'Email',
    personalEmail: 'Personal email',
    joined: 'Joined',
    lastLogin: 'Last Login',
    actions: 'Actions',
};

export const GORYTHM_EMAIL_DOMAIN = '@gorythmacademy.com';

export const sanitizePortalEmailLocal = (raw) => {
    const value = String(raw ?? '');
    const beforeAt = value.includes('@') ? value.split('@')[0] : value;
    return beforeAt.replace(/\s+/g, '');
};

export const USER_STATUS_OPTIONS = ['active', 'inactive', 'completed'];
export const STAFF_STATUS_OPTIONS = ['active', 'inactive'];

export const normalizeStaffStatus = (status) => (status === 'active' ? 'active' : 'inactive');
