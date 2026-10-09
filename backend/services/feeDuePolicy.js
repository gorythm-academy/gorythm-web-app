const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Payment = require('../models/Payment');
const BillingCheckoutIntent = require('../models/BillingCheckoutIntent');
const { getOrCreateSettings } = require('./settingsService');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activePaymentFilter } = require('../utils/paymentQuery');
const {
    parseDueDateInput,
    academyDayFromDate,
    firstDueDateFromJoin,
    nextDueDateAfterPay,
    parsedTotalFeeCount,
    enrollmentAllFeesPaid,
    enrollmentFeeIsFree,
    enrollmentHasFeeCount,
    enrollmentFeePlanTotal,
    maxPayableMonths,
    parseInstallmentMonths,
    dueDateAfterPayingMonths,
    pktYmd,
    isFeeDueDatePast,
    isFeeDueDateInFuture,
    pushDueDateExtension,
} = require('../utils/feeDueDate');
const { displayEnrollmentFeeStatus } = require('../utils/billingStatus');

function httpError(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function toDateInputValue(value) {
    const ymd = pktYmd(value);
    if (!ymd) return '';
    return `${ymd.y}-${String(ymd.m).padStart(2, '0')}-${String(ymd.d).padStart(2, '0')}`;
}

async function getFeeDueSettings() {
    const settings = await getOrCreateSettings();
    const raw = settings.payment?.defaultFeeDueDate || null;
    let defaultFeeDueDate = null;
    try {
        if (raw) defaultFeeDueDate = parseDueDateInput(raw);
    } catch {
        defaultFeeDueDate = null;
    }
    const feeDueDay = academyDayFromDate(defaultFeeDueDate);
    return { settings, defaultFeeDueDate, feeDueDay };
}

async function academyDayFor(enrollment) {
    if (enrollment?.feeDueDay) return Number(enrollment.feeDueDay);
    if (enrollment?.feeDueDate) {
        const day = academyDayFromDate(enrollment.feeDueDate);
        if (day) return day;
    }
    const { feeDueDay, defaultFeeDueDate } = await getFeeDueSettings();
    return feeDueDay || academyDayFromDate(defaultFeeDueDate) || academyDayFromDate(new Date()) || 1;
}

function copyTotalFeeCountFromCourse(enrollment, course) {
    if (enrollment.totalFeeCount != null) return;
    const total = parsedTotalFeeCount(course?.totalFeeCount);
    if (total != null) enrollment.totalFeeCount = total;
}

async function assignEnrollmentDueDate(enrollment, { course = null, joinDate = null } = {}) {
    if (!enrollment) return enrollment;
    if (enrollmentFeeIsFree({ ...enrollment.toObject?.() || enrollment, course: course || enrollment.course })) {
        enrollment.feeDueDate = null;
        return enrollment;
    }
    const { defaultFeeDueDate, feeDueDay } = await getFeeDueSettings();
    const courseDue = course?.feeDueDate || (enrollment.course && enrollment.course.feeDueDate);
    const from = joinDate || enrollment.enrollmentDate || enrollment.createdAt || new Date();
    if (courseDue) {
        enrollment.feeDueDate = parseDueDateInput(courseDue);
        enrollment.feeDueDay = academyDayFromDate(courseDue);
        return enrollment;
    }
    if (defaultFeeDueDate) {
        enrollment.feeDueDate = parseDueDateInput(defaultFeeDueDate);
        enrollment.feeDueDay = academyDayFromDate(defaultFeeDueDate) || feeDueDay;
        return enrollment;
    }
    const academyDay = feeDueDay || academyDayFromDate(from) || 1;
    enrollment.feeDueDay = academyDay;
    enrollment.feeDueDate = firstDueDateFromJoin(from, academyDay);
    return enrollment;
}

async function applyPaymentsDefaultDueDate(dueDateInput, actorId) {
    const next = parseDueDateInput(dueDateInput);
    const day = academyDayFromDate(next);
    const settings = await getOrCreateSettings();
    settings.payment = {
        ...(settings.payment?.toObject?.() || settings.payment || {}),
        defaultFeeDueDate: next,
    };
    if (typeof settings.markModified === 'function') settings.markModified('payment');
    settings.lastUpdatedBy = actorId || settings.lastUpdatedBy || null;
    await settings.save();

    await Course.updateMany(
        { deletedAt: null },
        { $set: { feeDueDate: next } }
    );

    const enrollments = await Enrollment.find({
        ...activeEnrollmentFilter(),
        status: { $nin: ['completed'] },
        paymentStatus: { $nin: ['cancelled', 'refunded'] },
    });
    for (const enrollment of enrollments) {
        if (enrollmentFeeIsFree(enrollment)) continue;
        enrollment.feeDueDate = next;
        enrollment.feeDueDay = day;
        enrollment.feeDueDateManuallySet = true;
        pushDueDateExtension(enrollment, next, actorId, 'Payments default due date');
        await enrollment.save();
    }
    return { defaultFeeDueDate: next, feeDueDay: day };
}

async function applyCourseDueDate(course, dueDateInput, actorId) {
    if (dueDateInput === null || dueDateInput === undefined || dueDateInput === '') {
        course.feeDueDate = null;
        return { changed: true };
    }
    const next = parseDueDateInput(dueDateInput);
    course.feeDueDate = next;
    const enrollments = await Enrollment.find({
        course: course._id,
        ...activeEnrollmentFilter(),
        status: { $nin: ['completed'] },
        paymentStatus: { $nin: ['cancelled', 'refunded'] },
    });
    for (const enrollment of enrollments) {
        enrollment.feeDueDate = next;
        enrollment.feeDueDay = academyDayFromDate(next);
        enrollment.feeDueDateManuallySet = true;
        pushDueDateExtension(enrollment, next, actorId, 'Course due date');
        await enrollment.save();
    }
    return { changed: true };
}

function parseTotalFeeCountInput(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) {
        const err = httpError('Total number of fees must be 1 or more, or left empty');
        throw err;
    }
    if (n < 1) throw httpError('Total number of fees must be 1 or more, or left empty');
    return Math.floor(n);
}

async function recountPaidInstallments(enrollment) {
    const total = parsedTotalFeeCount(enrollment.totalFeeCount);
    const previous = Number(enrollment.paidInstallmentCount || 0);
    const rows = await paidInvoiceRowsForEnrollment(enrollment);
    const paid = rows.reduce((sum, row) => sum + Math.max(1, Math.floor(Number(row.installmentMonths || 1))), 0);
    const next = total == null ? paid : Math.min(paid, total);
    enrollment.paidInstallmentCount = next === 0 && previous > 0 ? previous : next;
    return enrollment;
}

async function applyCourseTotalFeeCount(course, nextTotal) {
    course.totalFeeCount = nextTotal;
    const enrollments = await Enrollment.find({
        course: course._id,
        ...activeEnrollmentFilter(),
        status: { $nin: ['completed'] },
        paymentStatus: { $nin: ['cancelled', 'refunded'] },
    });
    for (const enrollment of enrollments) {
        enrollment.totalFeeCount = nextTotal;
        await recountPaidInstallments(enrollment);
        await enrollment.save();
    }
    return course;
}

async function assertTotalFeeCountNotBelowPaid(enrollment, nextTotal) {
    if (nextTotal == null) return;
    const paid = Number(enrollment.paidInstallmentCount || 0);
    if (paid > nextTotal) {
        throw httpError(`Already paid ${paid}`);
    }
}

function isExtraInstallmentPayment(enrollment, now = new Date()) {
    if (!enrollment?.lastSettledDueDate) return false;
    if (!enrollment.feeDueDate) return false;
    return isFeeDueDateInFuture(enrollment.feeDueDate, now);
}

function installmentMonthsForPayment(payment, enrollment) {
    const lines = Array.isArray(payment?.lines) ? payment.lines : [];
    const enrollmentId = String(enrollment?._id || '');
    const courseId = String(enrollment?.course?._id || enrollment?.course || payment?.course?._id || payment?.course || '');
    const line = lines.find((row) => {
        if (enrollmentId && String(row.enrollment || '') === enrollmentId) return true;
        if (courseId && String(row.course?._id || row.course || '') === courseId) return true;
        return false;
    });
    return Math.max(1, Math.floor(Number(line?.installmentMonths || payment?.installmentMonths || 1)));
}

function lineAmountForEnrollment(payment, enrollment) {
    const lines = Array.isArray(payment?.lines) ? payment.lines : [];
    const enrollmentId = String(enrollment?._id || '');
    const courseId = String(enrollment?.course?._id || enrollment?.course || payment?.course?._id || payment?.course || '');
    const line = lines.find((row) => {
        if (enrollmentId && String(row.enrollment || '') === enrollmentId) return true;
        if (courseId && String(row.course?._id || row.course || '') === courseId) return true;
        return false;
    });
    if (line && line.amount != null) return Number(line.amount || 0);
    return Number(payment?.amount || 0);
}

function isPartialInstallment(paidAmount, coursePrice) {
    const paid = Number(paidAmount || 0);
    const price = Number(coursePrice || 0);
    if (!Number.isFinite(price) || price <= 0) return false;
    return paid + 0.009 < price;
}

async function applyInstallmentPayment(enrollment, payment, { course = null } = {}) {
    if (!enrollment || !payment) return { counted: false, extra: false };
    const courseDoc = course || enrollment.course;
    copyTotalFeeCountFromCourse(enrollment, courseDoc);
    if (enrollmentFeeIsFree({ ...enrollment.toObject?.() || enrollment, course: courseDoc })) {
        enrollment.paymentStatus = 'paid';
        enrollment.feeDueDate = null;
        await enrollment.save();
        return { counted: false, extra: false, free: true };
    }

    const monthsRequested = installmentMonthsForPayment(payment, enrollment);
    const allowed = maxPayableMonths(enrollment);
    const months = parseInstallmentMonths(monthsRequested, allowed || monthsRequested);
    const expectedAmount = Number(courseDoc?.price || 0) * Math.max(1, months);
    if (isPartialInstallment(lineAmountForEnrollment(payment, enrollment), expectedAmount)) {
        await enrollment.save();
        return { counted: false, extra: false, partial: true };
    }

    if (enrollmentAllFeesPaid(enrollment) || isExtraInstallmentPayment(enrollment) || allowed < 1) {
        payment.installmentCounted = false;
        if (typeof payment.save === 'function') await payment.save();
        if (enrollmentHasFeeCount(enrollment) && enrollmentAllFeesPaid(enrollment)) {
            enrollment.paymentStatus = 'paid';
        }
        await enrollment.save();
        return { counted: false, extra: true };
    }

    const n = Math.max(1, Math.min(months, allowed));
    const previousDue = enrollment.feeDueDate;
    enrollment.paidInstallmentCount = Number(enrollment.paidInstallmentCount || 0) + n;
    enrollment.lastSettledDueDate = previousDue || new Date();
    payment.installmentCounted = true;
    payment.installmentMonths = Math.max(Number(payment.installmentMonths || 1), n);
    if (typeof payment.save === 'function') await payment.save();

    if (enrollmentAllFeesPaid(enrollment)) {
        enrollment.paymentStatus = 'paid';
        await enrollment.save();
        return { counted: true, extra: false, complete: true, months: n };
    }

    const day = await academyDayFor(enrollment);
    enrollment.paymentStatus = 'paid';
    let from = previousDue || new Date();
    if (isFeeDueDatePast(from)) from = new Date();
    let next = dueDateAfterPayingMonths(from, day, n);
    if (isFeeDueDatePast(next)) next = dueDateAfterPayingMonths(new Date(), day, n);
    enrollment.feeDueDate = next;
    enrollment.feeDueDay = day;
    await enrollment.save();
    return { counted: true, extra: false, months: n };
}

async function reverseInstallmentPayment(payment) {
    if (!payment?.installmentCounted) return;
    const lines = Array.isArray(payment.lines) && payment.lines.length
        ? payment.lines
        : [{ student: payment.user, course: payment.course, enrollment: payment.enrollment }];
    for (const line of lines) {
        const enrollmentId = line.enrollment;
        let enrollment = null;
        if (enrollmentId) {
            enrollment = await Enrollment.findOne({ _id: enrollmentId, ...activeEnrollmentFilter() });
        }
        if (!enrollment && line.student && line.course) {
            enrollment = await Enrollment.findOne({
                student: line.student,
                course: line.course,
                ...activeEnrollmentFilter(),
            });
        }
        if (!enrollment && payment.user && payment.course) {
            enrollment = await Enrollment.findOne({
                student: payment.user,
                course: payment.course,
                ...activeEnrollmentFilter(),
            });
        }
        if (!enrollment) continue;
        const months = Math.max(1, Math.floor(Number(line.installmentMonths || payment.installmentMonths || 1)));
        enrollment.paidInstallmentCount = Math.max(0, Number(enrollment.paidInstallmentCount || 0) - months);
        if (String(enrollment.status || '') !== 'completed' && !enrollmentAllFeesPaid(enrollment)) {
            if (!enrollment.feeDueDate || !isFeeDueDatePast(enrollment.feeDueDate)) {
                const day = await academyDayFor(enrollment);
                enrollment.feeDueDate = firstDueDateFromJoin(new Date(), day);
                enrollment.feeDueDay = day;
            }
        }
        await enrollment.save();
    }
    payment.installmentCounted = false;
    if (typeof payment.save === 'function') await payment.save();
}

async function skipEnrollmentMonth(enrollment, actorId) {
    if (!enrollment) throw httpError('Enrollment not found', 404);
    if (enrollmentAllFeesPaid(enrollment) || String(enrollment.paymentStatus) === 'cancelled') {
        throw httpError('This course has no open fee to skip');
    }
    const day = await academyDayFor(enrollment);
    const next = nextDueDateAfterPay(enrollment.feeDueDate || new Date(), day);
    pushDueDateExtension(enrollment, next, actorId, 'Skipped this month');
    enrollment.feeDueDate = next;
    enrollment.feeDueDay = day;
    enrollment.feeDueDateManuallySet = true;
    await enrollment.save();
    return enrollment;
}

async function prepareUncompleteDueDate(enrollment) {
    if (enrollmentAllFeesPaid(enrollment) || enrollmentFeeIsFree(enrollment)) {
        return enrollment;
    }
    const day = await academyDayFor(enrollment);
    enrollment.feeDueDate = firstDueDateFromJoin(new Date(), day);
    enrollment.feeDueDay = day;
    return enrollment;
}

function enrollmentNeedsStoredDueDate(enrollment) {
    const status = String(enrollment?.status || '');
    const pay = String(enrollment?.paymentStatus || '');
    if (status === 'completed' || pay === 'cancelled' || pay === 'refunded') return false;
    if (enrollment?.feeDueDate) return false;
    if (enrollmentFeeIsFree(enrollment)) return false;
    return true;
}

/** Fill due dates that were never stored. Does not recount payments. */
async function backfillMissingFeeDueDates(rows) {
    const missing = (Array.isArray(rows) ? rows : []).filter(enrollmentNeedsStoredDueDate);
    if (!missing.length) return;
    await Promise.all(missing.map((row) => assignEnrollmentDueDate(row, {
        course: row.course,
        joinDate: row.enrollmentDate || row.createdAt,
    })));
    const ops = missing
        .filter((row) => row._id && row.feeDueDate)
        .map((row) => ({
            updateOne: {
                filter: { _id: row._id, feeDueDate: null },
                update: { $set: { feeDueDate: row.feeDueDate, feeDueDay: row.feeDueDay ?? null } },
            },
        }));
    if (ops.length) {
        await Enrollment.bulkWrite(ops, { ordered: false }).catch(() => {});
    }
}

async function ensureEnrollmentDueDate(enrollment) {
    const status = String(enrollment.status || '');
    const pay = String(enrollment.paymentStatus || '');
    if (status === 'completed' || pay === 'cancelled' || pay === 'refunded') return enrollment;
    if (enrollmentFeeIsFree(enrollment)) return enrollment;

    const updates = {};
    copyTotalFeeCountFromCourse(enrollment, enrollment.course);
    if (parsedTotalFeeCount(enrollment.totalFeeCount) != null) {
        await recountPaidInstallments(enrollment);
        updates.totalFeeCount = enrollment.totalFeeCount;
        updates.paidInstallmentCount = enrollment.paidInstallmentCount;
    }
    if (!enrollment.feeDueDate) {
        await assignEnrollmentDueDate(enrollment, { course: enrollment.course });
        if (enrollment.feeDueDate) {
            updates.feeDueDate = enrollment.feeDueDate;
            updates.feeDueDay = enrollment.feeDueDay;
        }
    }
    if (enrollment._id && Object.keys(updates).length) {
        Enrollment.updateOne({ _id: enrollment._id }, { $set: updates }).catch(() => {});
    }
    return enrollment;
}

async function assertCheckoutAllowed(enrollment) {
    if (!enrollment) return;
    if (String(enrollment.status || '').toLowerCase() === 'paused') {
        throw httpError('This course is paused. Fees are on hold until the academy sets it back to Active.');
    }
    if (enrollmentFeeIsFree(enrollment)) {
        throw httpError('This course has no payable amount');
    }
    if (enrollmentAllFeesPaid(enrollment)) {
        throw httpError('All fees paid');
    }
    if (isExtraInstallmentPayment(enrollment)) {
        throw httpError('Already paid for this month.');
    }
    const studentId = enrollment.student?._id || enrollment.student;
    const courseId = enrollment.course?._id || enrollment.course;
    if (studentId && courseId) {
        const open = await BillingCheckoutIntent.findOne({
            status: 'open',
            items: { $elemMatch: { student: studentId, course: courseId } },
        }).select('_id');
        if (open) throw httpError('Payment already in progress.');
    }
}

async function paidInvoiceRowsForEnrollment(enrollment) {
    const studentId = enrollment.student?._id || enrollment.student;
    const courseId = enrollment.course?._id || enrollment.course;
    const enrollmentId = enrollment._id;
    if (!courseId) return [];
    const emails = [];
    const addEmail = (value) => {
        const email = String(value || '').trim().toLowerCase();
        if (email && !emails.includes(email)) emails.push(email);
    };
    addEmail(enrollment.student?.personalEmail);
    addEmail(enrollment.student?.email);
    if (studentId && emails.length === 0) {
        const User = require('../models/User');
        const student = await User.findById(studentId).select('email personalEmail').lean();
        addEmail(student?.personalEmail);
        addEmail(student?.email);
    }
    const studentOr = [
        studentId ? { user: studentId } : null,
        studentId ? { 'lines.student': studentId } : null,
        enrollmentId ? { 'lines.enrollment': enrollmentId } : null,
        ...emails.flatMap((email) => [{ email }, { 'lines.studentEmail': email }]),
    ].filter(Boolean);
    if (!studentOr.length) return [];
    const payments = await Payment.find({
        ...activePaymentFilter(),
        status: { $in: ['paid', 'completed'] },
        $and: [
            { $or: studentOr },
            { $or: [{ course: courseId }, { 'lines.course': courseId }] },
        ],
    })
        .sort({ receiptIssuedAt: 1, createdAt: 1 })
        .lean();
    return payments.map((row) => {
        const line = (row.lines || []).find((entry) => {
            if (enrollmentId && String(entry.enrollment || '') === String(enrollmentId)) return true;
            if (courseId && String(entry.course?._id || entry.course || '') === String(courseId)) return true;
            return false;
        });
        return {
            invoiceNumber: row.invoiceNumber || String(row._id),
            date: row.receiptIssuedAt || row.verifiedAt || row.createdAt,
            amount: line?.amount ?? row.amount,
            method: row.paymentMethod,
            installmentMonths: Math.max(1, Math.floor(Number(line?.installmentMonths || row.installmentMonths || 1))),
        };
    });
}

async function buildEnrollmentFeeSummary(enrollment) {
    const paidInvoices = await paidInvoiceRowsForEnrollment(enrollment);
    const total = parsedTotalFeeCount(enrollment.totalFeeCount);
    const paidCount = Number(enrollment.paidInstallmentCount || 0);
    const remainingCount = total == null ? null : Math.max(0, total - paidCount);
    const price = Number(enrollment.course?.price || 0);
    return {
        studentName: enrollment.student?.name || '',
        courseName: enrollment.course?.title || '',
        paidCount,
        totalFeeCount: total,
        remainingCount,
        remainingAmount: remainingCount == null ? null : remainingCount * price,
        paidInvoices,
        displayFeeStatus: displayEnrollmentFeeStatus(enrollment),
        allFeesPaid: enrollmentAllFeesPaid(enrollment),
        enrollmentStatus: enrollment.status,
        needsCompleteConfirm: remainingCount == null ? paidCount === 0 && !enrollmentAllFeesPaid(enrollment) : remainingCount > 0,
    };
}

function feeProgressLabel(enrollment) {
    const total = enrollmentFeePlanTotal(enrollment);
    if (total == null) return '';
    const paid = Number(enrollment?.paidInstallmentCount || 0);
    if (paid >= total) return `${total} of ${total} paid`;
    return `${paid} of ${total} paid`;
}

module.exports = {
    getFeeDueSettings,
    assignEnrollmentDueDate,
    applyPaymentsDefaultDueDate,
    applyCourseDueDate,
    parseTotalFeeCountInput,
    assertTotalFeeCountNotBelowPaid,
    copyTotalFeeCountFromCourse,
    applyCourseTotalFeeCount,
    recountPaidInstallments,
    applyInstallmentPayment,
    reverseInstallmentPayment,
    maxPayableMonths,
    parseInstallmentMonths,
    skipEnrollmentMonth,
    prepareUncompleteDueDate,
    backfillMissingFeeDueDates,
    ensureEnrollmentDueDate,
    assertCheckoutAllowed,
    buildEnrollmentFeeSummary,
    feeProgressLabel,
    toDateInputValue,
    isExtraInstallmentPayment,
};
