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

/**
 * Create or update a paid Stripe payment from a Checkout Session.
 * Idempotent per session.id. Data comes from Stripe, not the registration form.
 */
async function fulfillStripeCheckoutSession(session) {
    if (!session || session.payment_status !== 'paid') {
        return null;
    }

    const courseId = session.metadata?.courseId;
    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId)) {
        logger.error('Stripe fulfillment missing courseId', { sessionId: session.id });
        return null;
    }

    const course = await Course.findOne({
        _id: courseId,
        isPublished: true,
        ...activeCourseFilter(),
    }).select('_id title price');
    if (!course) {
        logger.error('Stripe fulfillment course not found', { courseId, sessionId: session.id });
        return null;
    }

    const email = resolveEmail(session);
    if (!email) {
        logger.error('Stripe fulfillment missing customer email', { sessionId: session.id });
        return null;
    }

    const emailGuard = await assertPersonalRegistrationEmail(email);
    if (!emailGuard.ok) {
        logger.warn('Stripe fulfillment blocked email', { sessionId: session.id, code: emailGuard.code });
        return null;
    }

    const duplicateBlock = await getDuplicateCoursePaymentBlock(email, {
        courseId: course._id,
        courseName: course.title,
    });
    if (duplicateBlock.blocked) {
        logger.warn('Stripe fulfillment duplicate payment', { sessionId: session.id, code: duplicateBlock.code });
    }

    const piId =
        typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;

    const amountUsd =
        session.amount_total != null ? Number(session.amount_total) / 100 : Number(course.price);

    let linkedUserId;
    const metaUserId = session.metadata?.userId;
    if (metaUserId && mongoose.Types.ObjectId.isValid(metaUserId)) {
        const user = await User.findById(metaUserId).select('_id');
        if (user) linkedUserId = user._id;
    }

    const phone = resolvePhone(session);
    const studentName = resolveStudentName(session);

    let payment = await Payment.findOne({
        transactionId: session.id,
        ...activePaymentFilter(),
    });

    if (!payment) {
        payment = new Payment({
            user: linkedUserId,
            course: course._id,
            studentName,
            phone,
            email,
            courseName: course.title,
            amount: amountUsd,
            currency: (session.currency || 'usd').toUpperCase(),
            status: 'paid',
            paymentMethod: session.payment_method_types?.[0] || 'stripe',
            transactionId: session.id,
            stripePaymentIntentId: piId || undefined,
        });
        await payment.save();
    } else {
        payment.studentName = studentName;
        payment.email = email;
        if (phone) payment.phone = phone;
        payment.course = course._id;
        payment.courseName = course.title;
        payment.amount = amountUsd;
        payment.status = 'paid';
        payment.paymentMethod = session.payment_method_types?.[0] || payment.paymentMethod || 'stripe';
        if (piId) payment.stripePaymentIntentId = piId;
        if (linkedUserId) payment.user = linkedUserId;
        await payment.save();
    }

    await payment.populate(['user', 'course']);
    if (payment.course?._id && !duplicateBlock.blocked) {
        await onPaymentPaid(payment);
    }

    return payment;
}

module.exports = {
    fulfillStripeCheckoutSession,
    resolveEmail,
    resolveStudentName,
    resolvePhone,
};
