export const isPaymentPaid = (status) => status === 'paid' || status === 'completed';

export const formatPaymentStatus = (status, displayStatus) => {
    const key = displayStatus || status;
    if (key === 'completed' || key === 'paid') return 'Paid';
    if (key === 'awaiting_review' || key === 'processing') return 'Pending Verification';
    if (key === 'pending' || key === 'unpaid') return 'Unpaid';
    if (key === 'overdue') return 'Overdue';
    if (key === 'refunded') return 'Refunded';
    if (key === 'cancelled' || key === 'rejected') return 'Declined';
    return key || '—';
};

export const canOpenStudentFromPayment = (payment) => {
    if (!isPaymentPaid(payment.status)) return false;
    if (payment.paymentMethod === 'bank' && !payment.proofUrl) return false;
    return !!(payment.email || payment.user?.email);
};

export const COLUMN_DEFS = [
    'checkbox',
    'transactionId',
    'student',
    'course',
    'amount',
    'email',
    'phone',
    'status',
    'method',
    'date',
    'actions',
];

export const idsForPaymentRow = (payment) =>
    (Array.isArray(payment.groupedPaymentIds) && payment.groupedPaymentIds.length
        ? payment.groupedPaymentIds
        : [payment._id]
    ).map(String);

export const paymentTableId = (payment) => payment?.stripePaymentIntentId || payment?.transactionId || '';

export const copyToClipboard = (text) => {
    if (!text) return;
    const t = String(text);
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(t).catch(() => {
            /* ignore */
        });
        return;
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    } catch {
        /* ignore */
    }
};

export const methodBadgeClass = (method) => {
    const m = String(method || '').toLowerCase();
    if (m === 'card' || m === 'link') return 'stripe';
    return m.replace(/[^a-z0-9-]/g, '') || 'other';
};

export const methodIconClass = (method) => {
    const m = String(method || '').toLowerCase();
    if (m === 'stripe' || m === 'card' || m === 'link') return 'fas fa-credit-card';
    if (m === 'bank') return 'fas fa-university';
    return 'fas fa-money-bill-wave';
};

export const getStatusIcon = (status) => {
    switch (status) {
        case 'paid':
        case 'completed': return 'check-circle';
        case 'awaiting_review': return 'hourglass-half';
        case 'overdue': return 'exclamation-circle';
        case 'unpaid':
        case 'pending': return 'clock';
        case 'cancelled':
        case 'rejected': return 'ban';
        case 'failed': return 'times-circle';
        case 'refunded': return 'undo';
        default: return 'question-circle';
    }
};
