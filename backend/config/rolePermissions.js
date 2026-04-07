const ROLE_PERMISSIONS = {
    'super-admin': ['*'],
    admin: [
        'settings.general.read',
        'settings.general.write',
        'settings.security.read',
        'settings.security.write',
        'settings.email.read',
        'settings.email.write',
        'settings.payment.read',
        'users.read',
        'users.write',
        'courses.read',
        'courses.write',
        'payments.read',
        'enrollments.read',
    ],
    accountant: [
        'settings.payment.read',
        'settings.payment.write',
        'payments.read',
        'payments.write',
        'payments.refund',
    ],
    teacher: [
        'courses.read',
        'assignments.read',
        'assignments.write',
        'quizzes.read',
        'quizzes.write',
        'attendance.read',
        'attendance.write',
    ],
    student: [
        'courses.read',
        'assignments.read',
        'assignments.submit',
        'quizzes.read',
        'quizzes.attempt',
        'attendance.read',
    ],
    parent: [
        'children.read',
        'children.progress.read',
        'children.attendance.read',
        'children.quizzes.read',
    ],
};

const hasPermission = (role, permission) => {
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes('*') || permissions.includes(permission);
};

module.exports = { ROLE_PERMISSIONS, hasPermission };
