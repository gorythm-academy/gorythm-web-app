const User = require('../models/User');
const Payment = require('../models/Payment');
const { activeUserFilter } = require('../utils/userQuery');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { getDuplicateCoursePaymentBlock } = require('./enrollmentDuplicateCheck');
const { distinctParentEmail, peopleLoginEmailError } = require('../utils/studentPortalEmail');

const STAFF_ROLES = ['manager', 'super-admin', 'accountant', 'teacher', 'parent'];
const PORTAL_DOMAIN = '@gorythmacademy.com';

function isPortalEmail(email) {
    return String(email || '').trim().toLowerCase().endsWith(PORTAL_DOMAIN);
}

function emailMatchClause(normalized) {
    const escaped = String(normalized || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
        $or: [
            { email: normalized },
            { personalEmail: new RegExp(`^${escaped}$`, 'i') },
        ],
    };
}

function activeEmailMatch(normalized, extra = {}) {
    return {
        $and: [
            activeUserFilter(),
            emailMatchClause(normalized),
            extra,
        ],
    };
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
            error: 'Please enter an email you can open, such as Gmail or Hotmail.',
        };
    }

    const staff = await User.findOne(
        activeEmailMatch(normalized, { role: { $in: STAFF_ROLES } })
    ).select('_id role');

    if (staff) {
        return {
            ok: false,
            code: 'STAFF_EMAIL_NOT_ALLOWED',
            error: 'This email is already in use. Please enter the student’s own email.',
        };
    }

    return { ok: true };
}

/**
 * Optional parent inbox. Blank, or the same address as the student, means no parent account.
 * An address already used by a student, teacher, or admin is rejected.
 */
async function assertParentRegistrationEmail(parentEmail, studentEmail) {
    const raw = String(parentEmail || '').trim().toLowerCase();
    if (!raw || raw === String(studentEmail || '').trim().toLowerCase()) {
        return { ok: true, parentEmail: '' };
    }
    const formatError = peopleLoginEmailError(raw);
    if (formatError) {
        return { ok: false, code: 'PARENT_EMAIL_NOT_ALLOWED', error: formatError };
    }
    const parent = distinctParentEmail(studentEmail, raw);
    if (!parent) return { ok: true, parentEmail: '' };

    const existing = await User.findOne(activeEmailMatch(parent)).select('_id role');
    if (existing && existing.role !== 'parent') {
        return {
            ok: false,
            code: 'PARENT_EMAIL_NOT_ALLOWED',
            error: 'This parent email is already in use. Please enter a different email.',
        };
    }
    return { ok: true, parentEmail: parent };
}

/**
 * One answer for public forms.
 * block = cannot continue. warning = the email is already a student, and another course is allowed.
 */
async function lookupRegistrationEmail(email, { courseId, courseName, role, studentEmail } = {}) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return { level: 'ok', message: '' };

    if (role === 'parent') {
        const parentGuard = await assertParentRegistrationEmail(normalized, studentEmail);
        if (!parentGuard.ok) return { level: 'block', code: parentGuard.code, message: parentGuard.error };
        return { level: 'ok', message: '' };
    }

    const emailGuard = await assertPersonalRegistrationEmail(normalized);
    if (!emailGuard.ok) return { level: 'block', code: emailGuard.code, message: emailGuard.error };

    if (courseId) {
        const duplicateBlock = await getDuplicateCoursePaymentBlock(normalized, { courseId, courseName });
        if (duplicateBlock.blocked) {
            return { level: 'block', code: duplicateBlock.code, message: duplicateBlock.error };
        }
        const awaiting = await Payment.findOne({
            ...activePaymentFilter(),
            email: normalized,
            course: courseId,
            paymentMethod: 'bank',
            status: 'awaiting_review',
        }).select('_id');
        if (awaiting) {
            return {
                level: 'block',
                code: 'AWAITING_REVIEW',
                message: 'A bank transfer for this course is already awaiting review. Contact the academy if you need help.',
            };
        }
    }

    const student = await User.findOne(
        activeEmailMatch(normalized, { role: 'student' })
    ).select('_id');
    if (student) {
        return {
            level: 'warning',
            code: 'EMAIL_ON_FILE',
            message: 'This email is already in our records. You can continue if you are registering for another course.',
        };
    }
    return { level: 'ok', message: '' };
}

module.exports = {
    isPortalEmail,
    assertPersonalRegistrationEmail,
    assertParentRegistrationEmail,
    lookupRegistrationEmail,
};
