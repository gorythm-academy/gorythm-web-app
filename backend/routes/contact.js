const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const ContactMessage = require('../models/ContactMessage');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validate, rules } = require('../middleware/validate');

const activeMessageFilter = () => ({
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedMessageFilter = () => ({
  deletedAt: { $exists: true, $ne: null },
});

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
router.post(
  '/',
  validate([
    rules.requiredString('name', 'Name'),
    rules.requiredString('email', 'Email'),
    rules.email('email', 'Email'),
    rules.requiredString('message', 'Message'),
  ]),
  async (req, res) => {
  try {
    const { name, email, phone, subject, message, consent } = req.body || {};

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and message are required',
      });
    }

    const phoneStr = phone != null && String(phone).trim() !== '' ? String(phone).trim() : '';
    if (phoneStr) {
      const digitsOnly = /^\d{7,15}$/;
      if (!digitsOnly.test(phoneStr)) {
        return res.status(400).json({
          success: false,
          error: 'WhatsApp number must be 7–15 digits (country code, numbers only).',
        });
      }
    }

    // Save to MongoDB so you can see all queries in admin later
    const contactMessage = await ContactMessage.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phoneStr,
      subject: subject ? String(subject).trim() : '',
      message: String(message).trim(),
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
        (phoneStr ? `Whatsapp Number: ${phoneStr}\n` : '') +
        `Consent: ${consent ? 'Yes' : 'No'}\n\n` +
        `Message:\n${message}\n\n` +
        `Message ID: ${contactMessage._id}\n` +
        `Submitted at: ${contactMessage.createdAt.toISOString()}\n`;

      const htmlBody =
        `<p>New contact enquiry from <strong>Gorythm</strong> website.</p>` +
        `<ul>` +
        `<li><strong>Name:</strong> ${name}</li>` +
        `<li><strong>Email:</strong> ${email}</li>` +
        (phoneStr ? `<li><strong>Whatsapp Number:</strong> ${phoneStr}</li>` : '') +
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
      req.log.error('Error sending contact email', { err });
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
    req.log.error('Contact form error', { err: error });
    return res.status(500).json({
      success: false,
      error: 'Failed to submit contact form',
    });
  }
});

// Admin endpoint: list contact messages (inbox) or deleted (trash=1)
router.get('/admin/messages', authMiddleware, allowRoles('super-admin', 'admin'), async (req, res) => {
  try {
    const trash = req.query.trash === 'true' || req.query.trash === '1';
    const filter = trash ? trashedMessageFilter() : activeMessageFilter();
    const sort = trash ? { deletedAt: -1 } : { createdAt: -1 };

    const [messages, trashCount] = await Promise.all([
      ContactMessage.find(filter).sort(sort).limit(500).lean(),
      ContactMessage.countDocuments(trashedMessageFilter()),
    ]);

    return res.json({ success: true, messages, trashCount });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch contact messages' });
  }
});

// Admin endpoint: update contact message status
router.patch('/admin/messages/:id/status', authMiddleware, allowRoles('super-admin', 'admin'), async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowedStatuses = ['new', 'in-progress', 'resolved'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Allowed: new, in-progress, resolved'
      });
    }

    const updated = await ContactMessage.findOneAndUpdate(
      { _id: req.params.id, ...activeMessageFilter() },
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Contact message not found or deleted' });
    }

    return res.json({ success: true, message: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to update message status' });
  }
});

// Admin endpoint: soft-delete a contact message
router.delete('/admin/messages/:id', authMiddleware, allowRoles('super-admin', 'admin'), async (req, res) => {
  try {
    const updated = await ContactMessage.findOneAndUpdate(
      { _id: req.params.id, ...activeMessageFilter() },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Contact message not found or already deleted' });
    }
    return res.json({ success: true, message: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete contact message' });
  }
});

// Admin endpoint: restore a soft-deleted message
router.post('/admin/messages/:id/restore', authMiddleware, allowRoles('super-admin', 'admin'), async (req, res) => {
  try {
    const updated = await ContactMessage.findOneAndUpdate(
      { _id: req.params.id, ...trashedMessageFilter() },
      { $set: { deletedAt: null } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Deleted message not found' });
    }
    return res.json({ success: true, message: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to restore contact message' });
  }
});

// Admin endpoint: permanently remove a message (must already be in trash)
router.delete(
  '/admin/messages/:id/permanent',
  authMiddleware,
  allowRoles('super-admin', 'admin'),
  async (req, res) => {
    try {
      const removed = await ContactMessage.findOneAndDelete({
        _id: req.params.id,
        ...trashedMessageFilter(),
      });
      if (!removed) {
        return res.status(404).json({ success: false, error: 'Deleted message not found' });
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Failed to permanently delete message' });
    }
  }
);

module.exports = router;

