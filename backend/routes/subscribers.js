const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validate, rules } = require('../middleware/validate');

router.post(
  '/',
  validate([rules.requiredString('email', 'Email'), rules.email('email', 'Email')]),
  async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const source = String(req.body?.source || 'unknown').trim() || 'unknown';

      const subscriber = await Subscriber.findOneAndUpdate(
        { email },
        { $setOnInsert: { email, source } },
        { new: true, upsert: true }
      );

      return res.status(201).json({
        success: true,
        message: 'Subscribed successfully',
        subscriberId: subscriber._id,
      });
    } catch (error) {
      req.log?.error?.('Subscriber create error', { err: error });
      return res.status(500).json({ success: false, error: 'Failed to save subscriber' });
    }
  }
);

router.get('/admin', authMiddleware, allowRoles('super-admin', 'admin'), async (req, res) => {
  try {
    const subscribers = await Subscriber.find({}).sort({ createdAt: -1 }).limit(2000).lean();
    return res.json({ success: true, subscribers });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch subscribers' });
  }
});

module.exports = router;
