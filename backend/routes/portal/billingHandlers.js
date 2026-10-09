const mongoose = require('mongoose');
const Payment = require('../../models/Payment');
const { getOrCreateSettings } = require('../../services/settingsService');
const {
    resolveCheckoutItems,
    withSharedInstallmentMonths,
    stripeLineItemsFromResolved,
    stripeChargeableItems,
    assertStripeMinimum,
    createBillingIntent,
    savePaymentsFromIntent,
    toMoney,
    loadLinkedChildren,
    parentOwnsPayment,
    studentOwnsPayment,
    serializeBillingPayment,
    paymentCoversEnrollment,
} = require('../../services/billingCheckout');
const { parseInvoiceMode, displayEnrollmentFeeStatus, statusLabel, overdueOnDate } = require('../../utils/billingStatus');
const { isExtraInstallmentPayment } = require('../../services/feeDuePolicy');
const { maxPayableMonths } = require('../../utils/feeDueDate');
const { activePaymentFilter, studentPaymentsFilter, paymentsForStudentsFilter } = require('../../utils/paymentQuery');
const { serializePayments } = require('../../utils/serializePayment');
const { buildPaymentInvoicePdf } = require('../../utils/paymentInvoicePdf');
const { isPaidStatus } = require('../../services/onPaymentPaid');
const { createCheckoutSessionWithFallback: createStripeCheckoutSession } = require('../../utils/stripeMoney');
const { ensureInvoiceNumber } = require('../../utils/invoiceNumber');
const { unauthorized, loadStudentDisplayEnrollments } = require('./helpers');
const Enrollment = require('../../models/Enrollment');
const { activeEnrollmentFilter } = require('../../utils/enrollmentQuery');

const OPEN_PAYABLE_STATUSES = ['unpaid', 'pending', 'overdue', 'failed', 'awaiting_review'];

function serializeDisplayEnrollment(row, student) {
    const paymentStatus = row.paymentStatus || 'pending';
    const displayStatus = row.displayFeeStatus || displayEnrollmentFeeStatus({ ...row, paymentStatus });
    const allFeesPaid = Boolean(row.allFeesPaid);
    const extraThisCycle = isExtraInstallmentPayment(row);
    const canPay = ['unpaid', 'overdue', 'failed'].includes(displayStatus)
        && Number(toMoney(row.feeAmount ?? row.course?.price)) >= 0.5
        && !allFeesPaid
        && !extraThisCycle;
    return {
        enrollmentId: row._id,
        studentId: student?._id || row.student,
        studentCode: student?.studentId || '',
        studentName: student?.name || '',
        studentEmail: student?.personalEmail || student?.email || '',
        courseId: row.course?._id || row.course,
        courseName: row.course?.title || '—',
        courseCategory: row.course?.category || '',
        amount: toMoney(row.feeAmount ?? row.course?.price),
        dueDate: row.feeDueDate || row.course?.feeDueDate || null,
        overdueSince: displayStatus === 'overdue' ? overdueOnDate(row.feeDueDate || row.course?.feeDueDate) : null,
        enrollmentDate: row.enrollmentDate,
        createdAt: row.createdAt,
        paymentStatus,
        displayStatus,
        displayFeeStatus: displayStatus,
        statusLabel: allFeesPaid ? 'All fees paid' : statusLabel(displayStatus),
        selectable: canPay,
        enrollmentStatus: row.status,
        paidInstallmentCount: Number(row.paidInstallmentCount || 0),
        totalFeeCount: row.totalFeeCount || row.course?.totalFeeCount || null,
        maxPayableMonths: maxPayableMonths({
            ...row,
            course: row.course,
        }),
        feeProgress: row.feeProgress || '',
        allFeesPaid,
        autoPayEnabled: Boolean(row.autoPayEnabled),
        autoPayLastError: String(row.autoPayLastError || '').trim(),
    };
}

function applyVerificationHold(enrollments, payments) {
    return enrollments.map((row) => {
        const awaiting = (payments || []).some((payment) => {
            const status = String(payment.status || '').toLowerCase();
            if (!['awaiting_review', 'processing'].includes(status)) return false;
            return paymentCoversEnrollment(payment, {
                _id: row.enrollmentId,
                student: row.studentId,
                course: row.courseId,
            });
        });
        if (!awaiting) return row;
        return {
            ...row,
            awaitingReview: true,
            displayStatus: row.displayStatus === 'overdue' ? 'overdue' : row.displayStatus,
            displayFeeStatus: row.displayStatus === 'overdue' ? 'overdue' : row.displayFeeStatus,
            statusLabel: row.displayStatus === 'overdue' ? statusLabel('overdue') : statusLabel('awaiting_review'),
            selectable: false,
        };
    });
}

function applyDeclineNotes(enrollments, payments) {
    return enrollments.map((row) => {
        const declined = (payments || []).find((payment) => {
            const status = String(payment.status || '').toLowerCase();
            if (status !== 'cancelled' && status !== 'rejected') return false;
            return paymentCoversEnrollment(payment, {
                _id: row.enrollmentId,
                student: row.studentId,
                course: row.courseId,
            });
        });
        if (!declined) return row;
        const next = {
            ...row,
            declineNote: String(declined.cancelReason || '').trim(),
        };
        if (row.displayStatus !== 'cancelled' && row.paymentStatus !== 'cancelled') return next;
        const displayStatus = displayEnrollmentFeeStatus({
            paymentStatus: 'pending',
            feeDueDate: row.dueDate,
            paidInstallmentCount: row.paidInstallmentCount,
            totalFeeCount: row.totalFeeCount,
            status: row.enrollmentStatus,
        });
        return {
            ...next,
            displayStatus,
            displayFeeStatus: displayStatus,
            selectable: ['unpaid', 'overdue', 'failed'].includes(displayStatus),
            statusLabel: statusLabel(displayStatus),
        };
    });
}

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

function frontendBase() {
    return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function checkoutPaymentMethodTypes() {
    const raw = process.env.STRIPE_CHECKOUT_PAYMENT_METHOD_TYPES;
    if (raw && String(raw).trim()) {
        const list = String(raw)
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
        if (list.length) return list;
    }
    return ['card'];
}

async function createCheckoutSessionWithFallback(params, types) {
    return createStripeCheckoutSession(stripe, params, types);
}

async function bankDetailsPayload() {
    const settings = await getOrCreateSettings();
    const p = settings.payment || {};
    return {
        accountName: p.bankAccountName || '',
        bankName: p.bankName || '',
        accountNumber: p.bankAccountNumber || '',
        iban: p.bankIban || '',
        swift: p.bankSwift || '',
        extraNote: p.bankExtraNote || '',
        currency: p.currency || 'USD',
    };
}

async function sendPdf(res, payment, kind = 'invoice', lineFilter = null) {
    await ensureInvoiceNumber(payment);
    const { loadPaidInvoiceHistory } = require('../../utils/invoicePaymentHistory');
    const historyRows = await loadPaidInvoiceHistory(payment, { lineFilter });
    const pdfBuffer = buildPaymentInvoicePdf(payment, { kind, lineFilter, historyRows });
    const safeId = String(payment.invoiceNumber || payment.transactionId || payment._id).replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}_${safeId}.pdf"`);
    return res.send(pdfBuffer);
}

async function sendPortalInvoicePdf(res, payment, query = {}) {
    const kind = String(query.kind || 'invoice') === 'receipt' ? 'receipt' : 'invoice';
    let doc = payment;
    if (String(query.scope || '') === 'combined' && payment.groupId) {
        const { paymentsInGroup } = require('../../services/billingAdmin');
        const group = await paymentsInGroup(payment);
        const paid = group.filter((row) => isPaidStatus(row.status));
        if (paid.length) {
            const lines = paid.flatMap((row) => (
                Array.isArray(row.lines) && row.lines.length
                    ? row.lines
                    : [{
                        studentName: row.studentName,
                        courseName: row.courseName || row.course?.title,
                        amount: row.amount,
                        course: row.course,
                        student: row.user,
                    }]
            ));
            const amount = paid.reduce((sum, row) => sum + Number(row.amount || 0), 0);
            doc = {
                ...(payment.toObject ? payment.toObject() : payment),
                lines,
                amount,
                invoiceMode: 'combined',
            };
        }
    }
    const lineFilter = {};
    if (query.studentId) lineFilter.studentId = query.studentId;
    if (query.courseId) lineFilter.courseId = query.courseId;
    if (query.courseName) lineFilter.courseName = query.courseName;
    return sendPdf(res, doc, kind, Object.keys(lineFilter).length ? lineFilter : null);
}

async function loadParentBilling(parentId) {
    const children = await loadLinkedChildren(parentId);
    const [enrollmentGroups, payments, bankDetails] = await Promise.all([
        Promise.all(
            children.map(async (child) => {
                const rows = await loadStudentDisplayEnrollments(child._id, child.personalEmail || child.email, {
                    includeSchedule: false,
                });
                return rows.map((row) => serializeDisplayEnrollment(row, child));
            })
        ),
        (async () => {
            const studentIds = children.map((child) => child._id);
            const emails = children.map((child) => child.personalEmail || child.email).filter(Boolean);
            try {
                return await Payment.find(paymentsForStudentsFilter(studentIds, emails))
                    .populate('course', 'title')
                    .sort({ createdAt: -1 })
                    .limit(200)
                    .lean();
            } catch {
                return [];
            }
        })(),
        bankDetailsPayload(),
    ]);
    const enrollments = enrollmentGroups.flat();
    const serializedPayments = serializePayments(payments).map((row) => serializeBillingPayment(row));
    const enrollmentsWithHold = applyDeclineNotes(applyVerificationHold(enrollments, payments), payments);
    const payable = enrollmentsWithHold.filter((row) => OPEN_PAYABLE_STATUSES.includes(row.displayStatus));
    const User = require('../../models/User');
    const { serializeSavedCards } = require('../../services/billingAutoPay');
    const childIds = children.map((child) => child._id);
    const cardUsers = await User.find({ _id: { $in: childIds } }).select('name stripeCustomerId stripePaymentMethodId stripeSavedCards');
    const savedCardsByStudent = cardUsers.map((child) => ({
        studentId: child._id,
        studentName: child.name,
        cards: serializeSavedCards(child),
    })).filter((row) => row.cards.length);
    return {
        children: children.map((child) => ({
            _id: child._id,
            name: child.name,
            email: child.email,
            studentId: child.studentId,
        })),
        enrollments: enrollmentsWithHold,
        payable,
        payments: serializedPayments,
        bankDetails,
        savedCardsByStudent,
    };
}

async function loadStudentBilling(studentId, email) {
    const rows = await loadStudentDisplayEnrollments(studentId, email, { includeSchedule: false });
    const enrollments = rows.map((row) => serializeDisplayEnrollment(row, { _id: studentId, email }));
    const payments = await Payment.find(studentPaymentsFilter(studentId, email))
        .populate('course', 'title')
        .sort({ createdAt: -1 })
        .limit(100);
    const serializedPayments = serializePayments(payments).map((row) => serializeBillingPayment(row));
    const enrollmentsWithHold = applyDeclineNotes(applyVerificationHold(enrollments, payments), payments);
    const payable = enrollmentsWithHold.filter((row) => OPEN_PAYABLE_STATUSES.includes(row.displayStatus));
    const User = require('../../models/User');
    const { serializeSavedCards } = require('../../services/billingAutoPay');
    const student = await User.findById(studentId).select('name studentId stripeCustomerId stripePaymentMethodId stripeSavedCards');
    return {
        student: {
            name: student?.name || '',
            studentId: student?.studentId || '',
        },
        enrollments: enrollmentsWithHold,
        payable,
        payments: serializedPayments,
        bankDetails: await bankDetailsPayload(),
        savedCards: serializeSavedCards(student),
    };
}

async function startPortalStripeCheckout({ actor, enrollmentIds, invoiceMode, months, autoPay }) {
    if (!stripe) {
        const err = new Error('Card payment is not available yet. Please use bank transfer or contact the academy.');
        err.status = 503;
        throw err;
    }
    const ids = (enrollmentIds || []).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    if (!ids.length) {
        const err = new Error('Select at least one unpaid fee');
        err.status = 400;
        throw err;
    }
    const resolvedItems = withSharedInstallmentMonths(
        await resolveCheckoutItems({
            rawItems: ids.map((enrollmentId) => ({ enrollmentId })),
            actor,
        }),
        months
    );
    if (actor.role === 'parent') {
        const children = await loadLinkedChildren(actor.userId);
        const allowed = new Set(children.map((child) => String(child._id)));
        for (const item of resolvedItems) {
            if (!allowed.has(String(item.studentId))) {
                const err = new Error('You can only pay fees for your linked children');
                err.status = 403;
                throw err;
            }
        }
    } else if (actor.role === 'student') {
        for (const item of resolvedItems) {
            if (String(item.studentId) !== String(actor.userId)) {
                const err = new Error('You can only pay your own course fees');
                err.status = 403;
                throw err;
            }
        }
    }
    const chargeable = stripeChargeableItems(resolvedItems);
    assertStripeMinimum(chargeable);
    const User = require('../../models/User');
    const { ensureStripeCustomer, checkoutWantsAutoPay } = require('../../services/billingAutoPay');
    const enableAutoPay = checkoutWantsAutoPay(autoPay);
    const studentIds = [...new Set(resolvedItems.map((item) => String(item.studentId || '')).filter(Boolean))];
    let customerId = '';
    if (studentIds.length === 1) {
        const student = await User.findById(studentIds[0]);
        if (student) customerId = await ensureStripeCustomer(student);
    }
    const intent = await createBillingIntent({
        items: chargeable,
        invoiceMode: parseInvoiceMode(invoiceMode),
        payer: actor,
        autoPayEnable: enableAutoPay,
    });
    const types = checkoutPaymentMethodTypes();
    const base = frontendBase();
    const session = await createCheckoutSessionWithFallback(
        {
            phone_number_collection: { enabled: true },
            ...(customerId ? { customer: customerId } : { customer_email: actor.email || undefined }),
            line_items: stripeLineItemsFromResolved(chargeable),
            mode: 'payment',
            success_url: `${base}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/payment-cancel`,
            ...(enableAutoPay ? { payment_intent_data: { setup_future_usage: 'off_session' } } : {}),
            metadata: {
                groupId: intent.groupId,
                courseId: String(chargeable[0].courseId),
                userId: String(chargeable[0].studentId || actor.userId || ''),
                payerUserId: String(actor.userId || ''),
                autoPay: enableAutoPay ? '1' : '0',
                enrollmentIds: ids.map((id) => String(id)).join(','),
            },
        },
        types
    );
    intent.stripeSessionId = session.id;
    await intent.save();
    return { url: session.url, sessionId: session.id, groupId: intent.groupId };
}

async function submitPortalBankPayment({ actor, enrollmentIds, invoiceMode, proofUrl, phone, payerName, months }) {
    const ids = (enrollmentIds || []).filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
    if (!ids.length) {
        const err = new Error('Select at least one unpaid fee');
        err.status = 400;
        throw err;
    }
    if (!proofUrl) {
        const err = new Error('Payment proof screenshot or PDF is required');
        err.status = 400;
        throw err;
    }
    const phoneDigits = String(phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
        const err = new Error('Enter a valid phone number with 8 to 15 digits');
        err.status = 400;
        throw err;
    }
    const resolvedItems = withSharedInstallmentMonths(
        await resolveCheckoutItems({
            rawItems: ids.map((enrollmentId) => ({ enrollmentId })),
            actor,
        }),
        months
    );
    const intent = await createBillingIntent({
        items: resolvedItems,
        invoiceMode: parseInvoiceMode(invoiceMode),
        payer: actor,
    });
    const payments = await savePaymentsFromIntent(intent, {
        status: 'awaiting_review',
        paymentMethod: 'bank',
        transactionId: `bank_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        proofUrl,
        proofSubmittedAt: new Date(),
        phone: phoneDigits,
        email: actor.email,
        studentName: payerName || actor.name,
        payerUser: actor.userId,
        payerRole: actor.role,
        currency: 'USD',
    });
    intent.status = 'consumed';
    intent.consumedAt = new Date();
    await intent.save();
    return payments;
}

async function findAccessiblePayment({ paymentId, actor }) {
    const rawId = String(paymentId || '').replace(/^enrollment:/, '');
    if (!mongoose.Types.ObjectId.isValid(rawId)) {
        const err = new Error('Payment not found');
        err.status = 404;
        throw err;
    }
    const ownership = [];
    if (actor.role === 'parent') {
        const children = await loadLinkedChildren(actor.userId);
        const studentIds = children.map((child) => child._id);
        const emails = children
            .flatMap((child) => [child.personalEmail, child.email])
            .concat(actor.email || [])
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean);
        ownership.push({ payerUser: actor.userId });
        if (studentIds.length) {
            ownership.push({ user: { $in: studentIds } });
            ownership.push({ 'lines.student': { $in: studentIds } });
        }
        if (emails.length) {
            ownership.push({ email: { $in: emails } });
            ownership.push({ 'lines.studentEmail': { $in: emails } });
        }
    } else if (actor.role === 'student') {
        ownership.push({ user: actor.userId });
        ownership.push({ 'lines.student': actor.userId });
        ownership.push({ payerUser: actor.userId });
        if (actor.email) {
            const email = String(actor.email).trim().toLowerCase();
            ownership.push({ email });
            ownership.push({ 'lines.studentEmail': email });
        }
    }
    const payment = await Payment.findOne({
        _id: rawId,
        ...activePaymentFilter(),
        ...(ownership.length ? { $and: [{ $or: ownership }] } : {}),
    })
        .populate('user', 'name email')
        .populate('course', 'title');
    if (!payment) {
        const err = new Error('Payment not found');
        err.status = 404;
        throw err;
    }
    return payment;
}

function enrollmentAsInvoicePayment(enrollment) {
    const student = enrollment.student || {};
    const course = enrollment.course || {};
    const dueDate = enrollment.feeDueDate || null;
    const stored = String(enrollment.paymentStatus || 'pending');
    const status = stored === 'paid' || stored === 'completed' ? 'paid' : stored;
    return {
        _id: enrollment._id,
        transactionId: `enr_${enrollment._id}`,
        studentName: student.name || '',
        email: student.personalEmail || student.email || '',
        amount: toMoney(course.price),
        currency: 'USD',
        status,
        dueDate,
        createdAt: enrollment.enrollmentDate || enrollment.createdAt,
        course,
        courseName: course.title || '',
        lines: [
            {
                student: student._id,
                course: course._id,
                enrollment: enrollment._id,
                studentName: student.name || '',
                courseName: course.title || '',
                amount: toMoney(course.price),
                dueDate,
            },
        ],
    };
}

async function findAccessibleEnrollment({ enrollmentId, actor }) {
    if (!mongoose.Types.ObjectId.isValid(String(enrollmentId))) {
        const err = new Error('Invalid enrollment id');
        err.status = 400;
        throw err;
    }
    const enrollment = await Enrollment.findOne({ _id: enrollmentId, ...activeEnrollmentFilter() })
        .populate('course', 'title price deletedAt')
        .populate('student', 'name email personalEmail deletedAt');
    if (!enrollment || !enrollment.course || !enrollment.student) {
        const err = new Error('Enrollment not found');
        err.status = 404;
        throw err;
    }
    if (actor.role === 'parent') {
        const children = await loadLinkedChildren(actor.userId);
        const allowed = children.some((child) => String(child._id) === String(enrollment.student._id));
        if (!allowed) {
            const err = new Error('Enrollment not found');
            err.status = 404;
            throw err;
        }
    } else if (actor.role === 'student') {
        if (String(enrollment.student._id) !== String(actor.userId)) {
            const err = new Error('Enrollment not found');
            err.status = 404;
            throw err;
        }
    }
    return enrollment;
}

function sendEnrollmentPdf(res, enrollment, kind = 'invoice') {
    return sendPdf(res, enrollmentAsInvoicePayment(enrollment), kind);
}

async function sendPortalStatementPdf(res, actor) {
    const billing = actor.role === 'parent'
        ? await loadParentBilling(actor.userId)
        : await loadStudentBilling(actor.userId, actor.email);
    const paid = (billing.payments || []).filter((row) => isPaidStatus(row.status));
    if (!paid.length) {
        const err = new Error('Invoices are available after a fee is received.');
        err.status = 400;
        throw err;
    }
    const { statementInvoiceNumber, methodLabel, money } = require('../../utils/paymentInvoicePdf');
    const historyRows = paid.map((row) => {
        const course = Array.isArray(row.lines) && row.lines.length
            ? row.lines.map((line) => line.courseName).filter(Boolean).join(', ')
            : (row.courseName || row.course?.title || 'Course fee');
        return {
            date: row.receiptIssuedAt || row.verifiedAt || row.createdAt,
            invoiceNo: row.invoiceNumber || '',
            course: course || 'Course fee',
            method: methodLabel(row.paymentMethod),
            amount: money(Number(row.amount || 0), row.currency || 'USD'),
        };
    });
    const amount = paid.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const first = paid[0];
    const invoiceNumber = statementInvoiceNumber();
    const pdfBuffer = buildPaymentInvoicePdf({
        studentName: actor.name || first.studentName,
        email: actor.email || first.email,
        phone: first.phone,
        amount,
        currency: 'USD',
        status: 'paid',
        invoiceNumber,
        createdAt: new Date(),
        receiptIssuedAt: new Date(),
    }, {
        kind: 'invoice',
        statement: true,
        historyRows,
    });
    const safeId = String(invoiceNumber).replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${safeId}.pdf"`);
    return res.send(pdfBuffer);
}

module.exports = {
    loadParentBilling,
    loadStudentBilling,
    startPortalStripeCheckout,
    submitPortalBankPayment,
    setPortalAutoPay: (...args) => require('../../services/billingAutoPay').setPortalAutoPay(...args),
    deleteSavedCard: (...args) => require('../../services/billingAutoPay').deleteSavedCard(...args),
    findAccessiblePayment,
    findAccessibleEnrollment,
    sendPdf,
    sendPortalInvoicePdf,
    sendEnrollmentPdf,
    sendPortalStatementPdf,
    isPaidStatus,
    unauthorized,
};
