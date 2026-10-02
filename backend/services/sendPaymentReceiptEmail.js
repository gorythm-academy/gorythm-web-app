const nodemailer = require('nodemailer');
const { buildPaymentInvoicePdf } = require('../utils/paymentInvoicePdf');
const logger = require('../utils/logger');

async function sendPaymentReceiptEmail(payment) {
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
    const to = String(payment.email || payment.payerEmail || '').trim();
    if (!to) return { sent: false, reason: 'missing_email' };

    try {
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
        const txnId = payment.transactionId || payment._id;
        await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject: `Payment receipt — ${payment.courseName || 'Gorythm'}`,
            text: `Thank you. We received your payment of ${payment.currency || 'USD'} ${Number(payment.amount || 0).toFixed(2)}. Your receipt is attached.`,
            attachments: [
                {
                    filename: `receipt_${String(txnId).replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`,
                    content: pdf,
                    contentType: 'application/pdf',
                },
            ],
        });
        return { sent: true };
    } catch (error) {
        logger.warn('Payment receipt email failed', { errorMessage: error.message, paymentId: String(payment._id || '') });
        return { sent: false, reason: error.message };
    }
}

module.exports = { sendPaymentReceiptEmail };
