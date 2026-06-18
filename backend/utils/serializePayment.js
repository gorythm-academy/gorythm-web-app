/** Strip sensitive payment fields for API responses. */
function serializePayment(doc, { includeUploadToken = false } = {}) {
    if (!doc) return null;
    const o = doc.toObject ? doc.toObject() : { ...doc };
    if (!includeUploadToken) delete o.uploadToken;
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
