const Enrollment = require('../models/Enrollment');
const { findStudentByContactEmail } = require('./enrollmentDuplicateCheck');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');

/** Paid fee, pending admin setup — enrollment stays inactive until admin activates. */
const PAID_PENDING_ADMIN_STATUS = 'inactive';

/**
 * Keep Enrollment.paymentStatus in sync with Payment / Stripe checkout.
 * Prefers existing course row, then trashed twin, then placeholder (first course only), else creates.
 */
async function syncEnrollmentPaymentStatus({
    userId,
    courseId,
    paymentStatus = 'paid',
    enrollmentStatus = PAID_PENDING_ADMIN_STATUS,
    forceNew = false,
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

    const existingCourseCount = await Enrollment.countDocuments({
        student: userId,
        course: { $ne: null, $exists: true },
        ...activeEnrollmentFilter(),
    });

    const shouldForceNew = forceNew || existingCourseCount > 0;

    if (!shouldForceNew) {
        const placeholder = await Enrollment.findOne({
            student: userId,
            $or: [{ course: null }, { course: { $exists: false } }],
            ...activeEnrollmentFilter(),
        });
        if (placeholder) {
            placeholder.course = courseId;
            placeholder.paymentStatus = paymentStatus;
            if (enrollmentStatus) placeholder.status = enrollmentStatus;
            placeholder.deletedAt = null;
            if (!placeholder.enrollmentDate) placeholder.enrollmentDate = new Date();
            await placeholder.save();
            return placeholder;
        }
    }

    enrollment = await Enrollment.create({
        student: userId,
        course: courseId,
        paymentStatus,
        status: enrollmentStatus || PAID_PENDING_ADMIN_STATUS,
        enrollmentDate: new Date(),
    });
    return enrollment;
}

/** Resolve user from payment metadata or contact email when userId missing. */
async function syncEnrollmentFromPayment(payment) {
    if (!payment?.course) return null;

    const courseId = payment.course._id || payment.course;
    let userId = payment.user?._id || payment.user;

    if (!userId && payment.email) {
        const user = await findStudentByContactEmail(payment.email);
        if (user) userId = user._id;
    }

    if (!userId) return null;

    let paymentStatus = 'pending';
    if (payment.status === 'paid' || payment.status === 'completed') paymentStatus = 'paid';
    else if (payment.status === 'refunded') paymentStatus = 'refunded';
    else if (payment.status === 'failed') paymentStatus = 'failed';

    const enrollmentStatus =
        paymentStatus === 'paid' ? PAID_PENDING_ADMIN_STATUS : PAID_PENDING_ADMIN_STATUS;

    return syncEnrollmentPaymentStatus({
        userId,
        courseId,
        paymentStatus,
        enrollmentStatus,
    });
}

module.exports = {
    syncEnrollmentPaymentStatus,
    syncEnrollmentFromPayment,
    PAID_PENDING_ADMIN_STATUS,
};
