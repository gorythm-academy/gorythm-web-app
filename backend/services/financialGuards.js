const Payment = require('../models/Payment');
const PayrollRun = require('../models/PayrollRun');
const { activePaymentFilter } = require('../utils/paymentQuery');

const PAID_STATUSES = ['paid', 'completed'];

async function userHasFinancialRecords(userId) {
    if (!userId) return false;

    const [paymentCount, payrollAsTeacher, payrollGenerated, payrollPaid] = await Promise.all([
        Payment.countDocuments({
            ...activePaymentFilter(),
            $or: [{ user: userId }, { verifiedBy: userId }],
            status: { $in: [...PAID_STATUSES, 'refunded', 'awaiting_review', 'processing'] },
        }),
        PayrollRun.countDocuments({ teacher: userId }),
        PayrollRun.countDocuments({ generatedBy: userId }),
        PayrollRun.countDocuments({ paidBy: userId }),
    ]);

    return paymentCount + payrollAsTeacher + payrollGenerated + payrollPaid > 0;
}

async function paymentIsFinanciallyProtected(payment) {
    if (!payment) return false;
    return (
        PAID_STATUSES.includes(payment.status) ||
        payment.status === 'refunded' ||
        payment.status === 'processing'
    );
}

module.exports = {
    userHasFinancialRecords,
    paymentIsFinanciallyProtected,
    PAID_STATUSES,
};
