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
    const or = [{ user: studentId }];
    if (studentEmail) {
        or.push({ email: String(studentEmail).toLowerCase() });
    }
    return { ...activePaymentFilter(), $or: or };
}

module.exports = {
    activePaymentFilter,
    trashedPaymentFilter,
    excludeLegacyIncompleteBankFilter,
    activePaymentListFilter,
    studentPaymentsFilter,
};
