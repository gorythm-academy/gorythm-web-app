const stripe = process.env.STRIPE_SECRET_KEY
    ? require('stripe')(process.env.STRIPE_SECRET_KEY)
    : null;
const mongoose = require('mongoose');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const BillingCheckoutIntent = require('../models/BillingCheckoutIntent');
const ParentStudentLink = require('../models/ParentStudentLink');
const { AutoPayCharge, AutoPayLock } = require('../models/AutoPayCharge');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { isUnsetPortalEmail } = require('../utils/studentPortalEmail');
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
const AUTO_PAY_MAX_FAILURES = 3;
const HARD_DECLINE_CODES = new Set([
    'transaction_not_allowed',
    'fraudulent',
    'lost_card',
    'stolen_card',
    'pickup_card',
    'expired_card',
    'incorrect_number',
    'invalid_account',
    'invalid_number',
    'card_not_supported',
    'authentication_required',
]);

function httpError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function stripeDeclineCode(err) {
    return String(
        err?.decline_code
        || err?.raw?.decline_code
        || err?.payment_intent?.last_payment_error?.decline_code
        || err?.raw?.payment_intent?.last_payment_error?.decline_code
        || ''
    ).toLowerCase();
}

function isHardAutoPayDecline(err) {
    if (HARD_DECLINE_CODES.has(stripeDeclineCode(err))) return true;
    return String(err?.message || '').toLowerCase().includes('transaction not allowed');
}

function shouldStopAutoPayRetries(err, failCount) {
    if (isHardAutoPayDecline(err)) return true;
    return Number(failCount) >= AUTO_PAY_MAX_FAILURES;
}

const AUTO_PAY_CLAIM_STALE_MS = 2 * 60 * 1000;

function autoPayPeriodKey(enrollment) {
    const id = String(enrollment?._id || '');
    if (!id || !enrollment?.feeDueDate) return '';
    const paid = Math.max(0, Math.floor(Number(enrollment.paidInstallmentCount || 0)));
    return `${id}:i${paid}`;
}

function autoPayIdempotencyKey(periodKey, attempt) {
    const n = Math.max(1, Math.floor(Number(attempt) || 1));
    return `autopay:${String(periodKey || '')}:${n}`.slice(0, 255);
}

function autoPayClaimAction(claim, now = new Date()) {
    if (!claim) return 'charge';
    if (claim.status === 'done' || claim.stopped) return 'skip';
    if (claim.status === 'charged') return 'record';
    if (claim.status === 'open') {
        const stamp = new Date(claim.updatedAt || claim.createdAt || 0).getTime();
        if (now.getTime() - stamp < AUTO_PAY_CLAIM_STALE_MS) return 'skip';
        return 'reconcile';
    }
    if (claim.status === 'failed') {
        const last = claim.lastAttemptAt ? new Date(claim.lastAttemptAt).getTime() : 0;
        if (last && now.getTime() - last < RETRY_GAP_MS) return 'skip';
        return 'retry';
    }
    return 'skip';
}

function sameDueInstant(left, right) {
    const a = left ? new Date(left).getTime() : NaN;
    const b = right ? new Date(right).getTime() : NaN;
    return Number.isFinite(a) && a === b;
}

function enrollmentNeedsAutoPayRepair(enrollment, payment = null) {
    if (!enrollment) return false;
    if (payment && payment.installmentCounted) return false;
    const display = displayEnrollmentFeeStatus(enrollment);
    return display === 'unpaid' || display === 'overdue' || display === 'failed';
}

function preferredOpenIntent(intents) {
    const rank = { succeeded: 0, processing: 1, requires_capture: 2 };
    return [...(intents || [])].sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))[0] || null;
}

function shouldChargeAutoPay(enrollment, now = new Date()) {
    if (!enrollment?.autoPayEnabled) return false;
    if (Number(enrollment.autoPayFailCount || 0) >= AUTO_PAY_MAX_FAILURES) return false;
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

function checkoutWantsAutoPay(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function autoPayConsented({ session, intent } = {}) {
    if (intent) return Boolean(intent.autoPayEnable);
    return String(session?.metadata?.autoPay || '') === '1';
}

function canDeleteSavedCard(cards) {
    return Array.isArray(cards) && cards.length >= 1;
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
        enrollment.autoPayFailCount = 0;
        await enrollment.save();
        updated.push(enrollment);
    }
    if (updated.length) {
        await AutoPayCharge.updateMany(
            { enrollment: { $in: updated.map((row) => row._id) }, status: 'failed', stopped: true },
            { $set: { stopped: false, lastAttemptAt: new Date(0), notified: false } }
        );
    }
    return updated;
}

async function disableAutoPayOnEnrollments(enrollmentIds) {
    const ids = (enrollmentIds || []).filter((id) => id);
    if (!ids.length) return 0;
    const result = await Enrollment.updateMany(
        { _id: { $in: ids }, ...activeEnrollmentFilter() },
        { $set: { autoPayEnabled: false, autoPayLastError: '', autoPayFailCount: 0 } }
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
    if (!autoPayConsented({ session, intent })) return;
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
        throw httpError('Card not found');
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
    let autoPayDisabled = 0;
    if (!studentHasSavedCard(student)) {
        const stopped = await Enrollment.updateMany(
            { student: student._id, autoPayEnabled: true, ...activeEnrollmentFilter() },
            { $set: { autoPayEnabled: false, autoPayLastError: '', autoPayFailCount: 0 } }
        );
        autoPayDisabled = stopped.modifiedCount || 0;
    }
    return { savedCards: serializeSavedCards(student), autoPayDisabled };
}

async function holdAutoPayScheduler() {
    const now = new Date();
    const until = new Date(now.getTime() + 10 * 60 * 1000);
    await AutoPayLock.updateOne(
        { name: 'scheduler' },
        { $setOnInsert: { name: 'scheduler', lockedUntil: new Date(0) } },
        { upsert: true }
    );
    const got = await AutoPayLock.findOneAndUpdate(
        { name: 'scheduler', lockedUntil: { $lte: now } },
        { $set: { lockedUntil: until } },
        { new: true }
    );
    return Boolean(got);
}

async function releaseAutoPayScheduler() {
    await AutoPayLock.updateOne(
        { name: 'scheduler' },
        { $set: { lockedUntil: new Date(0) } }
    );
}

async function findBlockingLocalPayment(enrollment) {
    const rows = await Payment.find({
        ...activePaymentFilter(),
        status: { $in: ['paid', 'completed', 'processing', 'awaiting_review'] },
        'lines.enrollment': enrollment._id,
    }).select('_id status lines dueDate stripePaymentIntentId groupId installmentCounted').lean();
    return rows.find((row) => {
        if (row.status === 'processing' || row.status === 'awaiting_review') return true;
        if ((row.status === 'paid' || row.status === 'completed') && !row.installmentCounted) return true;
        const lines = Array.isArray(row.lines) && row.lines.length ? row.lines : [{ dueDate: row.dueDate }];
        return lines.some((line) => sameDueInstant(line.dueDate || row.dueDate, enrollment.feeDueDate));
    }) || null;
}

async function listAutoPayIntentsForPeriod(customerId, periodKey, enrollmentId = '') {
    const matches = [];
    const enrollment = String(enrollmentId || '');
    let startingAfter = '';
    for (let page = 0; page < 4; page += 1) {
        let list;
        try {
            list = await stripe.paymentIntents.list({
                customer: customerId,
                limit: 100,
                ...(startingAfter ? { starting_after: startingAfter } : {}),
            });
        } catch (err) {
            const lookup = httpError('Could not check existing card charges', 503);
            lookup.autoPayLookup = true;
            lookup.cause = err;
            throw lookup;
        }
        for (const pi of list.data || []) {
            if (String(pi.metadata?.autoPay || '') !== '1') continue;
            if (String(pi.metadata?.periodKey || '') === periodKey) {
                matches.push(pi);
                continue;
            }
            if (enrollment && String(pi.metadata?.enrollmentId || '') === enrollment
                && String(pi.metadata?.periodKey || '') === periodKey) {
                matches.push(pi);
            }
        }
        if (!list.has_more || !list.data?.length) break;
        startingAfter = list.data[list.data.length - 1].id;
    }
    return matches;
}

async function finishExistingAutoPayForEnrollment(enrollment) {
    const claims = await AutoPayCharge.find({
        enrollment: enrollment._id,
        status: { $in: ['charged', 'done'] },
        stripePaymentIntentId: { $nin: ['', null] },
    }).sort({ updatedAt: -1 }).limit(5);
    for (const claim of claims) {
        let pi;
        try {
            pi = await stripe.paymentIntents.retrieve(claim.stripePaymentIntentId);
        } catch (err) {
            const lookup = httpError('Could not check the existing card charge', 503);
            lookup.autoPayLookup = true;
            throw lookup;
        }
        if (pi?.status === 'succeeded') {
            const result = await settleAutoPayPaymentIntent(pi);
            if (result) return result;
        }
    }
    const unfinished = await Payment.find({
        ...activePaymentFilter(),
        status: { $in: ['paid', 'completed'] },
        installmentCounted: { $ne: true },
        paymentMethod: 'stripe',
        'lines.enrollment': enrollment._id,
        stripePaymentIntentId: { $nin: ['', null] },
    }).sort({ createdAt: -1 }).limit(5);
    for (const payment of unfinished) {
        if (!enrollmentNeedsAutoPayRepair(enrollment, payment)) continue;
        try {
            const { onPaymentPaid } = require('./onPaymentPaid');
            await onPaymentPaid(payment);
            if (payment.stripePaymentIntentId) {
                await AutoPayCharge.updateMany(
                    { enrollment: enrollment._id, stripePaymentIntentId: payment.stripePaymentIntentId },
                    { $set: { status: 'done', recording: false, lastError: '' } }
                );
            }
            return { payments: [payment], repaired: true };
        } catch (err) {
            const pending = httpError(err.message || 'Payment was taken but the fee was not updated', 503);
            pending.autoPayPendingRecord = true;
            throw pending;
        }
    }
    return null;
}

async function sendAutoPayEmails(payments) {
    const { sendPaymentReceiptEmail } = require('./sendPaymentReceiptEmail');
    const rows = (payments || []).filter((payment) => payment && !isUnsetPortalEmail(payment.email));
    await Promise.all(rows.map((payment) => sendPaymentReceiptEmail(payment).catch(() => {})));
}

async function notifyAutoPayStopped(enrollment, message) {
    const {
        SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_FROM_NAME,
    } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) return;
    const student = enrollment.student;
    const link = await ParentStudentLink.findOne({ student: student?._id || enrollment.student }).populate('parent', 'email personalEmail');
    const recipients = [];
    const add = (value) => {
        const email = String(value || '').trim().toLowerCase();
        if (!email || isUnsetPortalEmail(email) || recipients.includes(email)) return;
        recipients.push(email);
    };
    add(student?.personalEmail);
    add(link?.parent?.personalEmail);
    add(link?.parent?.email);
    if (!recipients.length) return;
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
    const fromEmail = SMTP_FROM_EMAIL || SMTP_USER;
    const fromName = SMTP_FROM_NAME || 'Gorythm Academy';
    const course = enrollment.course?.title || 'your course';
    await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: recipients.join(', '),
        subject: `Auto-pay stopped — ${course}`,
        text: `${message}\n\nAutomatic charges for ${course} are now off. You can pay from Fees, or turn auto-pay on again after the card is accepted.\n\nGorythm Academy`,
    });
}

async function markClaimDone(periodKey, paymentIntentId) {
    await AutoPayCharge.updateOne(
        { periodKey },
        { $set: { status: 'done', recording: false, stripePaymentIntentId: paymentIntentId || '', lastError: '' } }
    );
}

async function settleAutoPayPaymentIntent(pi) {
    if (!pi || String(pi.metadata?.autoPay || '') !== '1') return null;
    if (pi.status !== 'succeeded') return null;
    const periodKey = String(pi.metadata.periodKey || '');
    const groupId = String(pi.metadata.groupId || '');
    const existing = await Payment.findOne({
        stripePaymentIntentId: pi.id,
        ...activePaymentFilter(),
        status: { $in: ['paid', 'completed'] },
    });
    if (existing) {
        const enrollmentId = String(
            pi.metadata?.enrollmentId
            || (existing.lines || []).find((line) => line.enrollment)?.enrollment
            || ''
        );
        const enrollment = enrollmentId ? await Enrollment.findById(enrollmentId) : null;
        if (enrollmentNeedsAutoPayRepair(enrollment, existing)) {
            try {
                const { onPaymentPaid } = require('./onPaymentPaid');
                await onPaymentPaid(existing);
            } catch (err) {
                const pending = httpError(err.message || 'Payment was taken but the fee was not updated', 503);
                pending.autoPayPendingRecord = true;
                throw pending;
            }
        }
        if (periodKey) await markClaimDone(periodKey, pi.id);
        return { payments: [existing], alreadyRecorded: true };
    }
    if (!groupId) return null;
    const cutoff = new Date(Date.now() - AUTO_PAY_CLAIM_STALE_MS);
    const claimFilter = periodKey
        ? {
            periodKey,
            status: { $in: ['open', 'charged'] },
            $or: [{ recording: { $ne: true } }, { updatedAt: { $lte: cutoff } }],
        }
        : null;
    const claim = claimFilter
        ? await AutoPayCharge.findOneAndUpdate(
            claimFilter,
            { $set: { recording: true, status: 'charged', stripePaymentIntentId: pi.id, groupId } },
            { new: true }
        )
        : { periodKey: '' };
    if (periodKey && !claim) {
        return Payment.findOne({ stripePaymentIntentId: pi.id, ...activePaymentFilter() });
    }
    const intent = await BillingCheckoutIntent.findOne({ groupId });
    if (!intent) {
        if (claim?._id) {
            await AutoPayCharge.updateOne({ _id: claim._id }, { $set: { recording: false, status: 'charged', stripePaymentIntentId: pi.id, groupId } });
        }
        return null;
    }
    const { fulfillBillingIntent } = require('./billingCheckout');
    try {
        const result = await fulfillBillingIntent(intent, {
            status: 'paid',
            paymentMethod: 'stripe',
            transactionId: pi.id,
            stripePaymentIntentId: pi.id,
            currency: 'USD',
            email: String(pi.receipt_email || pi.metadata.email || ''),
            payerRole: 'student',
        });
        if (periodKey) await markClaimDone(periodKey, pi.id);
        const enrollmentId = String(pi.metadata.enrollmentId || '');
        if (enrollmentId) {
            await Enrollment.updateOne(
                { _id: enrollmentId },
                { $set: { autoPayLastError: '', autoPayLastAttemptAt: new Date(), autoPayFailCount: 0 } }
            );
        }
        if (!result?.alreadyRecorded) await sendAutoPayEmails(result?.payments || (result?.payment ? [result.payment] : []));
        return result;
    } catch (err) {
        if (claim?._id) {
            await AutoPayCharge.updateOne(
                { _id: claim._id },
                { $set: { recording: false, status: 'charged', stripePaymentIntentId: pi.id, groupId, lastError: err.message || '' } }
            );
        }
        const pending = httpError(err.message || 'Payment was taken but not saved yet', 503);
        pending.autoPayPendingRecord = true;
        throw pending;
    }
}

async function noteAutoPayStripeFailure(pi) {
    const periodKey = String(pi?.metadata?.periodKey || '');
    if (!periodKey || String(pi?.metadata?.autoPay || '') !== '1') return null;
    const declineCode = String(pi?.last_payment_error?.decline_code || '').toLowerCase();
    const message = pi?.last_payment_error?.message || 'The saved card was declined.';
    const claim = await AutoPayCharge.findOne({ periodKey });
    if (!claim) return null;
    if (claim.status === 'done' || claim.status === 'charged') return claim;
    if (claim.status === 'failed' && claim.stripePaymentIntentId === pi.id) return claim;
    const nextCount = Number(claim.attempt || 1);
    const stop = shouldStopAutoPayRetries({ decline_code: declineCode, message }, nextCount);
    claim.status = 'failed';
    claim.stripePaymentIntentId = pi.id;
    claim.declineCode = declineCode;
    claim.lastError = message;
    claim.lastAttemptAt = new Date();
    claim.stopped = stop;
    claim.recording = false;
    await claim.save();
    return claim;
}

async function acquireAutoPayClaim(enrollment, periodKey, now) {
    const existing = await AutoPayCharge.findOne({ periodKey });
    const action = autoPayClaimAction(existing, now);
    if (action === 'skip') return { action, claim: existing };
    if (action === 'record') return { action, claim: existing };
    if (!existing) {
        try {
            const claim = await AutoPayCharge.create({
                periodKey,
                enrollment: enrollment._id,
                status: 'open',
                attempt: 1,
                lastAttemptAt: now,
            });
            return { action: 'charge', claim };
        } catch (err) {
            if (err?.code !== 11000) throw err;
            const raced = await AutoPayCharge.findOne({ periodKey });
            return { action: autoPayClaimAction(raced, now) === 'charge' ? 'skip' : autoPayClaimAction(raced, now), claim: raced };
        }
    }
    if (action === 'reconcile') {
        return { action, claim: existing };
    }
    const claim = await AutoPayCharge.findOneAndUpdate(
        { _id: existing._id, status: 'failed', stopped: { $ne: true } },
        { $set: { status: 'open', lastAttemptAt: now }, $inc: { attempt: 1 } },
        { new: true }
    );
    if (!claim) return { action: 'skip', claim: existing };
    return { action: 'charge', claim };
}

async function chargeOneAutoPayEnrollment(enrollment, now = new Date()) {
    const {
        resolveCheckoutItems,
        withSharedInstallmentMonths,
        createBillingIntent,
        toMoney,
    } = require('./billingCheckout');
    const student = enrollment.student;
    if (!studentHasSavedCard(student)) {
        throw httpError('No saved card for auto-pay');
    }
    const periodKey = autoPayPeriodKey(enrollment);
    if (!periodKey) throw httpError('This fee has no due date');
    const finishedEarlier = await finishExistingAutoPayForEnrollment(enrollment);
    if (finishedEarlier) return finishedEarlier;
    const held = await acquireAutoPayClaim(enrollment, periodKey, now);
    if (held.action === 'skip') {
        if (held.claim?.stopped) {
            const stopped = httpError(held.claim.lastError || 'The bank blocked this card for automatic charges. Pay from Fees.');
            stopped.autoPayStopped = true;
            stopped.decline_code = held.claim.declineCode || '';
            throw stopped;
        }
        return { skipped: true };
    }
    if (held.action === 'record' || held.action === 'reconcile') {
        if (held.claim?.stripePaymentIntentId) {
            let savedPi;
            try {
                savedPi = await stripe.paymentIntents.retrieve(held.claim.stripePaymentIntentId);
            } catch (err) {
                const lookup = httpError('Could not check the existing card charge', 503);
                lookup.autoPayLookup = true;
                throw lookup;
            }
            if (savedPi?.status === 'succeeded') return settleAutoPayPaymentIntent(savedPi);
            if (savedPi && ['processing', 'requires_capture'].includes(savedPi.status)) {
                return { skipped: true, pending: true };
            }
        }
        const intents = await listAutoPayIntentsForPeriod(student.stripeCustomerId, periodKey, enrollment._id);
        const openIntent = preferredOpenIntent(intents);
        if (openIntent && (openIntent.status === 'succeeded' || openIntent.status === 'processing' || openIntent.status === 'requires_capture')) {
            if (openIntent.status === 'succeeded') return settleAutoPayPaymentIntent(openIntent);
            await AutoPayCharge.updateOne(
                { periodKey },
                { $set: { status: 'charged', stripePaymentIntentId: openIntent.id, recording: false } }
            );
            return { skipped: true, pending: true };
        }
        if (held.action === 'record') {
            const terminal = openIntent && ['requires_payment_method', 'canceled'].includes(openIntent.status);
            if (terminal) {
                await AutoPayCharge.updateOne(
                    { periodKey },
                    { $set: { status: 'failed', lastError: 'The card charge did not complete.', lastAttemptAt: now, recording: false } }
                );
            }
            return { skipped: true, pending: !terminal };
        }
    }

    const blocking = await findBlockingLocalPayment(enrollment);
    if (blocking) {
        if ((blocking.status === 'paid' || blocking.status === 'completed') && !blocking.installmentCounted) {
            const full = await Payment.findById(blocking._id);
            if (full && enrollmentNeedsAutoPayRepair(enrollment, full)) {
                try {
                    const { onPaymentPaid } = require('./onPaymentPaid');
                    await onPaymentPaid(full);
                } catch (err) {
                    const pending = httpError(err.message || 'Payment was taken but the fee was not updated', 503);
                    pending.autoPayPendingRecord = true;
                    throw pending;
                }
            }
        }
        await markClaimDone(periodKey, blocking.stripePaymentIntentId || '');
        return { skipped: true, alreadyPaid: true };
    }
    const existingIntents = await listAutoPayIntentsForPeriod(student.stripeCustomerId, periodKey, enrollment._id);
    const existing = preferredOpenIntent(existingIntents);
    if (existing && ['succeeded', 'processing', 'requires_capture'].includes(existing.status)) {
        if (existing.status === 'succeeded') return settleAutoPayPaymentIntent(existing);
        await AutoPayCharge.updateOne(
            { periodKey },
            { $set: { status: 'charged', stripePaymentIntentId: existing.id, recording: false } }
        );
        return { skipped: true, pending: true };
    }

    const staleCutoff = new Date(now.getTime() - AUTO_PAY_CLAIM_STALE_MS);
    await BillingCheckoutIntent.updateMany(
        {
            status: 'open',
            autoPayEnable: true,
            stripeSessionId: '',
            createdAt: { $lte: staleCutoff },
            'items.enrollment': enrollment._id,
        },
        { $set: { status: 'abandoned', consumedAt: now } }
    );
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
            email: student.personalEmail || student.email,
            name: student.name,
        },
        autoPayEnable: true,
    });
    const attempt = held.claim?.attempt || 1;
    await AutoPayCharge.updateOne({ periodKey }, { $set: { groupId: intent.groupId, attempt } });
    let pi;
    try {
        pi = await stripe.paymentIntents.create({
            amount: cents,
            currency: 'usd',
            customer: student.stripeCustomerId,
            payment_method: student.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            metadata: {
                groupId: intent.groupId,
                enrollmentId: String(enrollment._id),
                periodKey,
                autoPay: '1',
                months: '1',
                email: String(student.personalEmail || student.email || ''),
            },
        }, { idempotencyKey: autoPayIdempotencyKey(periodKey, attempt) });
    } catch (err) {
        const failedPi = err?.payment_intent || err?.raw?.payment_intent;
        if (failedPi?.status === 'succeeded') return settleAutoPayPaymentIntent(failedPi);
        intent.status = 'abandoned';
        intent.consumedAt = now;
        await intent.save().catch(() => {});
        if (err.autoPayLookup) throw err;
        const declineCode = stripeDeclineCode(err);
        const stop = shouldStopAutoPayRetries(err, attempt);
        await AutoPayCharge.updateOne(
            { periodKey },
            {
                $set: {
                    status: 'failed',
                    declineCode,
                    lastError: err.message || '',
                    lastAttemptAt: now,
                    stopped: stop,
                    recording: false,
                    stripePaymentIntentId: failedPi?.id || '',
                },
            }
        );
        err.autoPayStopped = stop;
        throw err;
    }
    if (pi.status === 'succeeded') return settleAutoPayPaymentIntent(pi);
    await AutoPayCharge.updateOne(
        { periodKey },
        { $set: { status: 'charged', stripePaymentIntentId: pi.id, groupId: intent.groupId, recording: false } }
    );
    return { skipped: true, pending: true };
}

async function chargeDueAutoPays(now = new Date()) {
    if (!stripe) return { checked: 0, charged: 0, skipped: 0, failed: 0 };
    const locked = await holdAutoPayScheduler();
    if (!locked) return { checked: 0, charged: 0, skipped: 0, failed: 0, locked: true };
    try {
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
            if (!studentHasSavedCard(enrollment.student)) {
                skipped += 1;
                continue;
            }
            try {
                const result = await chargeOneAutoPayEnrollment(enrollment, now);
                if (result?.skipped) skipped += 1;
                else charged += 1;
            } catch (err) {
                if (err.autoPayLookup || err.autoPayPendingRecord || String(err.message || '').includes('already in progress')) {
                    skipped += 1;
                    logger.error('Auto-pay charge waiting', {
                        enrollmentId: String(enrollment._id),
                        errorMessage: err.message,
                    });
                    continue;
                }
                failed += 1;
                const nextCount = Number(enrollment.autoPayFailCount || 0) + 1;
                enrollment.autoPayFailCount = nextCount;
                const stop = Boolean(err.autoPayStopped) || shouldStopAutoPayRetries(err, nextCount);
                if (stop) enrollment.autoPayEnabled = false;
                enrollment.autoPayLastError = isHardAutoPayDecline(err)
                    ? 'The bank blocked this card for automatic charges. Pay from Fees.'
                    : (err.message || 'The saved card was declined. Pay from Fees.');
                enrollment.autoPayLastAttemptAt = now;
                await enrollment.save().catch(() => {});
                if (stop) {
                    const periodKey = autoPayPeriodKey(enrollment);
                    const claim = periodKey ? await AutoPayCharge.findOne({ periodKey }) : null;
                    if (claim && !claim.notified) {
                        await notifyAutoPayStopped(enrollment, enrollment.autoPayLastError).catch(() => {});
                        claim.notified = true;
                        await claim.save().catch(() => {});
                    }
                }
                logger.error('Auto-pay charge failed', {
                    enrollmentId: String(enrollment._id),
                    errorMessage: err.message,
                    declineCode: stripeDeclineCode(err),
                    autoPayStopped: stop,
                });
            }
        }
        return { checked: enrollments.length, charged, skipped, failed };
    } finally {
        await releaseAutoPayScheduler();
    }
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
    shouldStopAutoPayRetries,
    isHardAutoPayDecline,
    AUTO_PAY_MAX_FAILURES,
    canEnableAutoPay,
    checkoutWantsAutoPay,
    autoPayConsented,
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
    autoPayPeriodKey,
    autoPayIdempotencyKey,
    autoPayClaimAction,
    enrollmentNeedsAutoPayRepair,
    settleAutoPayPaymentIntent,
    noteAutoPayStripeFailure,
};
