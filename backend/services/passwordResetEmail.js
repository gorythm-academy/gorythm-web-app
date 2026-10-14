const nodemailer = require('nodemailer');
const { escapeHtml } = require('../utils/escapeHtml');
const logger = require('../utils/logger');
const { deliveryAddress, resetUrl } = require('./passwordReset');

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

async function sendPasswordResetEmail(user, token) {
    const to = deliveryAddress(user);
    const username = String(user?.email || '').trim().toLowerCase();
    if (!to || !username || !token) return { sent: false, reason: 'missing_recipient' };

    const transporter = createTransporter();
    if (!transporter) return { sent: false, reason: 'smtp_unconfigured' };

    const link = resetUrl(token);
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const fromName = process.env.SMTP_FROM_NAME || 'Gorythm Academy';
    const text = [
        'Assalamu alaikum,',
        '',
        'A password reset was requested for the Gorythm Academy portal.',
        '',
        `Sign in with this username: ${username}`,
        '',
        'This link works once and expires in 30 minutes:',
        link,
        '',
        'If you did not ask for this, ignore this email. Your password will stay the same.',
        '',
        'Gorythm Academy',
    ].join('\n');

    try {
        await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject: 'Reset Your Gorythm Academy Portal Password',
            text,
            html: `<p>Assalamu alaikum,</p>
<p>A password reset was requested for the Gorythm Academy portal.</p>
<p>Sign in with this username:<br /><strong>${escapeHtml(username)}</strong></p>
<p><a href="${escapeHtml(link)}">Set a new password</a></p>
<p>This link works once and expires in 30 minutes. If you did not ask for this, ignore this email. Your password will stay the same.</p>`,
        });
        return { sent: true };
    } catch (error) {
        logger.warn('Password reset email failed', { errorMessage: error.message });
        return { sent: false, reason: 'send_failed' };
    }
}

module.exports = { sendPasswordResetEmail };
