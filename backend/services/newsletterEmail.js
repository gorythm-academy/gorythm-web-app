const nodemailer = require('nodemailer');
const Subscriber = require('../models/Subscriber');
const { escapeHtml } = require('../utils/escapeHtml');
const { OFFICIAL_EMAIL, officialEmail } = require('../utils/officialEmail');
const {
    createUnsubscribeToken,
    ensureUnsubscribeToken,
    unsubscribeUrlForToken,
} = require('../utils/unsubscribeToken');

const SEND_LIMIT = 200;

function createTransporter() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
        throw new Error('Email is not configured. Set SMTP settings first.');
    }
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
}

function fromAddress() {
    const fromEmail = officialEmail(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER);
    const fromName = process.env.SMTP_FROM_NAME || 'Gorythm Academy';
    return `"${fromName}" <${fromEmail}>`;
}

function isSubscribed(doc) {
    return !doc.unsubscribedAt;
}

async function sendNewsletter({ subject, body }) {
    const title = String(subject || '').trim();
    const textBody = String(body || '').trim();
    if (!title) {
        const error = new Error('Subject is required');
        error.statusCode = 400;
        throw error;
    }
    if (!textBody) {
        const error = new Error('Message is required');
        error.statusCode = 400;
        throw error;
    }

    const recipients = await Subscriber.find({
        $or: [{ unsubscribedAt: null }, { unsubscribedAt: { $exists: false } }],
    })
        .sort({ createdAt: -1 })
        .limit(SEND_LIMIT);

    if (!recipients.length) {
        return { sent: 0, failed: 0, skippedUnsubscribed: true };
    }

    const transporter = createTransporter();
    const from = fromAddress();
    let sent = 0;
    let failed = 0;

    for (const subscriber of recipients) {
        if (!isSubscribed(subscriber)) continue;
        if (!subscriber.unsubscribeToken) {
            subscriber.unsubscribeToken = createUnsubscribeToken();
            await subscriber.save();
        }
        const unsubUrl = unsubscribeUrlForToken(await ensureUnsubscribeToken(subscriber));
        const html = `<p>${escapeHtml(textBody).replace(/\n/g, '<br />')}</p>
<p style="margin-top:24px;font-size:12px;color:#666">
You received this because you subscribed to Gorythm Academy updates.
<a href="${unsubUrl}">Unsubscribe</a>
</p>`;
        try {
            await transporter.sendMail({
                from,
                to: subscriber.email,
                replyTo: OFFICIAL_EMAIL,
                subject: title,
                text: `${textBody}\n\nUnsubscribe: ${unsubUrl}`,
                html,
                headers: {
                    'List-Unsubscribe': `<${unsubUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
            });
            sent += 1;
        } catch {
            failed += 1;
        }
    }

    return { sent, failed, attempted: recipients.length };
}

module.exports = { sendNewsletter, SEND_LIMIT, OFFICIAL_EMAIL };
