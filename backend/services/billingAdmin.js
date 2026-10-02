const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const { isPaidStatus, fulfillPaymentEnrollment } = require('./onPaymentPaid');
const { fulfillLinesForPayment, httpError } = require('./billingCheckout');
const { syncEnrollmentFromPayment } = require('./enrollmentPaymentSync');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { assertLaterDueDate, parseDueDateInput, applyEnrollmentDueDateInput, pushDueDateExtension } = require('../utils/feeDueDate');
const { nextInvoiceNumber } = require('../utils/invoiceNumber');
const { isPaidStoredStatus, displayEnrollmentFeeStatus, statusLabel } = require('../utils/billingStatus');
const { sendPaymentReceiptEmail } = require('./sendPaymentReceiptEmail');

async function paymentsInGroup(payment) {
    if (payment?.groupId) {
        const group = await Payment.find({ groupId: payment.groupId, ...activePaymentFilter() });
        if (group.length) return group;
    }
    if (payment?.stripePaymentIntentId) {
        const group = await Payment.find({
            stripePaymentIntentId: payment.stripePaymentIntentId,
            ...activePaymentFilter(),
        });
        if (group.length) return group;
    }
    return payment ? [payment] : [];
}

async function markPaymentPaidAndFulfill(payment, { verifiedBy = null, methodNote = '' } = {}) {
    if (!payment) throw httpError('Payment not found', 404);
    if (isPaidStatus(payment.status)) throw httpError('Payment is already paid');
    if (payment.status === 'refunded') throw httpError('Refunded payments cannot be marked received');
    if (payment.status === 'cancelled') throw httpError('Cancelled payments cannot be marked received');

    payment.status = 'paid';
    payment.rejectionReason = '';
    payment.failureReason = '';
    payment.verifiedBy = verifiedBy || payment.verifiedBy;
    payment.verifiedAt = new Date();
    payment.receiptIssuedAt = payment.receiptIssuedAt || new Date();
    if (methodNote && !payment.paymentMethod) payment.paymentMethod = methodNote;
    await payment.save();
    await payment.populate(['user', 'course']);

    const { issues } = await fulfillLinesForPayment(payment, { verifiedBy });
    if (issues.length) {
        payment.failureReason = issues.join(' ');
        await payment.save();
        throw httpError(issues[0], 400);
    }
    sendPaymentReceiptEmail(payment).catch(() => {});
    return payment;
}

async function syncUnpaidPaymentsDueDate(enrollment) {
    if (!enrollment?.feeDueDate) return;
    await Payment.updateMany(
        {
            ...activePaymentFilter(),
            status: { $in: ['pending'] },
            $or: [
                { user: enrollment.student, course: enrollment.course },
                { 'lines.enrollment': enrollment._id },
            ],
        },
        { $set: { dueDate: enrollment.feeDueDate } }
    );
}

async function setEnrollmentFeeDueDate(enrollment, dueDateInput, actorId, options = {}) {
    const result = applyEnrollmentDueDateInput(enrollment, dueDateInput, actorId, options);
    if (result.changed) await syncUnpaidPaymentsDueDate(enrollment);
    return result;
}

async function extendPaymentDueDate(payment, dueDateInput, actorId, note = '') {
    if (!payment) throw httpError('Payment not found', 404);
    if (isPaidStoredStatus(payment.status) || payment.status === 'refunded' || payment.status === 'cancelled') {
        throw httpError('Due date can only be extended on unpaid bills');
    }
    if (payment.status === 'awaiting_review' || payment.status === 'processing') {
        throw httpError('Due date cannot be changed while the academy is checking this payment');
    }
    const next = assertLaterDueDate(payment.dueDate, parseDueDateInput(dueDateInput));
    pushDueDateExtension(payment, next, actorId, note);
    payment.dueDate = next;
    if (Array.isArray(payment.lines)) {
        payment.lines = payment.lines.map((line) => ({
            ...(line.toObject ? line.toObject() : line),
            dueDate: next,
        }));
    }
    await payment.save();

    const enrollmentIds = (payment.lines || []).map((line) => line.enrollment).filter(Boolean);
    const or = [];
    if (enrollmentIds.length) or.push({ _id: { $in: enrollmentIds } });
    if (payment.user && payment.course) or.push({ student: payment.user, course: payment.course });
    if (!or.length) return payment;
    const enrollments = await Enrollment.find({
        ...activeEnrollmentFilter(),
        paymentStatus: { $in: ['pending', 'failed'] },
        $or: or,
    });
    for (const enrollment of enrollments) {
        applyEnrollmentDueDateInput(enrollment, next, actorId, { forceExtend: true });
        await enrollment.save();
    }
    return payment;
}

async function reopenEnrollmentsAfterDeclinedPayment(payment) {
    const lines = Array.isArray(payment?.lines) && payment.lines.length
        ? payment.lines
        : [{ student: payment.user, course: payment.course, enrollment: payment.enrollment }];
    for (const line of lines) {
        let enrollment = null;
        if (line.enrollment) {
            enrollment = await Enrollment.findOne({ _id: line.enrollment, ...activeEnrollmentFilter() });
        }
        if (!enrollment && (line.student || payment.user) && (line.course || payment.course)) {
            enrollment = await Enrollment.findOne({
                student: line.student?._id || line.student || payment.user?._id || payment.user,
                course: line.course?._id || line.course || payment.course?._id || payment.course,
                ...activeEnrollmentFilter(),
            });
        }
        if (!enrollment) continue;
        const current = String(enrollment.paymentStatus || '');
        if (current === 'paid' || current === 'refunded') continue;
        if (current === 'pending') continue;
        enrollment.paymentStatus = 'pending';
        await enrollment.save();
    }
}

async function cancelPaymentRecord(payment, actorId, reason = '') {
    if (!payment) throw httpError('Payment not found', 404);
    if (isPaidStatus(payment.status)) throw httpError('Paid payments cannot be declined. Refund instead.');
    if (payment.status === 'refunded') throw httpError('Refunded payments cannot be declined');
    payment.status = 'cancelled';
    payment.cancelledAt = new Date();
    payment.cancelledBy = actorId || null;
    payment.cancelReason = String(reason || '').trim().slice(0, 500);
    await payment.save();
    await payment.populate(['user', 'course']);
    await reopenEnrollmentsAfterDeclinedPayment(payment);
    return payment;
}

async function extendEnrollmentDueDate(enrollmentId, dueDateInput, actorId) {
    if (!mongoose.Types.ObjectId.isValid(String(enrollmentId))) {
        throw httpError('Invalid enrollment id');
    }
    const enrollment = await Enrollment.findOne({ _id: enrollmentId, ...activeEnrollmentFilter() });
    if (!enrollment) throw httpError('Enrollment not found', 404);
    applyEnrollmentDueDateInput(enrollment, dueDateInput, actorId, { forceExtend: true });
    await enrollment.save();
    await syncUnpaidPaymentsDueDate(enrollment);
    return enrollment;
}

async function markEnrollmentReceived(enrollmentId, actorId) {
    if (!mongoose.Types.ObjectId.isValid(String(enrollmentId))) {
        throw httpError('Invalid enrollment id');
    }
    const enrollment = await Enrollment.findOne({ _id: enrollmentId, ...activeEnrollmentFilter() })
        .populate('student', 'name email personalEmail phone')
        .populate('course', 'title price');
    if (!enrollment) throw httpError('Enrollment not found', 404);
    if (enrollment.paymentStatus === 'paid') throw httpError('This enrollment is already paid');
    if (enrollment.paymentStatus === 'cancelled') throw httpError('Cancelled enrollments cannot be marked received');

    const amount = Number(enrollment.course?.price || 0);
    if (!amount) throw httpError('This course has no payable amount');

    const payment = await Payment.create({
        user: enrollment.student?._id || enrollment.student,
        course: enrollment.course?._id || enrollment.course,
        studentName: enrollment.student?.name || 'Student',
        email: enrollment.student?.personalEmail || enrollment.student?.email || '',
        phone: enrollment.student?.phone || '',
        courseName: enrollment.course?.title || '',
        amount,
        currency: 'USD',
        status: 'paid',
        paymentMethod: 'manual',
        transactionId: `manual_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        invoiceNumber: await nextInvoiceNumber(),
        dueDate: enrollment.feeDueDate || null,
        payerRole: 'admin',
        verifiedBy: actorId || null,
        verifiedAt: new Date(),
        receiptIssuedAt: new Date(),
        invoiceMode: 'combined',
        lines: [
            {
                student: enrollment.student?._id || enrollment.student,
                course: enrollment.course?._id || enrollment.course,
                enrollment: enrollment._id,
                studentName: enrollment.student?.name || '',
                studentEmail: enrollment.student?.personalEmail || enrollment.student?.email || '',
                courseName: enrollment.course?.title || '',
                amount,
                dueDate: enrollment.feeDueDate || null,
            },
        ],
    });
    await fulfillPaymentEnrollment(payment, { verifiedBy: actorId });
    sendPaymentReceiptEmail(payment).catch(() => {});
    return payment;
}

async function cancelEnrollmentFee(enrollmentId, actorId, reason = '') {
    if (!mongoose.Types.ObjectId.isValid(String(enrollmentId))) {
        throw httpError('Invalid enrollment id');
    }
    const enrollment = await Enrollment.findOne({ _id: enrollmentId, ...activeEnrollmentFilter() });
    if (!enrollment) throw httpError('Enrollment not found', 404);
    if (enrollment.paymentStatus === 'paid') throw httpError('Paid enrollments cannot be cancelled. Refund the payment instead.');
    enrollment.paymentStatus = 'cancelled';
    await enrollment.save();

    await Payment.updateMany(
        {
            ...activePaymentFilter(),
            status: { $in: ['pending', 'awaiting_review', 'processing'] },
            $or: [
                {
                    user: enrollment.student,
                    course: enrollment.course,
                    $or: [{ lines: { $size: 0 } }, { lines: { $exists: false } }, { 'lines.1': { $exists: false } }],
                },
                { 'lines.enrollment': enrollment._id, 'lines.1': { $exists: false } },
            ],
        },
        {
            $set: {
                status: 'cancelled',
                cancelledAt: new Date(),
                cancelledBy: actorId || null,
                cancelReason: String(reason || '').trim(),
            },
        }
    );
    return enrollment;
}

async function listOutstandingFees() {
    const enrollments = await Enrollment.find({
        course: { $ne: null },
        paymentStatus: { $in: ['pending', 'failed'] },
        ...activeEnrollmentFilter(),
    })
        .populate('student', 'name email personalEmail studentId')
        .populate('course', 'title price')
        .sort({ feeDueDate: 1, createdAt: -1 })
        .limit(500)
        .lean();

    return enrollments
        .filter((row) => row.student && row.course)
        .map((row) => {
            const displayStatus = displayEnrollmentFeeStatus(row);
            return {
                enrollmentId: row._id,
                studentId: row.student._id,
                studentName: row.student.name,
                studentEmail: row.student.personalEmail || row.student.email,
                courseId: row.course._id,
                courseName: row.course.title,
                amount: Number(row.course.price || 0),
                dueDate: row.feeDueDate || null,
                paymentStatus: row.paymentStatus,
                displayStatus,
                statusLabel: statusLabel(displayStatus),
            };
        });
}

module.exports = {
    paymentsInGroup,
    markPaymentPaidAndFulfill,
    extendPaymentDueDate,
    cancelPaymentRecord,
    extendEnrollmentDueDate,
    setEnrollmentFeeDueDate,
    markEnrollmentReceived,
    cancelEnrollmentFee,
    listOutstandingFees,
};
