const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Subscriber = require('../models/Subscriber');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const { validate, rules } = require('../middleware/validate');
const { publicWriteRateLimiter } = require('../middleware/publicWriteRateLimit');
const {
  loadSubscribePopupSettings,
  saveSubscribePopupSettings,
} = require('../services/subscribePopupSettings');

const adminOnly = [authMiddleware, validateSessionUser, allowRoles('super-admin', 'manager')];

const SUBSCRIBER_LIST_LIMIT = 2000;

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
  publicWriteRateLimiter,
  validate([rules.requiredString('email', 'Email'), rules.email('email', 'Email')]),
  async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const source = String(req.body?.source || 'unknown').trim() || 'unknown';

      const subscriber = await Subscriber.findOneAndUpdate(
        { email },
        { $set: { source }, $setOnInsert: { email } },
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

router.get('/admin', ...adminOnly, async (req, res) => {
  try {
    const fetchAll = req.query.all === 'true' || req.query.all === '1';
    const totalCount = await Subscriber.countDocuments({});
    const query = Subscriber.find({}).sort({ createdAt: -1 });
    const subscribers = fetchAll
      ? await query.lean()
      : await query.limit(SUBSCRIBER_LIST_LIMIT).lean();

    return res.json({
      success: true,
      subscribers,
      totalCount,
      listLimit: fetchAll ? null : SUBSCRIBER_LIST_LIMIT,
      truncated: !fetchAll && totalCount > SUBSCRIBER_LIST_LIMIT,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch subscribers' });
  }
});

router.get('/admin/popup-settings', ...adminOnly, async (req, res) => {
  try {
    const form = await loadSubscribePopupSettings();
    return res.json({ success: true, popup: form });
  } catch (error) {
    req.log?.error?.('popup-settings load', { err: error });
    return res.status(500).json({ success: false, error: 'Failed to load popup settings' });
  }
});

router.post('/admin/popup-settings', ...adminOnly, async (req, res) => {
  try {
    const role = req.user?.role;
    const userId = req.user?.userId || req.user?.id || null;
    const form = await saveSubscribePopupSettings(req.body || {}, { role, userId });
    return res.json({
      success: true,
      message: 'Popup settings saved',
      popup: form,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      error: error.message || 'Failed to save popup settings',
    });
  }
});

router.post(
  '/admin/bulk-delete',
  ...adminOnly,
  validate([rules.arrayNonEmpty('ids', 'Subscriber IDs')]),
  deleteSubscribersHandler
);

router.post(
  '/admin/delete',
  ...adminOnly,
  validate([rules.arrayNonEmpty('ids', 'Subscriber IDs')]),
  deleteSubscribersHandler
);

router.post('/admin/:id/delete', ...adminOnly, deleteSubscriberHandler);

router.delete('/admin/:id', ...adminOnly, deleteSubscriberHandler);

module.exports = router;
