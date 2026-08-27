/**
 * Subscribe popup admin API — settings + image gallery + upload (single router).
 * Mounted at /api/admin/subscribe-popup
 */
const express = require('express');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { buildGallery, deleteMedia } = require('../services/mediaLibrary');
const {
    loadSubscribePopupSettings,
    saveSubscribePopupSettings,
} = require('../services/subscribePopupSettings');
const {
    ensureImageDir,
    imagePublicPath,
    IMAGE_DIR,
    uniqueImageFilename,
} = require('../utils/subscribePopupImageStorage');

const POPUP_MEDIA_CATEGORY = 'subscribe-popup-images';

const adminOnly = [authMiddleware, validateSessionUser, allowRoles('super-admin', 'manager')];

const IMAGE_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/avif',
]);

function isAllowedImage(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (IMAGE_MIME.has(file.mimetype)) return true;
    return ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext);
}

let multer;
try {
    multer = require('multer');
} catch {
    multer = null;
}

ensureImageDir();

const diskStorage = multer
    ? multer.diskStorage({
          destination: (_req, _file, cb) => {
              ensureImageDir();
              cb(null, IMAGE_DIR);
          },
          filename: (_req, file, cb) => {
              try {
                  cb(null, uniqueImageFilename(file.originalname));
              } catch (err) {
                  cb(err);
              }
          },
      })
    : null;

const uploadImage = diskStorage
    ? multer({
          storage: diskStorage,
          limits: { fileSize: 8 * 1024 * 1024 },
          fileFilter: (_req, file, cb) => {
              if (isAllowedImage(file)) return cb(null, true);
              cb(new Error('Image must be JPEG, PNG, WebP, or AVIF'));
          },
      })
    : null;

const router = express.Router();

router.get('/health', (_req, res) => {
    res.json({ success: true, service: 'subscribe-popup-admin', version: 1 });
});

router.use(...adminOnly);

router.get('/settings', async (req, res) => {
    try {
        const popup = await loadSubscribePopupSettings();
        return res.json({ success: true, popup });
    } catch (error) {
        req.log?.error?.('subscribe-popup settings load', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to load popup settings' });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const role = req.user?.role;
        const userId = req.user?.userId || req.user?.id || null;
        const popup = await saveSubscribePopupSettings(req.body || {}, { role, userId });
        return res.json({
            success: true,
            message: 'Popup settings saved',
            popup,
        });
    } catch (error) {
        const status = error.statusCode || 500;
        return res.status(status).json({
            success: false,
            error: error.message || 'Failed to save popup settings',
        });
    }
});

router.get('/gallery', async (req, res) => {
    try {
        const images = await buildGallery(POPUP_MEDIA_CATEGORY);
        return res.json({ success: true, category: POPUP_MEDIA_CATEGORY, images });
    } catch (error) {
        req.log?.error?.('subscribe-popup gallery', { err: error });
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to load popup image gallery',
        });
    }
});

router.post('/gallery/delete', async (req, res) => {
    try {
        const imagePath = String(req.body?.path || req.body?.imagePath || '').trim();
        if (!imagePath) {
            return res.status(400).json({ success: false, error: 'path is required' });
        }
        const force =
            req.body?.force === true ||
            req.body?.force === 1 ||
            req.body?.force === '1' ||
            req.body?.force === 'true';
        const result = await deleteMedia(POPUP_MEDIA_CATEGORY, imagePath, { force });
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

router.post('/upload', (req, res) => {
    if (!uploadImage) {
        return res.status(503).json({ success: false, error: 'Upload not available on server' });
    }
    uploadImage.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        const imagePath = imagePublicPath(req.file.filename);
        return res.status(201).json({
            success: true,
            imagePath,
            filename: req.file.filename,
        });
    });
});

module.exports = router;
