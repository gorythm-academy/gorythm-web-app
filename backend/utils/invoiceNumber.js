const InvoiceSequence = require('../models/InvoiceSequence');
const { getOrCreateSettings } = require('../services/settingsService');

function sanitizeInvoicePrefix(raw) {
    const cleaned = String(raw || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 12);
    if (cleaned === 'GORYTHM') return 'GA';
    return cleaned || 'GA';
}

function karachiYear(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
    }).formatToParts(date);
    return parts.find((part) => part.type === 'year')?.value || String(date.getUTCFullYear());
}

function formatInvoiceNumber(prefix, year, seq) {
    return `${sanitizeInvoicePrefix(prefix)}-${year}-${String(seq).padStart(6, '0')}`;
}

async function nextInvoiceNumbers(count = 1) {
    const n = Math.max(1, Number(count) || 1);
    const settings = await getOrCreateSettings();
    const prefix = sanitizeInvoicePrefix(settings?.payment?.invoicePrefix);
    const year = karachiYear();
    const key = `${prefix}-${year}`;
    const doc = await InvoiceSequence.findOneAndUpdate(
        { key },
        { $inc: { seq: n } },
        { new: true, upsert: true }
    );
    const end = Number(doc.seq) || n;
    const start = end - n + 1;
    return Array.from({ length: n }, (_, index) => formatInvoiceNumber(prefix, year, start + index));
}

async function nextInvoiceNumber() {
    const [value] = await nextInvoiceNumbers(1);
    return value;
}

async function ensureInvoiceNumber(payment) {
    if (!payment) return '';
    if (payment.invoiceNumber) return payment.invoiceNumber;
    if (typeof payment.save !== 'function' || !payment._id) return '';
    payment.invoiceNumber = await nextInvoiceNumber();
    await payment.save();
    return payment.invoiceNumber;
}

module.exports = {
    sanitizeInvoicePrefix,
    karachiYear,
    formatInvoiceNumber,
    nextInvoiceNumber,
    nextInvoiceNumbers,
    ensureInvoiceNumber,
};
