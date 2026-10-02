const ENROLLMENT_STATUS_OPTIONS = ['active', 'inactive', 'completed', 'paused'];
const USER_STATUS_OPTIONS = ['active', 'inactive', 'completed'];

/** Coerce legacy/missing values to active | inactive | completed. */
function normalizeEnrollmentStatus(status) {
    if (!status || status === 'pending') return 'inactive';
    if (ENROLLMENT_STATUS_OPTIONS.includes(status)) return status;
    return 'inactive';
}

function normalizeUserStatus(status, fallbackIsActive = true) {
    if (!status || status === 'pending') return 'inactive';
    if (USER_STATUS_OPTIONS.includes(status)) return status;
    return fallbackIsActive ? 'active' : 'inactive';
}

function isUserLoginAllowedFromStatus(status) {
    const normalized = normalizeUserStatus(status, false);
    return normalized === 'active' || normalized === 'completed';
}

function isPausedEnrollment(status) {
    return normalizeEnrollmentStatus(status) === 'paused';
}

/** In class: Active or Paused. Inactive is waiting / not in class. */
function isClassOpenEnrollment(status) {
    const normalized = normalizeEnrollmentStatus(status);
    return normalized === 'active' || normalized === 'paused';
}

module.exports = {
    ENROLLMENT_STATUS_OPTIONS,
    USER_STATUS_OPTIONS,
    normalizeEnrollmentStatus,
    normalizeUserStatus,
    isUserLoginAllowedFromStatus,
    isPausedEnrollment,
    isClassOpenEnrollment,
};
