const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const mongoose = require('mongoose');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const {
    enrollmentAllFeesPaid,
    enrollmentFeeIsFree,
    maxPayableMonths,
} = require('../utils/feeDueDate');
const { displayEnrollmentFeeStatus } = require('../utils/billingStatus');
const { isExtraInstallmentPayment, assertCheckoutAllowed } = require('./feeDuePolicy');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const logger = require('../utils/logger');

const RETRY_GAP_MS = 12 * 60 * 60 * 1000;

function httpError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function shouldChargeAutoPay(enrollment, now = new Date()) {
    if (!enrollment?.autoPayEnabled) return false;
    if (String(enrollment.status || '').toLowerCase() === 'completed') return false;
    if (String(enrollment.status || '').toLowerCase() === 'paused') return false;
    if (['cancelled', 'refunded'].includes(String(enrollment.paymentStatus || ''))) return false;
    if (enrollmentAllFeesPaid(enrollment) || enrollmentFeeIsFree(enrollment)) return false;
    if (isExtraInstallmentPayment(enrollment, now)) return false;
    if (maxPayableMonths(enrollment) < 1) return false;
    const display = displayEnrollmentFeeStatus({
        ...enrollment,
        course: enrollment.course,
        paymentStatus: enrollment.paymentStatus || 'pending',
    }, now);
    return ['unpaid', 'overdue', 'failed'].includes(display);
}

function canEnableAutoPay(enrollment) {
    if (!enrollment) return false;
    if (String(enrollment.status || '').toLowerCase() === 'completed') return false;
    if (String(enrollment.status || '').toLowerCase() === 'paused') return false;
    if (['cancelled', 'refunded'].includes(String(enrollment.paymentStatus || ''))) return false;
    if (enrollmentAllFeesPaid(enrollment) || enrollmentFeeIsFree(enrollment)) return false;
    return true;
}

function studentHasSavedCard(user) {
    if (!user?.stripeCustomerId) return false;
    if (user.stripePaymentMethodId) return true;
    return Array.isArray(user.stripeSavedCards) && user.stripeSavedCards.length > 0;
}

function canDeleteSavedCard(cards) {
    return Array.isArray(cards) && cards.length > 1;
}

function serializeSavedCards(user) {
    const lastUsed = String(user?.stripePaymentMethodId || '');
    return (user?.stripeSavedCards || []).map((card) => ({
        id: card.id,
        brand: card.brand || 'card',
        last4: card.last4 || '',
        expMonth: card.expMonth || null,
        expYear: card.expYear || null,
        lastUsed: Boolean(lastUsed) && String(card.id) === lastUsed,
        label: savedCardLabel(card),
    }));
}

function savedCardLabel(card) {
    const brand = String(card?.brand || 'Card');
    const last4 = String(card?.last4 || '');
    const name = brand.charAt(0).toUpperCase() + brand.slice(1);
    return last4 ? `${name} •••• ${last4}` : name;
}

function paymentMethodIdFrom(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value.id || '');
}

function cardSummaryFromPaymentMethod(pm) {
    if (!pm) return null;
    const id = paymentMethodIdFrom(pm);
    const card = pm.card || {};
    if (!id || !card.last4) return null;
    return {
        id,
        brand: String(card.brand || 'card'),
        last4: String(card.last4),
        expMonth: Number(card.exp_month) || null,
        expYear: Number(card.exp_year) || null,
    };
}

async function ensureStripeCustomer(user) {
    if (!stripe) {
        throw httpError('Card payment is not available yet. Please use bank transfer or contact the academy.', 503);
    }
    if (!user) throw httpError('Account not found', 404);
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await stripe.customers.create({
        email: user.personalEmail || user.email || undefined,
        name: user.name || undefined,
        metadata: { userId: String(user._id), role: user.role || 'student' },
    });
    user.stripeCustomerId = customer.id;
    await user.save();
    return customer.id;
}

function upsertSavedCard(user, summary) {
    if (!user || !summary?.id) return;
    const cards = Array.isArray(user.stripeSavedCards) ? [...user.stripeSavedCards] : [];
    const index = cards.findIndex((card) => String(card.id) === String(summary.id));
    if (index >= 0) cards[index] = summary;
    else cards.push(summary);
    user.stripeSavedCards = cards;
    user.stripePaymentMethodId = summary.id;
}

async function retrievePaymentMethodFromSession(session) {
    if (!stripe || !session?.id) return { customerId: '', method: null, summary: null };
    let full = session;
    try {
        full = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ['payment_intent.payment_method', 'setup_intent.payment_method'],
        });
    } catch (err) {
        logger.error('Could not reload Stripe checkout session for saved cards', { errorMessage: err.message });
    }
    const customerId = typeof full.customer === 'string' ? full.customer : full.customer?.id || '';
    let method = full.payment_intent?.payment_method || full.setup_intent?.payment_method || null;
    const methodId = paymentMethodIdFrom(method);
    if (methodId && (!method || typeof method === 'string')) {
        try {
            method = await stripe.paymentMethods.retrieve(methodId);
        } catch (err) {
            logger.error('Could not load Stripe payment method', { errorMessage: err.message });
            method = { id: methodId };
        }
    }
    return { customerId, method, summary: cardSummaryFromPaymentMethod(method) };
}

async function saveCardOnStudent(student, { customerId, methodId, summary }) {
    if (!student || !methodId) return null;
    const cid = customerId || student.stripeCustomerId || await ensureStripeCustomer(student);
    student.stripeCustomerId = cid;
    try {
        await stripe.paymentMethods.attach(methodId, { customer: cid });
    } catch (err) {
        if (!String(err.message || '').toLowerCase().includes('already')) {
            logger.error('Could not attach saved card', { errorMessage: err.message });
        }
    }
    try {
        await stripe.customers.update(cid, {
            invoice_settings: { default_payment_method: methodId },
        });
    } catch (err) {
        logger.error('Could not set default Stripe card', { errorMessage: err.message });
    }
    if (summary) upsertSavedCard(student, summary);
    else student.stripePaymentMethodId = methodId;
    await student.save();
    return student;
}

async function saveCardOnStudents(session, studentIds) {
    const ids = [...new Set((studentIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return { summary: null };
    const { customerId, method, summary } = await retrievePaymentMethodFromSession(session);
    const methodId = paymentMethodIdFrom(method);
    if (!methodId) return { summary };
    const students = await User.find({ _id: { $in: ids }, role: 'student' });
    let sharedCustomer = customerId || '';
    for (const student of students) {
        const attached = await saveCardOnStudent(student, {
            customerId: student.stripeCustomerId || sharedCustomer,
            methodId,
            summary,
        });
        if (attached?.stripeCustomerId && !sharedCustomer) sharedCustomer = attached.stripeCustomerId;
    }
    return { summary };
}

async function stampPaymentsWithCard(payments, summary) {
    if (!summary?.last4 || !payments?.length) return;
    for (const payment of payments) {
        if (!payment) continue;
        payment.cardBrand = summary.brand;
        payment.cardLast4 = summary.last4;
        if (typeof payment.save === 'function') await payment.save();
    }
}

async function enableAutoPayOnEnrollments(enrollmentIds) {
    const ids = (enrollmentIds || []).filter((id) => id);
    if (!ids.length) return [];
    const enrollments = await Enrollment.find({
        _id: { $in: ids },
        ...activeEnrollmentFilter(),
    }).populate('course', 'title price totalFeeCount');
    const updated = [];
    for (const enrollment of enrollments) {
        if (!canEnableAutoPay(enrollment)) continue;
        enrollment.autoPayEnabled = true;
        enrollment.autoPayPayer = enrollment.student;
        enrollment.autoPayLastError = '';
        await enrollment.save();
        updated.push(enrollment);
    }
    return updated;
}

async function disableAutoPayOnEnrollments(enrollmentIds) {
    const ids = (enrollmentIds || []).filter((id) => id);
    if (!ids.length) return 0;
    const result = await Enrollment.updateMany(
        { _id: { $in: ids }, ...activeEnrollmentFilter() },
        { $set: { autoPayEnabled: false, autoPayLastError: '' } }
    );
    return result.modifiedCount || 0;
}

function collectStudentAndEnrollmentIds({ intent, payments, enrollments }) {
    const studentIds = [];
    const enrollmentIds = [];
    const addStudent = (value) => {
        const id = String(value?._id || value || '');
        if (id && mongoose.Types.ObjectId.isValid(id) && !studentIds.includes(id)) studentIds.push(id);
    };
    const addEnrollment = (value) => {
        const id = String(value?._id || value || '');
        if (id && mongoose.Types.ObjectId.isValid(id) && !enrollmentIds.includes(id)) enrollmentIds.push(id);
    };
    (intent?.items || []).forEach((item) => {
        addStudent(item.student);
        addEnrollment(item.enrollment);
    });
    (payments || []).forEach((payment) => {
        addStudent(payment.user);
        addEnrollment(payment.enrollment);
        (payment.lines || []).forEach((line) => {
            addStudent(line.student);
            addEnrollment(line.enrollment);
        });
    });
    (enrollments || []).forEach((enrollment) => {
        addStudent(enrollment.student);
        addEnrollment(enrollment);
    });
    return { studentIds, enrollmentIds };
}

async function applyAutoPayAfterCheckout({ session, intent, payments = [], enrollments = [] }) {
    if (!session) return;
    const setup = session.mode === 'setup' || String(session.metadata?.autoPaySetup || '') === '1';
    if (!setup && session.payment_status !== 'paid') return;
    const extra = collectStudentAndEnrollmentIds({ intent, payments, enrollments });
    if (session.metadata?.userId) extra.studentIds.push(String(session.metadata.userId));
    String(session.metadata?.enrollmentIds || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .forEach((id) => extra.enrollmentIds.push(id));
    const { summary } = await saveCardOnStudents(session, extra.studentIds);
    await stampPaymentsWithCard(payments, summary);
    await enableAutoPayOnEnrollments(extra.enrollmentIds);
}

async function setPortalAutoPay({ actor, enrollmentIds, enabled }) {
    const ids = (enrollmentIds || []).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    if (!ids.length) throw httpError('Select at least one course');
    const rows = await Enrollment.find({
        _id: { $in: ids },
        ...activeEnrollmentFilter(),
    }).populate('course', 'title price totalFeeCount').populate('student', 'name stripeCustomerId stripePaymentMethodId stripeSavedCards');

    if (actor.role === 'parent') {
        const { loadLinkedChildren } = require('./billingCheckout');
        const children = await loadLinkedChildren(actor.userId);
        const allowed = new Set(children.map((child) => String(child._id)));
        for (const enrollment of rows) {
            if (!allowed.has(String(enrollment.student?._id || enrollment.student))) {
                throw httpError('You can only change auto-pay for your linked children', 403);
            }
        }
    } else if (actor.role === 'student') {
        for (const enrollment of rows) {
            if (String(enrollment.student?._id || enrollment.student) !== String(actor.userId)) {
                throw httpError('You can only change auto-pay for your own courses', 403);
            }
        }
    }

    if (!enabled) {
        await disableAutoPayOnEnrollments(ids);
        return { enabled: false, updated: ids.length };
    }

    for (const enrollment of rows) {
        if (!canEnableAutoPay(enrollment)) {
            throw httpError(
                enrollmentAllFeesPaid(enrollment)
                    ? 'All fees paid'
                    : String(enrollment.status || '').toLowerCase() === 'paused'
                        ? 'This course is paused. Set it back to Active to use auto-pay.'
                        : `${enrollment.course?.title || 'This course'} cannot use auto-pay`
            );
        }
        if (!studentHasSavedCard(enrollment.student)) {
            throw httpError('Auto-pay is only for Stripe card payments, not bank transfer. Pay a fee by card first so a card can be saved.');
        }
    }

    await enableAutoPayOnEnrollments(ids);
    return { enabled: true, updated: ids.length };
}

async function assertCanManageStudentCards(actor, studentId) {
    if (!mongoose.Types.ObjectId.isValid(String(studentId))) {
        throw httpError('Student not found', 404);
    }
    if (actor.role === 'student') {
        if (String(studentId) !== String(actor.userId)) {
            throw httpError('You can only manage your own cards', 403);
        }
        return;
    }
    if (actor.role === 'parent') {
        const { loadLinkedChildren } = require('./billingCheckout');
        const children = await loadLinkedChildren(actor.userId);
        if (!children.some((child) => String(child._id) === String(studentId))) {
            throw httpError('You can only manage cards for your linked children', 403);
        }
        return;
    }
    throw httpError('Not allowed', 403);
}

async function deleteSavedCard({ actor, studentId, paymentMethodId }) {
    const targetStudentId = actor.role === 'student' ? actor.userId : studentId;
    await assertCanManageStudentCards(actor, targetStudentId);
    const student = await User.findById(targetStudentId);
    if (!student || student.role !== 'student') throw httpError('Student not found', 404);
    const cards = Array.isArray(student.stripeSavedCards) ? student.stripeSavedCards : [];
    if (!canDeleteSavedCard(cards)) {
        throw httpError('At least one card must stay saved');
    }
    const methodId = String(paymentMethodId || '');
    if (!cards.some((card) => String(card.id) === methodId)) {
        throw httpError('Card not found');
    }
    if (stripe && methodId) {
        try {
            await stripe.paymentMethods.detach(methodId);
        } catch (err) {
            if (!String(err.message || '').toLowerCase().includes('already')) {
                throw httpError(err.message || 'Could not remove this card from Stripe');
            }
        }
    }
    student.stripeSavedCards = cards.filter((card) => String(card.id) !== methodId);
    if (String(student.stripePaymentMethodId) === methodId) {
        student.stripePaymentMethodId = student.stripeSavedCards[0]?.id || '';
    }
    await student.save();
    return { savedCards: serializeSavedCards(student) };
}

async function chargeOneAutoPayEnrollment(enrollment) {
    const {
        resolveCheckoutItems,
        withSharedInstallmentMonths,
        createBillingIntent,
        fulfillBillingIntent,
        toMoney,
    } = require('./billingCheckout');
    const student = enrollment.student;
    if (!studentHasSavedCard(student)) {
        throw httpError('No saved card for auto-pay');
    }
    await assertCheckoutAllowed(enrollment);
    const monthly = toMoney(enrollment.course?.price);
    const cents = Math.round(Number(monthly) * 100);
    if (cents < 50) throw httpError('This course has no payable amount');

    const resolvedItems = withSharedInstallmentMonths(
        await resolveCheckoutItems({
            rawItems: [{ enrollmentId: enrollment._id }],
            actor: {
                userId: student._id,
                role: 'student',
                email: student.email,
                name: student.name,
            },
        }),
        1
    );
    const intent = await createBillingIntent({
        items: resolvedItems,
        invoiceMode: 'separate',
        payer: {
            userId: student._id,
            role: 'student',
            email: student.email,
            name: student.name,
        },
        autoPayEnable: true,
    });

    try {
        const pi = await stripe.paymentIntents.create({
            amount: cents,
            currency: 'usd',
            customer: student.stripeCustomerId,
            payment_method: student.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            metadata: {
                groupId: intent.groupId,
                enrollmentId: String(enrollment._id),
                autoPay: '1',
                months: '1',
            },
        });
        const result = await fulfillBillingIntent(intent, {
            status: 'paid',
            paymentMethod: 'stripe',
            transactionId: pi.id,
            stripePaymentIntentId: pi.id,
            currency: 'USD',
            email: student.personalEmail || student.email,
            studentName: student.name,
            payerUser: student._id,
            payerRole: 'student',
            cardBrand: student.stripeSavedCards?.find((card) => card.id === student.stripePaymentMethodId)?.brand || '',
            cardLast4: student.stripeSavedCards?.find((card) => card.id === student.stripePaymentMethodId)?.last4 || '',
        });
        await Enrollment.updateOne(
            { _id: enrollment._id },
            { $set: { autoPayLastError: '', autoPayLastAttemptAt: new Date() } }
        );
        return result;
    } catch (err) {
        intent.status = 'abandoned';
        intent.consumedAt = new Date();
        await intent.save().catch(() => {});
        throw err;
    }
}

async function chargeDueAutoPays(now = new Date()) {
    if (!stripe) return { checked: 0, charged: 0, skipped: 0, failed: 0 };
    const enrollments = await Enrollment.find({
        autoPayEnabled: true,
        status: { $ne: 'completed' },
        paymentStatus: { $nin: ['cancelled', 'refunded'] },
        ...activeEnrollmentFilter(),
    })
        .populate('course', 'title price totalFeeCount feeDueDate')
        .populate('student', 'name email personalEmail role stripeCustomerId stripePaymentMethodId stripeSavedCards');

    let charged = 0;
    let skipped = 0;
    let failed = 0;
    for (const enrollment of enrollments) {
        if (!shouldChargeAutoPay(enrollment, now)) {
            skipped += 1;
            continue;
        }
        if (enrollment.autoPayLastAttemptAt && (now - new Date(enrollment.autoPayLastAttemptAt)) < RETRY_GAP_MS) {
            skipped += 1;
            continue;
        }
        if (!studentHasSavedCard(enrollment.student)) {
            skipped += 1;
            continue;
        }
        enrollment.autoPayLastAttemptAt = now;
        await enrollment.save();
        try {
            await chargeOneAutoPayEnrollment(enrollment);
            charged += 1;
        } catch (err) {
            failed += 1;
            enrollment.autoPayLastError = err.message || 'The saved card was declined. Pay from Fees.';
            await enrollment.save().catch(() => {});
            logger.error('Auto-pay charge failed', {
                enrollmentId: String(enrollment._id),
                errorMessage: err.message,
            });
        }
    }
    return { checked: enrollments.length, charged, skipped, failed };
}

let autoPayTimer = null;

function startAutoPayScheduler() {
    if (autoPayTimer) return;
    const tick = () => {
        chargeDueAutoPays().catch((err) => {
            logger.error('Auto-pay scheduler failed', { errorMessage: err.message });
        });
        const { sendDueFeeReminders } = require('./feeReminderEmail');
        sendDueFeeReminders().catch((err) => {
            logger.error('Fee reminder scheduler failed', { errorMessage: err.message });
        });
    };
    autoPayTimer = setInterval(tick, 15 * 60 * 1000);
    if (typeof autoPayTimer.unref === 'function') autoPayTimer.unref();
    setTimeout(tick, 20 * 1000);
}

async function savedCardsForStudent(studentId) {
    if (!studentId) return [];
    const student = await User.findById(studentId).select('stripeCustomerId stripePaymentMethodId stripeSavedCards role');
    if (!student || student.role !== 'student') return [];
    return serializeSavedCards(student);
}

module.exports = {
    shouldChargeAutoPay,
    canEnableAutoPay,
    canDeleteSavedCard,
    studentHasSavedCard,
    payerHasSavedCard: studentHasSavedCard,
    serializeSavedCards,
    savedCardLabel,
    ensureStripeCustomer,
    saveCardOnStudents,
    enableAutoPayOnEnrollments,
    disableAutoPayOnEnrollments,
    applyAutoPayAfterCheckout,
    setPortalAutoPay,
    deleteSavedCard,
    savedCardsForStudent,
    chargeDueAutoPays,
    startAutoPayScheduler,
};
