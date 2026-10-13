const nodemailer = require('nodemailer');
const { escapeHtml } = require('../utils/escapeHtml');
const logger = require('../utils/logger');
const { confirmUrl } = require('./subscriberResubscribe');

function createTransporter() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) return null;
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
}

async function sendResubscribeEmail(email, token) {
    const to = String(email || '').trim().toLowerCase();
    if (!to || !token) return { sent: false, reason: 'missing_recipient' };
    const transporter = createTransporter();
    if (!transporter) return { sent: false, reason: 'smtp_unconfigured' };

    const link = confirmUrl(token);
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = process.env.SMTP_FROM_NAME || 'Gorythm Academy';
    const text = [
        'Someone asked to turn Gorythm Academy course updates back on for this email.',
        '',
        'Confirm here (the link expires in 48 hours):',
        link,
        '',
        'If you did not ask for this, ignore this email. You will stay unsubscribed.',
    ].join('\n');

    try {
        await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject: 'Confirm Gorythm Academy course updates',
            text,
            html: `<p>Someone asked to turn Gorythm Academy course updates back on for this email.</p>
<p><a href="${escapeHtml(link)}">Confirm course updates</a></p>
<p>This link expires in 48 hours. If you did not ask for this, ignore this email. You will stay unsubscribed.</p>`,
        });
        return { sent: true };
    } catch (error) {
        logger.warn('Resubscribe confirmation email failed', { errorMessage: error.message });
        return { sent: false, reason: 'send_failed' };
    }
}

module.exports = { sendResubscribeEmail };
