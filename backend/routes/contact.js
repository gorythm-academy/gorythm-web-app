const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const ContactMessage = require('../models/ContactMessage');

// Helper: create transporter from settings
async function createTransporter() {
  // In a real app you might cache settings in DB; here we read from env
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    CONTACT_INBOX_EMAIL,
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('SMTP settings are not configured in environment variables');
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // true for 465, false for 587/25/etc.
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });

  const fromEmail = SMTP_FROM_EMAIL || SMTP_USER;
  const fromName = SMTP_FROM_NAME || 'Gorythm Academy';
  const inboxEmail = CONTACT_INBOX_EMAIL || fromEmail;

  return { transporter, fromEmail, fromName, inboxEmail };
}

// POST /api/contact  - receive contact form, save, and email admin
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, subject, message, consent } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and message are required',
      });
    }

    // Save to MongoDB so you can see all queries in admin later
    const contactMessage = await ContactMessage.create({
      name,
      email,
      phone,
      subject,
      message,
      consent: !!consent,
    });

    // Send notification email to your inbox
    let emailError = null;
    try {
      const { transporter, fromEmail, fromName, inboxEmail } = await createTransporter();

      const mailSubject =
        subject && subject.trim()
          ? `[Gorythm Contact] ${subject.trim()}`
          : '[Gorythm Contact] New enquiry';

      const textBody =
        `New contact enquiry from Gorythm website:\n\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        (phone ? `Phone: ${phone}\n` : '') +
        `Consent: ${consent ? 'Yes' : 'No'}\n\n` +
        `Message:\n${message}\n\n` +
        `Message ID: ${contactMessage._id}\n` +
        `Submitted at: ${contactMessage.createdAt.toISOString()}\n`;

      const htmlBody =
        `<p>New contact enquiry from <strong>Gorythm</strong> website.</p>` +
        `<ul>` +
        `<li><strong>Name:</strong> ${name}</li>` +
        `<li><strong>Email:</strong> ${email}</li>` +
        (phone ? `<li><strong>Phone:</strong> ${phone}</li>` : '') +
        `<li><strong>Consent:</strong> ${consent ? 'Yes' : 'No'}</li>` +
        `</ul>` +
        `<p><strong>Message:</strong></p>` +
        `<p>${message.replace(/\n/g, '<br/>')}</p>` +
        `<hr/>` +
        `<p>Message ID: ${contactMessage._id}</p>` +
        `<p>Submitted at: ${contactMessage.createdAt.toISOString()}</p>`;

      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: inboxEmail,
        replyTo: email,
        subject: mailSubject,
        text: textBody,
        html: htmlBody,
      });
    } catch (err) {
      console.error('Error sending contact email:', err.message);
      emailError = err.message;
    }

    return res.status(201).json({
      success: true,
      message: 'Message received successfully',
      contactId: contactMessage._id,
      emailSent: !emailError,
      emailError: emailError || undefined,
    });
  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to submit contact form',
    });
  }
});

module.exports = router;

