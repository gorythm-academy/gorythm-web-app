const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Course = require('../models/Course');
const User = require('../models/User');
const { onPaymentPaid } = require('./onPaymentPaid');
const { getDuplicateCoursePaymentBlock } = require('./enrollmentDuplicateCheck');
const { assertPersonalRegistrationEmail } = require('./registrationEmailGuard');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const logger = require('../utils/logger');

function resolveEmail(session) {
    return (
        session.customer_details?.email ||
        session.customer_email ||
        ''
    )
        .trim()
        .toLowerCase();
}

function resolveStudentName(session) {
    const details = session.customer_details || {};
    const name = details.name || details.individual_name || '';
    if (name.trim()) return name.trim();
    const meta = session.metadata?.studentName;
    if (meta && String(meta).trim()) return String(meta).trim();
    const email = resolveEmail(session);
    if (email) return email.split('@')[0];
    return 'Student';
}

function resolvePhone(session) {
    const stripePhone = session.customer_details?.phone || '';
    const metaPhone = session.metadata?.phone ? String(session.metadata.phone).trim() : '';
    const raw = (stripePhone && String(stripePhone).trim()) || metaPhone || '';
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

function inferFulfillmentIssue(reason) {
    const text = String(reason || '').toLowerCase();
    if (text.includes('already enrolled') || text.includes('completed payment')) {
        return 'duplicate_payment';
    }
    if (text.includes('no longer available') || text.includes('not available for enrollment')) {
        return 'course_unavailable';
    }
    if (text.includes('staff account') || text.includes('personal email')) {
        return 'email_blocked';
    }
    return 'enrollment_failed';
}

function fulfillmentMessage(issue) {
    switch (issue) {
        case 'course_unavailable':
            return 'Your payment was received, but this course is no longer open for enrollment. Please contact us for a refund.';
        case 'duplicate_payment':
            return 'Your payment was received, but you are already enrolled or have a completed payment for this course. Please contact us if you need help.';
        case 'already_enrolled_duplicate':
            return 'You are already enrolled in this course. This extra payment was recorded — contact us if you need a refund.';
        case 'email_blocked':
            return 'Your payment was received, but we could not complete enrollment with this email. Please contact us.';
        case 'enrollment_failed':
            return 'Your payment was received, but enrollment could not be completed automatically. Please contact us with your receipt.';
        default:
            return 'Your payment was received, but enrollment could not be completed. Please contact us with your receipt.';
    }
}

async function upsertStripePayment({
    session,
    course,
    email,
    studentName,
    phone,
    linkedUserId,
    amountUsd,
    piId,
    failureReason = '',
}) {
    const courseIdFromMeta = session.metadata?.courseId;
    let payment = await Payment.findOne({
        transactionId: session.id,
        ...activePaymentFilter(),
    });

    const payload = {
        studentName,
        email,
        phone,
        amount: amountUsd,
        currency: (session.currency || 'usd').toUpperCase(),
        status: 'paid',
        paymentMethod: session.payment_method_types?.[0] || 'stripe',
        transactionId: session.id,
        stripePaymentIntentId: piId || undefined,
        failureReason: failureReason || '',
        rejectionReason: '',
    };

    if (course) {
        payload.course = course._id;
        payload.courseName = course.title;
    } else if (courseIdFromMeta && mongoose.Types.ObjectId.isValid(courseIdFromMeta)) {
        payload.course = courseIdFromMeta;
    }

    if (linkedUserId) payload.user = linkedUserId;

    if (!payment) {
        payment = new Payment(payload);
    } else {
        Object.assign(payment, payload);
        if (phone) payment.phone = phone;
    }

    await payment.save();
    await payment.populate(['user', 'course']);
    return payment;
}

/**
 * Create or update a paid Stripe payment from a Checkout Session.
 * Returns { payment, enrolled, fulfillmentIssue }.
 */
async function fulfillStripeCheckoutSession(session) {
    if (!session || session.payment_status !== 'paid') {
        return { payment: null, enrolled: false, fulfillmentIssue: null };
    }

    const courseId = session.metadata?.courseId;
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
        logger.error('Stripe fulfillment missing courseId', { sessionId: session.id });
        return { payment: null, enrolled: false, fulfillmentIssue: 'course_unavailable' };
    }

    const piId =
        typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;

    const existingPayment = await Payment.findOne({
        transactionId: session.id,
        ...activePaymentFilter(),
    });
    if (existingPayment?.status === 'paid') {
        await existingPayment.populate(['user', 'course']);
        if (existingPayment.failureReason) {
            const issue = inferFulfillmentIssue(existingPayment.failureReason);
            const alreadyEnrolledDuplicate =
                issue === 'duplicate_payment' &&
                String(existingPayment.failureReason).toLowerCase().includes('already enrolled');
            return {
                payment: existingPayment,
                enrolled: alreadyEnrolledDuplicate,
                fulfillmentIssue: alreadyEnrolledDuplicate ? 'already_enrolled_duplicate' : issue,
            };
        }
        try {
            const enrollment = await onPaymentPaid(existingPayment);
            return {
                payment: existingPayment,
                enrolled: !!enrollment,
                fulfillmentIssue: enrollment ? null : 'enrollment_failed',
            };
        } catch (error) {
            existingPayment.failureReason = error.message || 'Enrollment failed after payment.';
            await existingPayment.save();
            return {
                payment: existingPayment,
                enrolled: false,
                fulfillmentIssue: 'enrollment_failed',
            };
        }
    }

    const email = resolveEmail(session);
    const studentName = resolveStudentName(session);
    const phone = resolvePhone(session);

    let linkedUserId;
    const metaUserId = session.metadata?.userId;
    if (metaUserId && mongoose.Types.ObjectId.isValid(metaUserId)) {
        const user = await User.findById(metaUserId).select('_id');
        if (user) linkedUserId = user._id;
    }

    const course = await Course.findOne({
        _id: courseId,
        isPublished: true,
        ...activeCourseFilter(),
    }).select('_id title price');

    const amountUsd =
        session.amount_total != null ? Number(session.amount_total) / 100 : Number(course?.price || 0);

    if (!course) {
        logger.error('Stripe fulfillment course not found', { courseId, sessionId: session.id });
        const payment = await upsertStripePayment({
            session,
            course: null,
            email,
            studentName,
            phone,
            linkedUserId,
            amountUsd,
            piId,
            failureReason: 'Course no longer available for enrollment after checkout.',
        });
        return { payment, enrolled: false, fulfillmentIssue: 'course_unavailable' };
    }

    if (!email) {
        logger.error('Stripe fulfillment missing customer email', { sessionId: session.id });
        const payment = await upsertStripePayment({
            session,
            course,
            email: '',
            studentName,
            phone,
            linkedUserId,
            amountUsd,
            piId,
            failureReason: 'Stripe checkout did not include a customer email.',
        });
        return { payment, enrolled: false, fulfillmentIssue: 'enrollment_failed' };
    }

    const emailGuard = await assertPersonalRegistrationEmail(email);
    if (!emailGuard.ok) {
        logger.warn('Stripe fulfillment blocked email', { sessionId: session.id, code: emailGuard.code });
        const payment = await upsertStripePayment({
            session,
            course,
            email,
            studentName,
            phone,
            linkedUserId,
            amountUsd,
            piId,
            failureReason: emailGuard.error,
        });
        return { payment, enrolled: false, fulfillmentIssue: 'email_blocked' };
    }

    const duplicateBlock = await getDuplicateCoursePaymentBlock(email, {
        courseId: course._id,
        courseName: course.title,
    });
    if (duplicateBlock.blocked) {
        logger.warn('Stripe fulfillment duplicate payment', { sessionId: session.id, code: duplicateBlock.code });
        const payment = await upsertStripePayment({
            session,
            course,
            email,
            studentName,
            phone,
            linkedUserId,
            amountUsd,
            piId,
            failureReason: duplicateBlock.error,
        });
        if (duplicateBlock.code === 'ALREADY_ENROLLED_PAID') {
            return { payment, enrolled: true, fulfillmentIssue: 'already_enrolled_duplicate' };
        }
        return { payment, enrolled: false, fulfillmentIssue: 'duplicate_payment' };
    }

    const payment = await upsertStripePayment({
        session,
        course,
        email,
        studentName,
        phone,
        linkedUserId,
        amountUsd,
        piId,
        failureReason: '',
    });

    try {
        const enrollment = await onPaymentPaid(payment);
        if (!enrollment) {
            payment.failureReason = 'Enrollment record was not created after payment.';
            await payment.save();
            return { payment, enrolled: false, fulfillmentIssue: 'enrollment_failed' };
        }
        return { payment, enrolled: true, fulfillmentIssue: null };
    } catch (error) {
        logger.error('Stripe fulfillment enrollment failed', {
            sessionId: session.id,
            errorMessage: error.message,
        });
        payment.failureReason = error.message || 'Enrollment failed after payment.';
        await payment.save();
        return { payment, enrolled: false, fulfillmentIssue: 'enrollment_failed' };
    }
}

module.exports = {
    fulfillStripeCheckoutSession,
    fulfillmentMessage,
    resolveEmail,
    resolveStudentName,
    resolvePhone,
};
