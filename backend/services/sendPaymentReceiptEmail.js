const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { buildPaymentInvoicePdf } = require('../utils/paymentInvoicePdf');
const { deliverableInbox } = require('../utils/studentPortalEmail');
const { escapeHtml } = require('../utils/escapeHtml');
const logger = require('../utils/logger');

function escapeReceiptHtml(value) {
    return escapeHtml(String(value || ''));
}

function adminNoticeRecipients() {
    const raw = process.env.PAYMENT_NOTIFY_EMAIL
        || process.env.DEFAULT_ADMIN_EMAIL
        || process.env.CONTACT_INBOX_EMAIL
        || '';
    return [...new Set(
        String(raw)
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item.includes('@') && !item.includes(' '))
    )];
}

function paymentSummary(payment) {
    const lines = Array.isArray(payment?.lines) ? payment.lines : [];
    if (!lines.length) {
        return `${payment?.studentName || 'Student'} — ${payment?.courseName || 'Course'}`;
    }
    return lines
        .map((line) => `${line.studentName || payment?.studentName || 'Student'} — ${line.courseName || payment?.courseName || 'Course'}`)
        .join('\n');
}

async function resolveReceiptRecipient(payment) {
    const direct = deliverableInbox(payment?.email) || deliverableInbox(payment?.payerEmail);
    if (direct) return direct;
    const embedded = deliverableInbox(payment?.user?.personalEmail) || deliverableInbox(payment?.user?.email);
    if (embedded) return embedded;
    const userId = payment?.user?._id || payment?.user || payment?.payerUser?._id || payment?.payerUser;
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) return '';
    const user = await User.findById(userId).select('personalEmail email').lean();
    return deliverableInbox(user?.personalEmail) || deliverableInbox(user?.email);
}

async function claimReceiptSend(paymentId) {
    const claimed = await Payment.findOneAndUpdate(
        {
            _id: paymentId,
            $or: [{ receiptSentAt: null }, { receiptSentAt: { $exists: false } }],
        },
        { $set: { receiptSentAt: new Date() } }
    );
    return Boolean(claimed);
}

async function claimAdminNotice(paymentId) {
    const claimed = await Payment.findOneAndUpdate(
        {
            _id: paymentId,
            $or: [{ adminNotifiedAt: null }, { adminNotifiedAt: { $exists: false } }],
        },
        { $set: { adminNotifiedAt: new Date() } }
    );
    return Boolean(claimed);
}

async function sendAdminPaymentNotice(payment) {
    if (!payment?._id) return { sent: false, reason: 'missing_payment' };
    const recipients = adminNoticeRecipients();
    if (!recipients.length) return { sent: false, reason: 'no_admin_email' };
    const {
        SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_FROM_NAME,
    } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
        return { sent: false, reason: 'smtp_unconfigured' };
    }

    const claimed = await claimAdminNotice(payment._id);
    if (!claimed) return { sent: false, reason: 'already_notified' };

    const amount = Number(payment.amount || 0).toFixed(2);
    const currency = payment.currency || 'USD';
    const method = String(payment.paymentMethod || 'payment').replace(/[_-]+/g, ' ');
    const text = [
        'A payment was marked paid.',
        '',
        `Amount: ${currency} ${amount}`,
        `Method: ${method}`,
        `Payer: ${payment.studentName || 'Unknown'} <${payment.email || 'no email'}>`,
        `Payment id: ${payment._id}`,
        '',
        paymentSummary(payment),
    ].join('\n');

    try {
        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        });
        const fromEmail = SMTP_FROM_EMAIL || SMTP_USER;
        const fromName = SMTP_FROM_NAME || 'Gorythm Academy';
        await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: recipients.join(', '),
            subject: `Payment Received — ${currency} ${amount}`,
            text,
        });
        return { sent: true };
    } catch (error) {
        await Payment.updateOne({ _id: payment._id }, { $set: { adminNotifiedAt: null } }).catch(() => {});
        logger.warn('Admin payment notice failed', { errorMessage: error.message, paymentId: String(payment._id) });
        return { sent: false, reason: error.message };
    }
}

async function sendPaymentReceiptEmail(payment, { force = false } = {}) {
    const adminNotice = force
        ? Promise.resolve({ sent: false, reason: 'skipped_force_resend' })
        : sendAdminPaymentNotice(payment).catch((error) => {
            logger.warn('Admin payment notice failed', { errorMessage: error.message });
            return { sent: false, reason: error.message };
        });
    let claimedSend = false;
    try {
        if (!payment) return { sent: false, reason: 'missing_payment' };
        const {
            SMTP_HOST,
            SMTP_PORT,
            SMTP_USER,
            SMTP_PASSWORD,
            SMTP_FROM_EMAIL,
            SMTP_FROM_NAME,
        } = process.env;
        if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
            return { sent: false, reason: 'smtp_unconfigured' };
        }
        const to = await resolveReceiptRecipient(payment);
        if (!to) return { sent: false, reason: 'missing_email' };
        if (force && payment._id) {
            await Payment.updateOne({ _id: payment._id }, { $set: { receiptSentAt: null } });
        }
        claimedSend = await claimReceiptSend(payment._id);
        if (!claimedSend) return { sent: false, reason: 'already_sent' };

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        });
        const fromEmail = SMTP_FROM_EMAIL || SMTP_USER;
        const fromName = SMTP_FROM_NAME || 'Gorythm Academy';
        const { loadPaidInvoiceHistory } = require('../utils/invoicePaymentHistory');
        const historyRows = await loadPaidInvoiceHistory(payment);
        const pdf = buildPaymentInvoicePdf(payment, { kind: 'receipt', historyRows });
        const amount = `${payment.currency || 'USD'} ${Number(payment.amount || 0).toFixed(2)}`;
        const course = payment.courseName || 'your course';
        const student = payment.studentName || 'there';
        const invoiceNo = payment.invoiceNumber || String(payment._id || '');
        const subject = `Gorythm Academy Fee Confirmation for ${course}`;
        const text = [
            `Assalamu alaikum ${student},`,
            '',
            'Thank you for studying with Gorythm Academy.',
            '',
            `We have recorded your fee for ${course}.`,
            `Amount: ${amount}`,
            invoiceNo ? `Reference: ${invoiceNo}` : '',
            '',
            'A PDF copy of this confirmation is attached for your records.',
            '',
            'If you have a question about this message, reply to this email or write to gorythm.academy@gmail.com.',
            '',
            'Gorythm Academy',
            'https://gorythmacademy.com',
        ].filter(Boolean).join('\n');
        const html = [
            `<p>Assalamu alaikum ${escapeReceiptHtml(student)},</p>`,
            '<p>Thank you for studying with Gorythm Academy.</p>',
            `<p>We have recorded your fee for <strong>${escapeReceiptHtml(course)}</strong>.</p>`,
            '<ul>',
            `<li><strong>Amount:</strong> ${escapeReceiptHtml(amount)}</li>`,
            invoiceNo ? `<li><strong>Reference:</strong> ${escapeReceiptHtml(invoiceNo)}</li>` : '',
            '</ul>',
            '<p>A PDF copy of this confirmation is attached for your records.</p>',
            '<p>If you have a question about this message, reply to this email or write to gorythm.academy@gmail.com.</p>',
            '<p>Gorythm Academy<br /><a href="https://gorythmacademy.com">gorythmacademy.com</a></p>',
        ].filter(Boolean).join('');
        await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            replyTo: fromEmail,
            subject,
            text,
            html,
            attachments: [
                {
                    filename: 'gorythm-academy-fee-confirmation.pdf',
                    content: pdf,
                    contentType: 'application/pdf',
                },
            ],
        });
        return { sent: true };
    } catch (error) {
        if (claimedSend && payment?._id) {
            await Payment.updateOne({ _id: payment._id }, { $set: { receiptSentAt: null } }).catch(() => {});
        }
        logger.warn('Payment receipt email failed', { errorMessage: error.message, paymentId: String(payment._id || '') });
        return { sent: false, reason: error.message };
    } finally {
        await adminNotice;
    }
}

module.exports = { sendPaymentReceiptEmail, adminNoticeRecipients, paymentSummary };
