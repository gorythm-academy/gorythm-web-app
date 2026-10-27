const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const TrialRequest = require('../models/TrialRequest');
const Course = require('../models/Course');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const { validate, rules } = require('../middleware/validate');
const { publicWriteRateLimiter } = require('../middleware/publicWriteRateLimit');
const { escapeHtml } = require('../utils/escapeHtml');
const { normalizeWhatsAppNumber } = require('../utils/phoneE164');
const { OFFICIAL_EMAIL, officialEmail } = require('../utils/officialEmail');
const { activeCourseFilter } = require('../utils/courseQuery');

const router = express.Router();
const adminOnly = [authMiddleware, validateSessionUser, allowRoles('super-admin', 'manager')];
const LIST_LIMIT = 500;
const REPLY_MAX = 5000;
const NOT_SURE = 'Not sure yet';

const activeTrialFilter = () => ({
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const quarantinedTrialFilter = () => ({
  deletedAt: { $exists: true, $ne: null },
});

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ''));
}

function boundedText(value, max) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) return '';
  return text;
}

async function createTransporter() {
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
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });

  return {
    transporter,
    fromEmail: officialEmail(SMTP_FROM_EMAIL || SMTP_USER || OFFICIAL_EMAIL),
    fromName: SMTP_FROM_NAME || 'Gorythm Academy',
    inboxEmail: officialEmail(CONTACT_INBOX_EMAIL || OFFICIAL_EMAIL),
  };
}

async function resolveCourse(body) {
  const rawSlug = boundedText(body?.courseSlug, 160);
  const rawTitle = boundedText(body?.courseTitle, 160);
  if (rawSlug && rawSlug !== 'not-sure') {
    const course = await Course.findOne({
      slug: rawSlug,
      isPublished: true,
      ...activeCourseFilter(),
    })
      .select('title slug')
      .lean();
    if (course?.title) {
      return { courseTitle: String(course.title).trim(), courseSlug: course.slug || rawSlug };
    }
  }
  if (rawTitle === NOT_SURE || rawSlug === 'not-sure') {
    return { courseTitle: NOT_SURE, courseSlug: '' };
  }
  if (rawTitle) return { courseTitle: rawTitle, courseSlug: '' };
  return null;
}

router.post(
  '/',
  publicWriteRateLimiter,
  validate([
    rules.requiredString('name', 'Name'),
    rules.requiredString('email', 'Email'),
    rules.email('email', 'Email'),
    rules.requiredString('courseTitle', 'Course'),
  ]),
  async (req, res) => {
    try {
      const name = boundedText(req.body?.name, 120);
      const email = boundedText(req.body?.email, 254).toLowerCase();
      const preferredTime = String(req.body?.preferredTime ?? '').trim();
      if (!name || !email) {
        return res.status(400).json({
          success: false,
          error: 'Name, email, and course must stay within the allowed length.',
        });
      }
      if (preferredTime.length > 200) {
        return res.status(400).json({
          success: false,
          error: 'Preferred time must be 200 characters or fewer.',
        });
      }
      if (req.body?.consent !== true) {
        return res.status(400).json({
          success: false,
          error: 'Please agree that your data is collected before submitting.',
        });
      }

      const phoneResult = normalizeWhatsAppNumber(req.body?.phone, { required: true });
      if (!phoneResult.ok) {
        return res.status(400).json({ success: false, error: phoneResult.error });
      }

      const course = await resolveCourse(req.body);
      if (!course) {
        return res.status(400).json({ success: false, error: 'Please choose a course.' });
      }

      const trial = await TrialRequest.create({
        name,
        email,
        phone: phoneResult.e164,
        courseTitle: course.courseTitle,
        courseSlug: course.courseSlug,
        preferredTime,
        consent: true,
      });

      let emailError = null;
      try {
        const { transporter, fromEmail, fromName, inboxEmail } = await createTransporter();
        const safeName = escapeHtml(name);
        const safeEmail = escapeHtml(email);
        const safePhone = escapeHtml(phoneResult.e164);
        const safeCourse = escapeHtml(course.courseTitle);
        const safeTime = escapeHtml(preferredTime);
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: inboxEmail,
          replyTo: email,
          subject: `[Gorythm Trial] ${course.courseTitle}`,
          text:
            `New free trial request from the Gorythm Academy website.\n\n` +
            `Name: ${name}\n` +
            `Email: ${email}\n` +
            `WhatsApp: ${phoneResult.e164}\n` +
            `Course: ${course.courseTitle}\n` +
            (preferredTime ? `Preferred time: ${preferredTime}\n` : '') +
            `\n` +
            `This request does not create an account or send a class link.\n` +
            `Request ID: ${trial._id}\n` +
            `Submitted at: ${trial.createdAt.toISOString()}\n`,
          html:
            `<p>New free trial request from <strong>Gorythm Academy</strong>.</p>` +
            `<ul>` +
            `<li><strong>Name:</strong> ${safeName}</li>` +
            `<li><strong>Email:</strong> ${safeEmail}</li>` +
            `<li><strong>WhatsApp:</strong> ${safePhone}</li>` +
            `<li><strong>Course:</strong> ${safeCourse}</li>` +
            (preferredTime ? `<li><strong>Preferred time:</strong> ${safeTime}</li>` : '') +
            `</ul>` +
            `<p>This request does not create an account or send a class link. Contact them yourself.</p>` +
            `<p>Request ID: ${trial._id}<br/>Submitted at: ${trial.createdAt.toISOString()}</p>`,
        });
      } catch (err) {
        req.log?.error?.('trial notification email', { err });
        emailError = err.message;
      }

      return res.status(201).json({
        success: true,
        message: 'Trial request received',
        trialId: trial._id,
        emailSent: !emailError,
      });
    } catch (error) {
      req.log?.error?.('trial request', { err: error });
      return res.status(500).json({ success: false, error: 'Failed to save the trial request' });
    }
  }
);

router.get('/admin/unseen-count', ...adminOnly, async (req, res) => {
  try {
    const count = await TrialRequest.countDocuments({ status: 'new', ...activeTrialFilter() });
    return res.json({ success: true, count });
  } catch (error) {
    req.log?.error?.('trial unseen count', { err: error });
    return res.status(500).json({ success: false, error: 'Failed to load trial badge', count: 0 });
  }
});

router.get('/admin/requests', ...adminOnly, async (req, res) => {
  try {
    const quarantine = req.query.trash === 'true' || req.query.trash === '1';
    const filter = quarantine ? quarantinedTrialFilter() : activeTrialFilter();
    const sort = quarantine ? { deletedAt: -1 } : { createdAt: -1 };
    const activeFilter = activeTrialFilter();

    const [requests, totalCount, quarantineCount, newCount, contactedCount, activeTotal] = await Promise.all([
      TrialRequest.find(filter).sort(sort).limit(LIST_LIMIT).lean(),
      TrialRequest.countDocuments(filter),
      TrialRequest.countDocuments(quarantinedTrialFilter()),
      TrialRequest.countDocuments({ ...activeFilter, status: 'new' }),
      TrialRequest.countDocuments({ ...activeFilter, status: 'contacted' }),
      TrialRequest.countDocuments(activeFilter),
    ]);
    return res.json({
      success: true,
      requests,
      totalCount,
      trashCount: quarantineCount,
      listLimit: LIST_LIMIT,
      truncated: totalCount > LIST_LIMIT,
      statusCounts: {
        new: newCount,
        contacted: contactedCount,
        total: activeTotal,
      },
    });
  } catch (error) {
    req.log?.error?.('trial list', { err: error });
    return res.status(500).json({ success: false, error: 'Failed to load trial requests' });
  }
});

router.patch('/admin/requests/:id/status', ...adminOnly, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, error: 'Trial request not found' });
    }
    const status = req.body?.status;
    if (!['new', 'contacted'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Allowed: new, contacted' });
    }
    const updated = await TrialRequest.findOneAndUpdate(
      { _id: id, ...activeTrialFilter() },
      { status },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Trial request not found' });
    }
    return res.json({ success: true, request: updated });
  } catch (error) {
    req.log?.error?.('trial status', { err: error });
    return res.status(500).json({ success: false, error: 'Failed to update trial request' });
  }
});

router.post(
  '/admin/requests/:id/reply',
  ...adminOnly,
  validate([rules.requiredString('message', 'Reply')]),
  async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, error: 'Trial request not found' });
      }
      const reply = String(req.body?.message || '').trim();
      if (reply.length > REPLY_MAX) {
        return res.status(400).json({
          success: false,
          error: `Reply must be ${REPLY_MAX} characters or fewer`,
        });
      }

      const trial = await TrialRequest.findOne({ _id: id, ...activeTrialFilter() });
      if (!trial) {
        return res.status(404).json({ success: false, error: 'Trial request not found' });
      }
      const toEmail = String(trial.email || '').trim();
      if (!toEmail) {
        return res.status(400).json({ success: false, error: 'This request has no email address to reply to' });
      }

      const safeReply = escapeHtml(reply);
      const safeName = escapeHtml(trial.name || 'there');
      const safeCourse = escapeHtml(trial.courseTitle || '');
      const safeTime = escapeHtml(trial.preferredTime || '');

      try {
        const { transporter, fromEmail, fromName } = await createTransporter();
        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: toEmail,
          replyTo: fromEmail,
          subject: 'Your free trial request — Gorythm Academy',
          text:
            `Hello ${trial.name || 'there'},\n\n` +
            `${reply}\n\n` +
            `---\nYour trial request:\n` +
            `Course: ${trial.courseTitle || ''}\n` +
            (trial.preferredTime ? `Preferred time: ${trial.preferredTime}\n` : ''),
          html:
            `<p>Hello ${safeName},</p>` +
            `<p>${safeReply.replace(/\n/g, '<br/>')}</p>` +
            `<hr/>` +
            `<p style="color:#64748b;font-size:13px"><strong>Your trial request</strong><br/>` +
            `Course: ${safeCourse}` +
            (safeTime ? `<br/>Preferred time: ${safeTime}` : '') +
            `</p>`,
        });
      } catch (err) {
        req.log?.error?.('trial reply email', { err });
        return res.status(503).json({
          success: false,
          error: 'Could not send the reply email. Check the mail settings and try again.',
        });
      }

      trial.reply = reply;
      trial.repliedAt = new Date();
      if (trial.status !== 'contacted') trial.status = 'contacted';
      await trial.save();
      return res.json({ success: true, request: trial });
    } catch (error) {
      req.log?.error?.('trial reply', { err: error });
      return res.status(500).json({ success: false, error: 'Failed to send reply' });
    }
  }
);

router.delete('/admin/requests/:id', ...adminOnly, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!validObjectId(id)) {
      return res.status(404).json({ success: false, error: 'Trial request not found' });
    }
    const updated = await TrialRequest.findOneAndUpdate(
      { _id: id, ...activeTrialFilter() },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Trial request not found or already quarantined' });
    }
    return res.json({ success: true, request: updated });
  } catch (error) {
    req.log?.error?.('trial quarantine', { err: error });
    return res.status(500).json({ success: false, error: 'Failed to quarantine trial request' });
  }
});

router.post('/admin/requests/:id/restore', ...adminOnly, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!validObjectId(id)) {
      return res.status(404).json({ success: false, error: 'Trial request not found' });
    }
    const updated = await TrialRequest.findOneAndUpdate(
      { _id: id, ...quarantinedTrialFilter() },
      { $set: { deletedAt: null } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Quarantined trial request not found' });
    }
    return res.json({ success: true, request: updated });
  } catch (error) {
    req.log?.error?.('trial restore', { err: error });
    return res.status(500).json({ success: false, error: 'Failed to restore trial request' });
  }
});

router.delete('/admin/requests/:id/permanent', ...adminOnly, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!validObjectId(id)) {
      return res.status(404).json({ success: false, error: 'Trial request not found' });
    }
    const removed = await TrialRequest.findOneAndDelete({
      _id: id,
      ...quarantinedTrialFilter(),
    });
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Quarantined trial request not found' });
    }
    return res.json({ success: true });
  } catch (error) {
    req.log?.error?.('trial permanent delete', { err: error });
    return res.status(500).json({ success: false, error: 'Failed to permanently delete trial request' });
  }
});

module.exports = router;
