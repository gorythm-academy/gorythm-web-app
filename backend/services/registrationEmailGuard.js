const User = require('../models/User');

const STAFF_ROLES = ['manager', 'super-admin', 'accountant', 'teacher', 'parent'];
const PORTAL_DOMAIN = '@gorythmacademy.com';

function isPortalEmail(email) {
    return String(email || '').trim().toLowerCase().endsWith(PORTAL_DOMAIN);
}

/**
 * Block staff accounts and academy portal addresses from public course registration.
 */
async function assertPersonalRegistrationEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) {
        return { ok: false, error: 'Email is required.' };
    }
    if (isPortalEmail(normalized)) {
        return {
            ok: false,
            code: 'PORTAL_EMAIL_NOT_ALLOWED',
            error: 'Use your personal email (Gmail, Hotmail, etc.), not your @gorythmacademy.com portal address.',
        };
    }

    const staff = await User.findOne({
        role: { $in: STAFF_ROLES },
        $or: [{ email: normalized }, { personalEmail: normalized }],
    }).select('_id role');

    if (staff) {
        return {
            ok: false,
            code: 'STAFF_EMAIL_NOT_ALLOWED',
            error: 'This email belongs to a staff account. Register with a personal email address.',
        };
    }

    return { ok: true };
}

module.exports = {
    isPortalEmail,
    assertPersonalRegistrationEmail,
};
