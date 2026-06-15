const crypto = require('crypto');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { syncEnrollmentPaymentStatus } = require('./enrollmentPaymentSync');
const { findStudentByContactEmail } = require('./enrollmentDuplicateCheck');
const { resolveAndLinkCourseOnPayment } = require('./resolveCourseFromPayment');
const { buildUnsetPortalEmail } = require('../utils/studentPortalEmail');

function isPaidStatus(status) {
    return status === 'paid' || status === 'completed';
}

/** Find or create a student user for this payment. */
async function resolveStudentUserFromPayment(payment) {
    const normalizedEmail = String(payment.email).trim().toLowerCase();
    const existingStudent = await findStudentByContactEmail(normalizedEmail);

    if (existingStudent) {
        return existingStudent;
    }

    const existingStaff = await User.findOne({
        $or: [{ email: normalizedEmail }, { personalEmail: normalizedEmail }],
        role: { $ne: 'student' },
    });

    if (existingStaff) {
        throw new Error(
            'This email belongs to a staff account. The payer must register again with a personal email address.'
        );
    }

    const tempPassword = crypto.randomBytes(18).toString('hex');
    const paymentId = String(payment._id || '').slice(-10) || Date.now().toString(36);
    let portalEmail = buildUnsetPortalEmail(paymentId);
    let suffix = 0;
    while (await User.findOne({ email: portalEmail }).select('_id')) {
        suffix += 1;
        portalEmail = buildUnsetPortalEmail(`${paymentId}.${suffix}`);
    }

    const user = new User({
        name: String(payment.studentName || 'Student').trim() || 'Student',
        email: portalEmail,
        password: tempPassword,
        role: 'student',
        phone: payment.phone ? String(payment.phone) : '',
        status: 'inactive',
        canLogin: false,
        isActive: false,
        personalEmail: normalizedEmail,
    });
    await user.save();
    return user;
}

/**
 * Create/link student + enrollment. Does not change payment status — call before marking paid.
 */
async function fulfillPaymentEnrollment(payment, { verifiedBy = null } = {}) {
    if (!payment) {
        throw new Error('Payment not found');
    }

    const courseId = await resolveAndLinkCourseOnPayment(payment);
    if (!courseId) {
        throw new Error(
            'Payment has no course linked. Ensure the course title on the payment matches a published course exactly.'
        );
    }

    let userId = payment.user?._id || payment.user;

    if (!userId && payment.email) {
        const user = await resolveStudentUserFromPayment(payment);
        userId = user._id;
        payment.user = userId;
        if (verifiedBy) {
            payment.verifiedBy = verifiedBy;
            payment.verifiedAt = new Date();
        }
        await payment.save();
    }

    if (!userId) {
        throw new Error('Could not resolve student for this payment.');
    }

    const existingEnrollment = await Enrollment.findOne({
        student: userId,
        course: courseId,
        paymentStatus: 'paid',
    });
    if (existingEnrollment) {
        return existingEnrollment;
    }

    const enrollment = await syncEnrollmentPaymentStatus({
        userId,
        courseId,
        paymentStatus: 'paid',
        enrollmentStatus: 'inactive',
    });

    if (enrollment && !enrollment.enrollmentDate) {
        enrollment.enrollmentDate = new Date();
        await enrollment.save();
    }

    await User.findByIdAndUpdate(userId, { $addToSet: { enrolledCourses: courseId } });
    await Course.findByIdAndUpdate(courseId, { $addToSet: { students: userId } });

    return enrollment;
}

/** When payment record is already marked paid (Stripe webhook / verify-session). */
async function onPaymentPaid(payment, options = {}) {
    if (!payment) return null;
    if (!isPaidStatus(payment.status)) return null;
    return fulfillPaymentEnrollment(payment, options);
}

module.exports = {
    onPaymentPaid,
    fulfillPaymentEnrollment,
    isPaidStatus,
};
