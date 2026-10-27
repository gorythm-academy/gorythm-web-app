const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { buildPaymentInvoicePdf } = require('../utils/paymentInvoicePdf');
const { activePaymentFilter } = require('../utils/paymentQuery');
const { deliverableInbox } = require('../utils/studentPortalEmail');
const { activeUserFilter } = require('../utils/userQuery');
const { escapeHtml } = require('../utils/escapeHtml');
const logger = require('../utils/logger');

function escapeReceiptHtml(value) {
    return escapeHtml(String(value || ''));
}

function paymentRefId(value) {
    if (!value) return '';
    if (typeof value === 'object') return String(value._id || value.id || '');
    return String(value);
}

function pdfFileSafe(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48) || 'course';
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

function loginNoticeHtml(text) {
    return String(text || '')
        .split('\n')
        .map((line) => {
            if (!line) return '<br />';
            const safe = escapeReceiptHtml(line);
            const linked = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
            return `<p>${linked}</p>`;
        })
        .join('');
}

function normalizeFeeItems({ course, amount, invoiceNo, fees }) {
    if (Array.isArray(fees) && fees.length) {
        return fees.map((fee) => ({
            course: fee.course || 'your course',
            amount: fee.amount || '',
            invoiceNo: fee.invoiceNo || '',
        }));
    }
    return [{
        course: course || 'your course',
        amount: amount || '',
        invoiceNo: invoiceNo || '',
    }];
}

function feeLines(input) {
    const items = normalizeFeeItems(input);
    const lines = [];
    items.forEach((fee, index) => {
        if (index) lines.push('');
        lines.push(`We have recorded your fee for ${fee.course}.`);
        lines.push('');
        lines.push(`Amount: ${fee.amount}`);
        if (fee.invoiceNo) lines.push(`Reference: ${fee.invoiceNo}`);
    });
    return lines;
}

function receiptClosingLines(attachmentCount = 1) {
    const pdfLine = attachmentCount > 1
        ? 'PDF copies of these confirmations are attached for your records.'
        : 'A PDF copy of this confirmation is attached for your records.';
    return [
        pdfLine,
        '',
        'If you have a question about this message, reply to this email or write to gorythm.academy@gmail.com.',
        '',
        'Gorythm Academy',
        'https://gorythmacademy.com',
    ];
}

function parentReceiptText({ course, amount, invoiceNo, fees, loginText, attachmentCount }) {
    const items = normalizeFeeItems({ course, amount, invoiceNo, fees });
    const lines = ['Asalam-o-Alikum,', '', ...feeLines({ fees: items })];
    if (loginText) lines.push('', loginText);
    lines.push('', ...receiptClosingLines(attachmentCount || items.length));
    return lines.join('\n');
}

function studentReceiptText({ studentName, course, amount, invoiceNo, fees, loginText, attachmentCount }) {
    const items = normalizeFeeItems({ course, amount, invoiceNo, fees });
    const lines = [`Assalamu alaikum ${studentName},`, ''];
    if (loginText) lines.push(loginText, '');
    lines.push(...feeLines({ fees: items }), '', ...receiptClosingLines(attachmentCount || items.length));
    return lines.join('\n');
}

function feeHtml(input) {
    const items = normalizeFeeItems(input);
    return items.map((fee) => [
        `<p>We have recorded your fee for <strong>${escapeReceiptHtml(fee.course)}</strong>.</p>`,
        '<ul>',
        `<li><strong>Amount:</strong> ${escapeReceiptHtml(fee.amount)}</li>`,
        fee.invoiceNo ? `<li><strong>Reference:</strong> ${escapeReceiptHtml(fee.invoiceNo)}</li>` : '',
        '</ul>',
    ].filter(Boolean).join('')).join('');
}

function receiptClosingHtml(attachmentCount = 1) {
    const pdfLine = attachmentCount > 1
        ? '<p>PDF copies of these confirmations are attached for your records.</p>'
        : '<p>A PDF copy of this confirmation is attached for your records.</p>';
    return [
        pdfLine,
        '<p>If you have a question about this message, reply to this email or write to gorythm.academy@gmail.com.</p>',
        '<p>Gorythm Academy<br /><a href="https://gorythmacademy.com">gorythmacademy.com</a></p>',
    ].join('');
}

function parentReceiptHtml({ course, amount, invoiceNo, fees, loginText, attachmentCount }) {
    const items = normalizeFeeItems({ course, amount, invoiceNo, fees });
    return [
        '<p>Asalam-o-Alikum,</p>',
        feeHtml({ fees: items }),
        loginText ? loginNoticeHtml(loginText) : '',
        receiptClosingHtml(attachmentCount || items.length),
    ].filter(Boolean).join('');
}

function studentReceiptHtml({ studentName, course, amount, invoiceNo, fees, loginText, attachmentCount }) {
    const items = normalizeFeeItems({ course, amount, invoiceNo, fees });
    return [
        `<p>Assalamu alaikum ${escapeReceiptHtml(studentName)},</p>`,
        loginText ? loginNoticeHtml(loginText) : '',
        feeHtml({ fees: items }),
        receiptClosingHtml(attachmentCount || items.length),
    ].filter(Boolean).join('');
}

function receiptSubject(fees) {
    const items = normalizeFeeItems({ fees });
    if (items.length <= 1) {
        return `Gorythm Academy Fee Confirmation for ${items[0]?.course || 'your course'}`;
    }
    return `Gorythm Academy Fee Confirmation (${items.length} invoices)`;
}

async function studentGreetingName(payment) {
    if (payment?.user?.name) return String(payment.user.name).trim();
    const userId = payment?.user?._id || payment?.user;
    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
        const user = await User.findById(userId).select('name').lean();
        if (user?.name) return String(user.name).trim();
    }
    return String(payment?.studentName || 'there').trim() || 'there';
}

async function resolveReceiptRecipient(payment) {
    const studentInbox = deliverableInbox(payment?.email);
    const parentInbox = deliverableInbox(payment?.parentEmail);
    if (parentInbox && parentInbox !== studentInbox) return parentInbox;
    const direct = studentInbox || deliverableInbox(payment?.payerEmail);
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

async function claimReceiptSendGroup(paymentIds, { force = false } = {}) {
    const ids = [...new Set((paymentIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return { claimed: false, claimedIds: [] };
    if (force) {
        await Payment.updateMany(
            { _id: { $in: ids } },
            { $set: { receiptSentAt: null } }
        );
    }
    const claimedIds = [];
    for (const id of ids) {
        const claimed = await claimReceiptSend(id);
        if (claimed) claimedIds.push(id);
    }
    if (!claimedIds.length) return { claimed: false, claimedIds: [] };
    if (claimedIds.length !== ids.length) {
        await Payment.updateMany(
            { _id: { $in: claimedIds } },
            { $set: { receiptSentAt: null } }
        ).catch(() => {});
        return { claimed: false, claimedIds: [] };
    }
    return { claimed: true, claimedIds };
}

async function clearReceiptClaims(paymentIds) {
    const ids = [...new Set((paymentIds || []).map((id) => String(id)).filter(Boolean))];
    if (!ids.length) return;
    await Payment.updateMany(
        { _id: { $in: ids } },
        { $set: { receiptSentAt: null } }
    ).catch(() => {});
}

function uniquePayments(list) {
    const seen = new Set();
    const rows = [];
    for (const payment of list || []) {
        const id = paymentRefId(payment);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        rows.push(payment);
    }
    return rows;
}

function receiptGroupKey(payment) {
    if (payment?.groupId) return `group:${payment.groupId}`;
    if (payment?.stripePaymentIntentId) return `pi:${payment.stripePaymentIntentId}`;
    return `id:${paymentRefId(payment)}`;
}

function isReceiptEligiblePayment(payment) {
    const status = String(payment?.status || '').toLowerCase();
    return status === 'paid' || status === 'completed';
}

async function loadReceiptPaymentGroup(payment) {
    if (!payment) return [];
    let group = [];
    if (payment.groupId) {
        group = await Payment.find({
            groupId: payment.groupId,
            ...activePaymentFilter(),
        }).sort({ createdAt: 1, _id: 1 });
    } else if (payment.stripePaymentIntentId && payment.invoiceMode === 'separate') {
        group = await Payment.find({
            stripePaymentIntentId: payment.stripePaymentIntentId,
            ...activePaymentFilter(),
        }).sort({ createdAt: 1, _id: 1 });
    }
    const paid = (group.length ? group : [payment]).filter(isReceiptEligiblePayment);
    return paid.length ? paid : [payment];
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

async function buildReceiptPdfAttachment(payment) {
    const { loadPaidInvoiceHistory } = require('../utils/invoicePaymentHistory');
    const historyRows = await loadPaidInvoiceHistory(payment);
    const pdf = buildPaymentInvoicePdf(payment, { kind: 'receipt', historyRows });
    const course = payment.courseName || payment.course?.title || 'course';
    const invoiceNo = payment.invoiceNumber || String(payment._id || '');
    const filename = payment.invoiceMode === 'separate' || invoiceNo
        ? `gorythm-academy-fee-confirmation-${pdfFileSafe(course)}-${pdfFileSafe(invoiceNo)}.pdf`
        : 'gorythm-academy-fee-confirmation.pdf';
    return {
        filename,
        content: pdf,
        contentType: 'application/pdf',
        fee: {
            course: course || 'your course',
            amount: `${payment.currency || 'USD'} ${Number(payment.amount || 0).toFixed(2)}`,
            invoiceNo,
        },
    };
}

async function sendPaymentReceiptEmail(payment, { force = false, payments = null } = {}) {
    const group = uniquePayments(
        Array.isArray(payments) && payments.length
            ? payments
            : await loadReceiptPaymentGroup(payment)
    );
    const primary = group[0] || payment;
    const adminNotice = force
        ? Promise.resolve({ sent: false, reason: 'skipped_force_resend' })
        : sendAdminPaymentNotice(primary).catch((error) => {
            logger.warn('Admin payment notice failed', { errorMessage: error.message });
            return { sent: false, reason: error.message };
        });
    let claimedIds = [];
    try {
        if (!primary) return { sent: false, reason: 'missing_payment' };
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
        const to = await resolveReceiptRecipient(primary);
        if (!to) return { sent: false, reason: 'missing_email' };
        const studentInbox = deliverableInbox(primary?.email);
        const parentInbox = deliverableInbox(primary?.parentEmail);
        const invoiceToParent = Boolean(parentInbox && parentInbox !== studentInbox && to === parentInbox);
        const studentId = primary?.user?._id || primary?.user || null;
        let parentAttachment = null;
        let studentAttachment = null;
        const { prepareLoginAttachment, commitLoginAttachment } = require('./loginCardEmail');
        if (studentId) studentAttachment = await prepareLoginAttachment(studentId);
        if (invoiceToParent) {
            const parent = await User.findOne({
                email: parentInbox,
                role: 'parent',
                ...activeUserFilter(),
            }).select('_id');
            if (parent) parentAttachment = await prepareLoginAttachment(parent._id, { includeChildren: false });
        }
        const claim = await claimReceiptSendGroup(group.map((row) => row._id), { force });
        if (!claim.claimed) return { sent: false, reason: 'already_sent' };
        claimedIds = claim.claimedIds;

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: Number(SMTP_PORT) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
        });
        const fromEmail = SMTP_FROM_EMAIL || SMTP_USER;
        const fromName = SMTP_FROM_NAME || 'Gorythm Academy';
        const pdfAttachments = [];
        const fees = [];
        for (const row of group) {
            const built = await buildReceiptPdfAttachment(row);
            fees.push(built.fee);
            pdfAttachments.push({
                filename: built.filename,
                content: built.content,
                contentType: built.contentType,
            });
        }
        // Keep a stable name for the common single-invoice case.
        if (pdfAttachments.length === 1) {
            pdfAttachments[0].filename = 'gorythm-academy-fee-confirmation.pdf';
        }
        const studentName = await studentGreetingName(primary);
        const subject = receiptSubject(fees);
        const studentMail = {
            from: `"${fromName}" <${fromEmail}>`,
            to: studentInbox || to,
            replyTo: fromEmail,
            subject,
            text: studentReceiptText({
                studentName,
                fees,
                loginText: studentAttachment?.readyText || '',
                attachmentCount: pdfAttachments.length,
            }),
            html: studentReceiptHtml({
                studentName,
                fees,
                loginText: studentAttachment?.readyText || '',
                attachmentCount: pdfAttachments.length,
            }),
            attachments: pdfAttachments,
        };
        if (invoiceToParent) {
            await transporter.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to,
                replyTo: fromEmail,
                subject,
                text: parentReceiptText({
                    fees,
                    loginText: parentAttachment?.readyText || '',
                    attachmentCount: pdfAttachments.length,
                }),
                html: parentReceiptHtml({
                    fees,
                    loginText: parentAttachment?.readyText || '',
                    attachmentCount: pdfAttachments.length,
                }),
                attachments: pdfAttachments,
            });
            if (parentAttachment) await commitLoginAttachment(parentAttachment);
            if (studentInbox) {
                try {
                    await transporter.sendMail(studentMail);
                    if (studentAttachment) await commitLoginAttachment(studentAttachment);
                } catch (error) {
                    logger.warn('Student fee email failed', {
                        errorMessage: error.message,
                        paymentId: String(primary._id || ''),
                    });
                }
            }
        } else {
            await transporter.sendMail(studentMail);
            if (studentAttachment) await commitLoginAttachment(studentAttachment);
        }
        return { sent: true, paymentIds: claimedIds };
    } catch (error) {
        if (claimedIds.length) await clearReceiptClaims(claimedIds);
        logger.warn('Payment receipt email failed', {
            errorMessage: error.message,
            paymentId: String(primary?._id || payment?._id || ''),
        });
        return { sent: false, reason: error.message };
    } finally {
        await adminNotice;
    }
}

async function sendPaymentReceiptEmails(payments, { force = false } = {}) {
    const rows = uniquePayments(payments);
    if (!rows.length) return { sent: 0, groups: 0 };
    const buckets = new Map();
    for (const payment of rows) {
        const key = receiptGroupKey(payment);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(payment);
    }
    let sent = 0;
    for (const group of buckets.values()) {
        const loaded = group.length > 1
            ? group
            : await loadReceiptPaymentGroup(group[0]);
        const result = await sendPaymentReceiptEmail(group[0], {
            force,
            payments: uniquePayments(loaded.length > group.length ? loaded : group),
        });
        if (result.sent) sent += 1;
    }
    return { sent, groups: buckets.size };
}

module.exports = {
    sendPaymentReceiptEmail,
    sendPaymentReceiptEmails,
    loadReceiptPaymentGroup,
    adminNoticeRecipients,
    paymentSummary,
    parentReceiptText,
    studentReceiptText,
    receiptSubject,
};
