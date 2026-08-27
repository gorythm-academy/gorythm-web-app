const express = require('express');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const Course = require('../models/Course');
const { buildGallery, cleanupOrphan, deleteMedia } = require('../services/mediaLibrary');
const {
    ensureImageDir,
    imagePublicPath,
    renameImageFile,
    IMAGE_DIR,
    ALLOWED_EXT,
} = require('../utils/courseImageStorage');
const { resolveStoredFilename, safeBasename } = require('../utils/safeFilename');

const adminOnly = [authMiddleware, validateSessionUser, allowRoles('super-admin', 'manager')];

const IMAGE_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/avif',
]);
const ALLOWED_EXT_LOCAL = ALLOWED_EXT;

function isAllowedCourseImage(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (IMAGE_MIME.has(file.mimetype)) return true;
    if (ALLOWED_EXT_LOCAL.has(ext)) return true;
    return false;
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
          filename: (req, file, cb) => {
              try {
                  const name = resolveStoredFilename({
                      destDir: IMAGE_DIR,
                      originalName: file.originalname,
                      overrideName: req.body?.filename,
                      replacePath: req.body?.replacePath,
                      publicPathFor: imagePublicPath,
                  });
                  cb(null, name);
              } catch (err) {
                  cb(err);
              }
          },
      })
    : null;

const uploadCourseImage = diskStorage
    ? multer({
          storage: diskStorage,
          limits: { fileSize: 8 * 1024 * 1024 },
          fileFilter: (_req, file, cb) => {
              if (isAllowedCourseImage(file)) return cb(null, true);
              cb(new Error('Image must be JPEG, PNG, WebP, or AVIF'));
          },
      })
    : null;

async function deleteCourseImageIfOrphan(publicPath) {
    await cleanupOrphan('courses-images', publicPath);
}

const router = express.Router();
router.use(...adminOnly);

router.get('/', async (req, res) => {
    try {
        const images = await buildGallery('courses-images');
        return res.json({ success: true, images });
    } catch (error) {
        req.log?.error?.('Error listing course images', { err: error });
        return res.status(500).json({ success: false, error: error.message || 'Failed to list images' });
    }
});

router.post('/cleanup', async (req, res) => {
    try {
        await deleteCourseImageIfOrphan(req.body?.imagePath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Cleanup failed' });
    }
});

router.post('/', (req, res) => {
    if (!uploadCourseImage) {
        return res.status(503).json({ success: false, error: 'Upload not available on server' });
    }
    uploadCourseImage.single('file')(req, res, async (err) => {
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

router.post('/rename', async (req, res) => {
    try {
        const oldPath = String(req.body?.imagePath || '').trim();
        const rawName = String(req.body?.filename || '').trim();
        if (!oldPath || !rawName) {
            return res.status(400).json({ success: false, error: 'imagePath and filename are required' });
        }

        const currentFilename = oldPath.split('/').pop() || '';
        const ext = path.extname(currentFilename).toLowerCase() || '.jpg';
        const safeExt = ALLOWED_EXT_LOCAL.has(ext) ? ext : '.jpg';
        const newFilename = rawName.includes('.') ? safeBasename(rawName) : safeBasename(`${rawName}${safeExt}`);
        if (!newFilename) {
            return res.status(400).json({ success: false, error: 'Invalid file name.' });
        }

        const newPath = imagePublicPath(newFilename);
        if (newPath === oldPath) {
            return res.json({ success: true, imagePath: oldPath, filename: newFilename });
        }

        const renamedPath = renameImageFile(oldPath, newFilename);

        await Course.updateMany({ homepageImage: oldPath }, { $set: { homepageImage: renamedPath } });

        return res.json({ success: true, imagePath: renamedPath, filename: newFilename });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message || 'Rename failed' });
    }
});

router.post('/delete', async (req, res) => {
    try {
        const imagePath = String(req.body?.imagePath || '').trim();
        const excludeCourseId = String(req.body?.excludeCourseId || '').trim() || null;
        if (!imagePath) {
            return res.status(400).json({ success: false, error: 'imagePath is required' });
        }
        const force =
            req.body?.force === true ||
            req.body?.force === 1 ||
            req.body?.force === '1' ||
            req.body?.force === 'true';
        const result = await deleteMedia('courses-images', imagePath, { force, excludeCourseId });
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

router.delete('/', async (req, res) => {
    try {
        const imagePath = String(req.body?.imagePath || req.query?.imagePath || '').trim();
        const excludeCourseId = String(req.body?.excludeCourseId || req.query?.excludeCourseId || '').trim() || null;
        if (!imagePath) {
            return res.status(400).json({ success: false, error: 'imagePath is required' });
        }
        const force =
            req.body?.force === true ||
            req.body?.force === 1 ||
            req.body?.force === '1' ||
            req.body?.force === 'true' ||
            req.query?.force === '1' ||
            req.query?.force === 'true';
        const result = await deleteMedia('courses-images', imagePath, { force, excludeCourseId });
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
