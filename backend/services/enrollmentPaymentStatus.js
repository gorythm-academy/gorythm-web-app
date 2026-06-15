const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');

const VALID_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

function statusFromPaymentList(payments) {
    if (!payments?.length) return 'pending';
    const sorted = [...payments].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
    const latest = sorted[0];
    if (latest.status === 'paid' || latest.status === 'completed') return 'paid';
    if (latest.status === 'refunded') return 'refunded';
    if (latest.status === 'failed') return 'failed';
    return 'pending';
}

function paymentQueryForStudent(studentId, studentEmail, courseId) {
    const or = [{ user: studentId }];
    if (studentEmail) {
        or.push({ email: String(studentEmail).toLowerCase() });
    }
    return { course: courseId, $or: or };
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
        return { ...e, paymentStatus: status };
    });
}

async function countPendingFeesForStudents(studentIds, emailByStudentId = {}) {
    if (!studentIds?.length) return 0;
    const enrollments = await Enrollment.find({
        student: { $in: studentIds },
        course: { $ne: null },
    });
    let pending = 0;
    for (const enr of enrollments) {
        if ((enr.paymentStatus || 'pending') === 'pending') pending += 1;
    }
    return pending;
}

module.exports = {
    statusFromPaymentList,
    derivePaymentStatusForCourse,
    enrichEnrollmentsWithPaymentStatus,
    countPendingFeesForStudents,
};
