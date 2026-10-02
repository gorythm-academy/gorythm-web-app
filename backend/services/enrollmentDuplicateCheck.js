const User = require('../models/User');
const { activeUserFilter } = require('../utils/userQuery');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const { activePaymentFilter } = require('../utils/paymentQuery');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

/** Student account matched by portal email or personal email. */
async function findStudentByContactEmail(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    return User.findOne({
        role: 'student',
        ...activeUserFilter(),
        $or: [{ email: normalized }, { personalEmail: normalized }],
    }).select('_id name email personalEmail');
}

async function hasPaidEnrollmentForCourse(email, courseId) {
    if (!courseId) return false;
    const student = await findStudentByContactEmail(email);
    if (!student) return false;
    const enrollment = await Enrollment.findOne({
        student: student._id,
        course: courseId,
        paymentStatus: 'paid',
        ...activeEnrollmentFilter(),
    }).select('_id');
    return Boolean(enrollment);
}

async function hasCompletedPaymentForCourse(email, { courseId, courseName } = {}) {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;

    const or = [];
    if (courseId) or.push({ course: courseId });
    if (courseName) or.push({ courseName: String(courseName).trim() });
    if (!or.length) return false;

    const payment = await Payment.findOne({
        $and: [
            activePaymentFilter(),
            { email: normalized },
            { status: { $in: ['paid', 'completed'] } },
            { $or: or },
        ],
    }).select('_id');
    return Boolean(payment);
}

function alreadyPaidCourseMessage(courseName) {
    const title = String(courseName || '').trim() || 'this course';
    return `You already paid for ${title}. Unselect that course and try again.`;
}

/**
 * Returns { blocked: true, error, code } when the payer should not register/pay again.
 */
async function getDuplicateCoursePaymentBlock(email, { courseId, courseName } = {}) {
    const enrolled = await hasPaidEnrollmentForCourse(email, courseId);
    if (enrolled) {
        return {
            blocked: true,
            code: 'ALREADY_ENROLLED_PAID',
            error: alreadyPaidCourseMessage(courseName),
        };
    }

    const paid = await hasCompletedPaymentForCourse(email, { courseId, courseName });
    if (paid) {
        return {
            blocked: true,
            code: 'ALREADY_PAID',
            error: alreadyPaidCourseMessage(courseName),
        };
    }

    return { blocked: false };
}

module.exports = {
    findStudentByContactEmail,
    hasPaidEnrollmentForCourse,
    hasCompletedPaymentForCourse,
    getDuplicateCoursePaymentBlock,
};
