const { displayPaymentStatus, statusLabel, overdueOnDate } = require('./billingStatus');

/** Strip sensitive payment fields for API responses. */
function serializePayment(doc, { includeUploadToken = false } = {}) {
    if (!doc) return null;
    const o = doc.toObject ? doc.toObject() : { ...doc };
    if (!includeUploadToken) delete o.uploadToken;
    const displayStatus = displayPaymentStatus(o);
    o.displayStatus = displayStatus;
    o.statusLabel = statusLabel(displayStatus);
    o.overdueSince = displayStatus === 'overdue' ? overdueOnDate(o.dueDate) : null;
    o.invoiceNumber = o.invoiceNumber || null;
    o.presentmentCurrency = o.presentmentCurrency || '';
    o.presentmentAmount = o.presentmentAmount ?? null;
    return o;
}

function serializePayments(list, options = {}) {
    return (list || []).map((p) => serializePayment(p, options));
}

/** Public bank-registration response (new payment only). */
function serializePaymentRegistration(payment) {
    return {
        _id: payment._id,
        transactionId: payment.transactionId,
        invoiceNumber: payment.invoiceNumber || null,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        uploadToken: payment.uploadToken,
        hasProof: Boolean(payment.proofUrl),
    };
}

/** Resume flow — no uploadToken until phone verified. */
function serializePendingPaymentResume(payment) {
    return {
        _id: payment._id,
        transactionId: payment.transactionId,
        invoiceNumber: payment.invoiceNumber || null,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        hasProof: Boolean(payment.proofUrl),
        needsPhoneVerification: true,
    };
}

module.exports = {
    serializePayment,
    serializePayments,
    serializePaymentRegistration,
    serializePendingPaymentResume,
};
