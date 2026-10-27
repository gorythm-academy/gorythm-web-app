const crypto = require('crypto');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const {
    syncEnrollmentPaymentStatus,
    PAID_PENDING_ADMIN_STATUS,
} = require('./enrollmentPaymentSync');
const { findStudentByContactEmail } = require('./enrollmentDuplicateCheck');
const { resolveAndLinkCourseOnPayment } = require('./resolveCourseFromPayment');
const { peopleLoginEmailError, deliverableInbox } = require('../utils/studentPortalEmail');
const { ensureParentLinkedToStudent } = require('./registrationFamily');
const { activeCourseFilter } = require('../utils/courseQuery');
const { syncStudentUserLoginFromAllEnrollments } = require('./syncStudentAccountLogin');
const { ensureStudentId } = require('../utils/studentIdGenerator');
const {
    addEnrollmentToRosters,
    syncStudentRosterFromEnrollments,
} = require('./enrollmentRosterSync');

function isPaidStatus(status) {
    return status === 'paid' || status === 'completed';
}

/** Find or create a student user for this payment. The email they typed is the login. */
async function resolveStudentUserFromPayment(payment) {
    const normalizedEmail = String(payment.email).trim().toLowerCase();
    const emailError = peopleLoginEmailError(normalizedEmail);
    if (emailError) {
        throw new Error(emailError);
    }
    const existingStudent = await findStudentByContactEmail(normalizedEmail);

    if (existingStudent) {
        const full = await User.findById(existingStudent._id);
        if (full && !deliverableInbox(full.email)) {
            full.email = normalizedEmail;
            full.personalEmail = '';
            await full.save();
            return full;
        }
        return full || existingStudent;
    }

    const existingOther = await User.findOne({
        $or: [{ email: normalizedEmail }, { personalEmail: normalizedEmail }],
        role: { $ne: 'student' },
    });

    if (existingOther) {
        throw new Error(
            'This email is already in use. Please enter the student\'s own email.'
        );
    }

    const user = new User({
        name: String(payment.studentName || 'Student').trim() || 'Student',
        email: normalizedEmail,
        password: crypto.randomBytes(18).toString('hex'),
        role: 'student',
        phone: payment.phone ? String(payment.phone) : '',
        status: 'inactive',
        canLogin: false,
        isActive: false,
        personalEmail: '',
        mustChangePassword: true,
    });
    await user.save();
    return user;
}

/** Link a parent when this payment collected a different parent email. */
async function linkParentFromPayment(payment, userId) {
    if (!payment?.parentEmail || !userId) return null;
    const student = await User.findById(userId).select('name email role');
    if (!student || student.role !== 'student') return null;
    return ensureParentLinkedToStudent(student, payment.parentEmail);
}

/**
 * Create/link student + enrollment. Does not change payment status — call before marking paid.
 * A successful payment turns that enrollment, and the student login, active.
 */
async function activatePaidStudent(userId, enrollment) {
    if (!userId) return;
    if (enrollment) {
        const status = String(enrollment.status || '').toLowerCase();
        if (!status || status === 'inactive' || status === 'pending') {
            enrollment.status = 'active';
            await enrollment.save();
        }
    }
    await syncStudentUserLoginFromAllEnrollments(userId);
}

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

    const enrollableCourse = await Course.findOne({
        _id: courseId,
        isPublished: true,
        ...activeCourseFilter(),
    }).select('_id');
    if (!enrollableCourse) {
        throw new Error('Course is no longer available for enrollment.');
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

    await linkParentFromPayment(payment, userId);
    await ensureStudentId(userId);

    const existingEnrollment = await Enrollment.findOne({
        student: userId,
        course: courseId,
        deletedAt: null,
    });
    if (existingEnrollment) {
        const { applyInstallmentPayment, copyTotalFeeCountFromCourse } = require('./feeDuePolicy');
        const course = await Course.findById(courseId).select('price totalFeeCount feeDueDate');
        copyTotalFeeCountFromCourse(existingEnrollment, course);
        await applyInstallmentPayment(existingEnrollment, payment, { course });
        await activatePaidStudent(userId, existingEnrollment);
        return existingEnrollment;
    }

    const enrollment = await syncEnrollmentPaymentStatus({
        userId,
        courseId,
        paymentStatus: 'paid',
        enrollmentStatus: PAID_PENDING_ADMIN_STATUS,
    });

    if (enrollment && !enrollment.enrollmentDate) {
        enrollment.enrollmentDate = new Date();
        await enrollment.save();
    }

    const { applyInstallmentPayment, copyTotalFeeCountFromCourse, assignEnrollmentDueDate } = require('./feeDuePolicy');
    const course = await Course.findById(courseId).select('price totalFeeCount feeDueDate');
    copyTotalFeeCountFromCourse(enrollment, course);
    if (!enrollment.feeDueDate) {
        await assignEnrollmentDueDate(enrollment, { course, joinDate: enrollment.enrollmentDate });
    }
    await applyInstallmentPayment(enrollment, payment, { course });

    await addEnrollmentToRosters(userId, courseId);
    await activatePaidStudent(userId, enrollment);
    setImmediate(() => {
        syncStudentRosterFromEnrollments(userId).catch(() => {});
    });

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
