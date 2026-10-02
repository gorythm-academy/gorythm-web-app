const activePaymentFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedPaymentFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

/** Old bank flow: pending row before proof upload — hide from active lists. */
const excludeLegacyIncompleteBankFilter = () => ({
    $nor: [
        {
            paymentMethod: 'bank',
            status: 'pending',
            $or: [{ proofUrl: null }, { proofUrl: '' }],
        },
    ],
});

const activePaymentListFilter = () => ({
    $and: [activePaymentFilter(), excludeLegacyIncompleteBankFilter()],
});

/** Payments tied to a student account or registration email. */
function studentPaymentsFilter(studentId, studentEmail) {
    const or = [{ user: studentId }, { 'lines.student': studentId }, { payerUser: studentId }];
    if (studentEmail) {
        const email = String(studentEmail).toLowerCase();
        or.push({ email });
        or.push({ 'lines.studentEmail': email });
    }
    return { ...activePaymentFilter(), $or: or };
}

function paymentsForStudentsFilter(studentIds = [], emails = []) {
    const ids = (studentIds || []).filter(Boolean);
    const or = [];
    if (ids.length) {
        or.push({ user: { $in: ids } });
        or.push({ 'lines.student': { $in: ids } });
        or.push({ payerUser: { $in: ids } });
    }
    const normalizedEmails = (emails || []).map((email) => String(email || '').toLowerCase()).filter(Boolean);
    if (normalizedEmails.length) {
        or.push({ email: { $in: normalizedEmails } });
        or.push({ 'lines.studentEmail': { $in: normalizedEmails } });
    }
    if (!or.length) return { ...activePaymentFilter(), _id: { $in: [] } };
    return { ...activePaymentFilter(), $or: or };
}

function overduePaymentFilter(now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 7);
    return {
        dueDate: { $ne: null, $lte: cutoff },
        status: 'pending',
    };
}

module.exports = {
    activePaymentFilter,
    trashedPaymentFilter,
    excludeLegacyIncompleteBankFilter,
    activePaymentListFilter,
    studentPaymentsFilter,
    paymentsForStudentsFilter,
    overduePaymentFilter,
};
