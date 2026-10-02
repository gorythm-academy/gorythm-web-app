const UNPAID_STORED_STATUSES = ['pending', 'awaiting_review', 'processing'];
const PAID_STORED_STATUSES = ['paid', 'completed'];

const STATUS_LABELS = {
    unpaid: 'Unpaid',
    pending: 'Unpaid',
    awaiting_review: 'Waiting for verification',
    processing: 'Waiting for verification',
    paid: 'Paid',
    completed: 'Paid',
    overdue: 'Overdue',
    refunded: 'Refunded',
    cancelled: 'Cancelled',
    rejected: 'Cancelled',
    failed: 'Failed',
    paused: 'Paused',
};

function startOfDay(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function isPaidStoredStatus(status) {
    return PAID_STORED_STATUSES.includes(String(status || ''));
}

function isClosedFeeStatus(status) {
    const value = String(status || '');
    return isPaidStoredStatus(value) || value === 'refunded' || value === 'cancelled' || value === 'rejected';
}

function isPastDue(dueDate, now = new Date()) {
    const { isFeeDueDatePast } = require('./feeDueDate');
    return isFeeDueDatePast(dueDate, now);
}

function overdueOnDate(dueDate) {
    const { pktYmd, dateFromAcademyDay } = require('./feeDueDate');
    const due = pktYmd(dueDate);
    if (!due) return null;
    let year = due.y;
    let month = due.m;
    let day = due.d + 1;
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > dim) {
        day = 1;
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return dateFromAcademyDay(year, month, day);
}

function isFeeOverdue(dueDate, now = new Date()) {
    return isPastDue(dueDate, now);
}

function displayPaymentStatus(payment, now = new Date()) {
    const status = String(payment?.status || 'pending');
    if (status === 'cancelled' || status === 'rejected') return 'cancelled';
    if (status === 'refunded') return 'refunded';
    if (isPaidStoredStatus(status)) return 'paid';
    if (status === 'failed') return 'failed';
    if (status === 'awaiting_review' || status === 'processing') {
        return 'awaiting_review';
    }
    if (UNPAID_STORED_STATUSES.includes(status) || status === 'pending') {
        if (isFeeOverdue(payment?.dueDate, now)) return 'overdue';
        return 'unpaid';
    }
    return status || 'unpaid';
}

function displayEnrollmentFeeStatus(enrollment, now = new Date()) {
    const { enrollmentAllFeesPaid, enrollmentFeeIsFree } = require('./feeDueDate');
    const status = String(enrollment?.paymentStatus || 'pending');
    if (status === 'refunded') return 'refunded';
    if (status === 'cancelled' || status === 'rejected') return 'cancelled';
    if (status === 'failed') return 'failed';
    if (enrollmentFeeIsFree(enrollment)) return 'paid';
    if (enrollmentAllFeesPaid(enrollment)) return 'paid';
    const enrollmentStatus = String(enrollment?.status || '').toLowerCase();
    if (enrollmentStatus === 'completed') return 'unpaid';
    if (enrollmentStatus === 'paused') return 'paused';
    if (isFeeOverdue(enrollment?.feeDueDate, now)) return 'overdue';
    const { isFeeDueDateInFuture } = require('./feeDueDate');
    const paidCount = Number(enrollment?.paidInstallmentCount || 0);
    if (
        isFeeDueDateInFuture(enrollment?.feeDueDate, now)
        && (paidCount > 0 || isPaidStoredStatus(status))
    ) {
        return 'paid';
    }
    return 'unpaid';
}

function statusLabel(status) {
    const key = String(status || '');
    return STATUS_LABELS[key] || key || 'Unpaid';
}

function parseInvoiceMode(value) {
    return String(value || '').trim() === 'separate' ? 'separate' : 'combined';
}

module.exports = {
    UNPAID_STORED_STATUSES,
    PAID_STORED_STATUSES,
    OVERDUE_GRACE_DAYS: 0,
    STATUS_LABELS,
    startOfDay,
    isPaidStoredStatus,
    isClosedFeeStatus,
    isPastDue,
    overdueOnDate,
    isFeeOverdue,
    displayPaymentStatus,
    displayEnrollmentFeeStatus,
    statusLabel,
    parseInvoiceMode,
};
