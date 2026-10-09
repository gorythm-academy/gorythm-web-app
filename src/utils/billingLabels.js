export const BILLING_STATUS_LABELS = {
  unpaid: 'Unpaid',
  pending: 'Unpaid',
  awaiting_review: 'Waiting for verification',
  processing: 'Waiting for verification',
  paid: 'Paid',
  completed: 'Paid',
  overdue: 'Overdue',
  refunded: 'Refunded',
    cancelled: 'Declined',
    rejected: 'Declined',
  failed: 'Failed',
  paused: 'Paused',
};

export function billingStatusLabel(status) {
  const key = String(status || 'unpaid');
  return BILLING_STATUS_LABELS[key] || key;
}

export function isPaidBillingStatus(status) {
  return status === 'paid' || status === 'completed';
}

export function canDownloadInvoice(item) {
  return isPaidBillingStatus(item?.displayStatus || item?.status || item?.paymentStatus);
}

export function enrollmentStatusLabel(status) {
  const key = String(status || 'active').toLowerCase();
  if (key === 'completed') return 'Completed';
  if (key === 'inactive') return 'Setup in progress';
  if (key === 'paused') return 'Paused';
  return 'Active';
}

export function formatMoney(amount, currency = 'USD') {
  const value = Number(amount || 0);
  if (Number.isNaN(value)) return '—';
  const code = String(currency || 'USD').toUpperCase();
  if (code === 'USD') return `$${value.toFixed(2)}`;
  if (code === 'PKR') return `Rs ${value.toFixed(2)}`;
  return `${code} ${value.toFixed(2)}`;
}

function formatDayMonthYear(date) {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDueDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDayMonthYear(date);
}

export function resolveFeeDueDate(item) {
  const direct = item?.dueDate || item?.feeDueDate;
  if (direct) {
    const date = new Date(direct);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function feeProgressLabel(item) {
  const total = Number(item?.totalFeeCount ?? item?.course?.totalFeeCount);
  if (!Number.isFinite(total) || total < 1) return '';
  const paid = Number(item?.paidInstallmentCount || 0);
  const shown = Math.min(paid, total);
  return `${shown} of ${total} paid`;
}

export function formatFeeSummaryMessage(summary) {
  if (!summary) return 'This student still has unpaid fees. Complete anyway?';
  const student = summary.studentName || 'This student';
  const course = summary.courseName || 'this course';
  const progress = summary.totalFeeCount
    ? `${summary.paidCount} of ${summary.totalFeeCount} paid`
    : `${summary.paidCount} paid invoice(s)`;
  const invoices = (summary.paidInvoices || [])
    .slice(0, 6)
    .map((row) => row.invoiceNumber)
    .filter(Boolean)
    .join(', ');
  const extra = invoices ? ` Paid invoices: ${invoices}.` : '';
  return `${student} · ${course}. ${progress}.${extra} Complete anyway?`;
}

export function formatPaymentDate(payment) {
  if (!payment) return '—';
  const paid = isPaidBillingStatus(payment.displayStatus || payment.status);
  const raw = paid
    ? payment.receiptIssuedAt || payment.verifiedAt || payment.createdAt
    : payment.createdAt;
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDayMonthYear(date);
}

export function savedCardLabel(card) {
  if (!card) return '';
  const brand = String(card.brand || 'Card');
  const name = brand.charAt(0).toUpperCase() + brand.slice(1);
  const last4 = String(card.last4 || card.cardLast4 || '');
  return last4 ? `${name} •••• ${last4}` : name;
}

export function maxPayableMonths(item) {
  if (item?.maxPayableMonths != null) {
    const n = Number(item.maxPayableMonths);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  const total = Number(item?.totalFeeCount ?? item?.course?.totalFeeCount);
  const paid = Number(item?.paidInstallmentCount || 0);
  if (item?.allFeesPaid) return 0;
  if (!Number.isFinite(total) || total < 1) return 4;
  return Math.max(0, Math.floor(total) - paid);
}

export function sharedMaxPayableMonths(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return 1;
  return Math.max(1, Math.min(...list.map((item) => maxPayableMonths(item) || 1)));
}

export function canSelectFee(item) {
  if (String(item?.enrollmentStatus || item?.status || '').toLowerCase() === 'paused') return false;
  if (item?.selectable === false) return false;
  const amount = Number(item?.amount ?? item?.course?.price ?? 0);
  if (Number.isFinite(amount) && amount < 0.5) return false;
  const status = String(
    item?.displayStatus || item?.displayFeeStatus || item?.paymentStatus || item?.feeStatus || ''
  ).toLowerCase();
  if (item?.selectable === true) return true;
  return ['unpaid', 'pending', 'overdue', 'failed'].includes(status);
}

export function triggerBlobDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
