/** Dashboard staff roles (admin panel). */
const MANAGER_ROLE = 'manager';
const SUPER_ADMIN_ROLE = 'super-admin';

const DASHBOARD_LOGIN_ROLES = new Set([SUPER_ADMIN_ROLE, MANAGER_ROLE]);

function isDashboardLoginRole(role) {
    return DASHBOARD_LOGIN_ROLES.has(role);
}

function roleAllowed(userRole, allowedRoles) {
    return Boolean(userRole && allowedRoles.includes(userRole));
}

module.exports = {
    MANAGER_ROLE,
    SUPER_ADMIN_ROLE,
    DASHBOARD_LOGIN_ROLES,
    isDashboardLoginRole,
    roleAllowed,
};
