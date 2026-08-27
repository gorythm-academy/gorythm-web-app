const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const {
    MEDIA_CATEGORY_KEYS,
    buildGallery,
    cleanupOrphan,
    deleteMedia,
    normalizeCategory,
} = require('../services/mediaLibrary');

const adminOnly = [authMiddleware, validateSessionUser, allowRoles('super-admin', 'manager')];
const router = express.Router();
router.use(...adminOnly);

router.get('/categories', (_req, res) => {
    return res.json({ success: true, categories: MEDIA_CATEGORY_KEYS });
});

router.get('/', async (req, res) => {
    try {
        const category = normalizeCategory(req.query.category);
        const images = await buildGallery(category);
        return res.json({ success: true, category, images });
    } catch (error) {
        const status = error.message.includes('Invalid category') ? 400 : 500;
        return res.status(status).json({ success: false, error: error.message || 'Failed to list media' });
    }
});

router.post('/cleanup', async (req, res) => {
    try {
        const category = normalizeCategory(req.body?.category);
        const publicPath = String(req.body?.path || req.body?.imagePath || req.body?.thumbnailPath || '').trim();
        if (!publicPath) {
            return res.status(400).json({ success: false, error: 'path is required' });
        }
        await cleanupOrphan(category, publicPath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message || 'Cleanup failed' });
    }
});

router.post('/delete', async (req, res) => {
    try {
        const category = normalizeCategory(req.body?.category);
        const publicPath = String(req.body?.path || req.body?.imagePath || req.body?.thumbnailPath || '').trim();
        if (!publicPath) {
            return res.status(400).json({ success: false, error: 'path is required' });
        }
        const force =
            req.body?.force === true ||
            req.body?.force === 1 ||
            req.body?.force === '1' ||
            req.body?.force === 'true';
        const excludeCourseId = String(req.body?.excludeCourseId || '').trim() || null;
        const result = await deleteMedia(category, publicPath, { force, excludeCourseId });
        return res.json({ success: true, ...result });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            inUse: Boolean(error.inUse),
            usedByTitles: error.usedByTitles || [],
            error: error.message || 'Delete failed',
        });
    }
});

module.exports = router;
