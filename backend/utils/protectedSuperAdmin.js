/** Canonical super-admin — only this account is protected from delete/demotion. */
const DEFAULT_CANONICAL_EMAIL = 'gorythm.academy@gmail.com';

function getCanonicalSuperAdminEmail() {
    const fromEnv = String(process.env.DEFAULT_ADMIN_EMAIL || '').trim().toLowerCase();
    return fromEnv || DEFAULT_CANONICAL_EMAIL;
}

function isProtectedSuperAdmin(user) {
    if (!user) return false;
    const email = String(user.email || '').trim().toLowerCase();
    return email === getCanonicalSuperAdminEmail();
}

function isSuperAdminRole(role) {
    return role === 'super-admin';
}

module.exports = {
    DEFAULT_CANONICAL_EMAIL,
    getCanonicalSuperAdminEmail,
    isProtectedSuperAdmin,
    isSuperAdminRole,
};
