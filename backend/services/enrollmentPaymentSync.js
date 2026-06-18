const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');

/**
 * Keep Enrollment.paymentStatus in sync with Payment / Stripe checkout.
 */
async function syncEnrollmentPaymentStatus({
    userId,
    courseId,
    paymentStatus = 'paid',
    enrollmentStatus = 'active',
}) {
    if (!userId || !courseId) return null;

    let enrollment = await Enrollment.findOne({
        student: userId,
        course: courseId,
        ...activeEnrollmentFilter(),
    });
    if (enrollment) {
        enrollment.paymentStatus = paymentStatus;
        if (enrollmentStatus) enrollment.status = enrollmentStatus;
        enrollment.deletedAt = null;
        await enrollment.save();
        return enrollment;
    }

    const trashed = await Enrollment.findOne({
        student: userId,
        course: courseId,
        deletedAt: { $exists: true, $ne: null },
    });
    if (trashed) {
        trashed.paymentStatus = paymentStatus;
        if (enrollmentStatus) trashed.status = enrollmentStatus;
        trashed.deletedAt = null;
        await trashed.save();
        return trashed;
    }

    enrollment = await Enrollment.create({
        student: userId,
        course: courseId,
        paymentStatus,
        status: enrollmentStatus,
    });
    return enrollment;
}

/** Resolve user from payment metadata or email when userId missing. */
async function syncEnrollmentFromPayment(payment) {
    if (!payment?.course) return null;

    const courseId = payment.course._id || payment.course;
    let userId = payment.user?._id || payment.user;

    if (!userId && payment.email) {
        const user = await User.findOne({ email: String(payment.email).toLowerCase(), role: 'student' });
        if (user) userId = user._id;
    }

    if (!userId) return null;

    let paymentStatus = 'pending';
    if (payment.status === 'paid' || payment.status === 'completed') paymentStatus = 'paid';
    else if (payment.status === 'refunded') paymentStatus = 'refunded';
    else if (payment.status === 'failed') paymentStatus = 'failed';

    const enrollmentStatus = paymentStatus === 'paid' ? 'pending' : 'pending';

    return syncEnrollmentPaymentStatus({
        userId,
        courseId,
        paymentStatus,
        enrollmentStatus,
    });
}

module.exports = { syncEnrollmentPaymentStatus, syncEnrollmentFromPayment };
