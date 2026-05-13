const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Subscriber = require('../models/Subscriber');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validate, rules } = require('../middleware/validate');

const validateSubscriberIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return 'Subscriber IDs are required';
  const invalidId = ids.find((id) => !mongoose.Types.ObjectId.isValid(String(id)));
  return invalidId ? 'Subscriber IDs are invalid' : null;
};

const deleteSubscriberIds = async (ids) => {
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(String(id)));
  const result = await Subscriber.deleteMany({ _id: { $in: objectIds } });
  return result.deletedCount || 0;
};

const deleteSubscribersHandler = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => String(id)) : [];
    const validationError = validateSubscriberIds(ids);

    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const deletedCount = await deleteSubscriberIds(ids);
    return res.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete subscribers' });
  }
};

const deleteSubscriberHandler = async (req, res) => {
  try {
    const id = String(req.params.id || '');
    const validationError = validateSubscriberIds([id]);

    if (validationError) {
      return res.status(400).json({ success: false, error: 'Subscriber ID is invalid' });
    }

    const deletedCount = await deleteSubscriberIds([id]);
    if (deletedCount < 1) {
      return res.status(404).json({ success: false, error: 'Subscriber not found' });
    }

    return res.json({ success: true, deletedCount });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete subscriber' });
  }
};

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

router.post(
  '/admin/bulk-delete',
  authMiddleware,
  allowRoles('super-admin', 'admin'),
  validate([rules.arrayNonEmpty('ids', 'Subscriber IDs')]),
  deleteSubscribersHandler
);

router.post(
  '/admin/delete',
  authMiddleware,
  allowRoles('super-admin', 'admin'),
  validate([rules.arrayNonEmpty('ids', 'Subscriber IDs')]),
  deleteSubscribersHandler
);

router.post('/admin/:id/delete', authMiddleware, allowRoles('super-admin', 'admin'), deleteSubscriberHandler);

router.delete('/admin/:id', authMiddleware, allowRoles('super-admin', 'admin'), deleteSubscriberHandler);

module.exports = router;
