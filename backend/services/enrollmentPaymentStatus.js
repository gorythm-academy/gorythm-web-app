const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { displayEnrollmentFeeStatus } = require('../utils/billingStatus');

const VALID_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'cancelled'];

function statusFromPaymentList(payments) {
    if (!payments?.length) return 'pending';
    const sorted = [...payments].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
    const latest = sorted[0];
    if (latest.status === 'paid' || latest.status === 'completed') return 'paid';
    if (latest.status === 'refunded') return 'refunded';
    if (latest.status === 'cancelled' || latest.status === 'rejected') return 'cancelled';
    if (latest.status === 'failed') return 'failed';
    return 'pending';
}

function paymentQueryForStudent(studentId, studentEmail, courseId) {
    const or = [{ user: studentId }, { 'lines.student': studentId }];
    if (studentEmail) {
        const email = String(studentEmail).toLowerCase();
        or.push({ email });
        or.push({ 'lines.studentEmail': email });
    }
    return {
        $and: [
            { $or: [{ course: courseId }, { 'lines.course': courseId }] },
            { $or: or },
        ],
    };
}

async function derivePaymentStatusForCourse(studentId, studentEmail, courseId) {
    if (!courseId) return 'pending';
    const payments = await Payment.find(paymentQueryForStudent(studentId, studentEmail, courseId));
    return statusFromPaymentList(payments);
}

/**
 * Display fee status: enrollment.paymentStatus on the document is authoritative (admin edit, enroll form).
 * Stripe/payment sync updates that field via enrollmentPaymentSync — we do not overwrite it here.
 */
async function enrichEnrollmentsWithPaymentStatus(enrollments, studentId, studentEmail) {
    const docs = enrollments.map((e) => (e.toObject ? e.toObject() : { ...e }));
    return docs.map((e) => {
        const stored = e.paymentStatus;
        const status =
            stored && VALID_STATUSES.includes(stored) ? stored : 'pending';
        const displayStatus = displayEnrollmentFeeStatus({ ...e, paymentStatus: status });
        return { ...e, paymentStatus: status, displayFeeStatus: displayStatus };
    });
}

async function countPendingFeesForStudents(studentIds, emailByStudentId = {}) {
    if (!studentIds?.length) return 0;
    const enrollments = await Enrollment.find({
        student: { $in: studentIds },
        course: { $ne: null },
        ...activeEnrollmentFilter(),
    });
    let pending = 0;
    for (const enr of enrollments) {
        const display = displayEnrollmentFeeStatus(enr);
        if (['unpaid', 'overdue', 'failed'].includes(display)) pending += 1;
    }
    return pending;
}

module.exports = {
    statusFromPaymentList,
    derivePaymentStatusForCourse,
    enrichEnrollmentsWithPaymentStatus,
    countPendingFeesForStudents,
};
