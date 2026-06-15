const express = require('express');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const Course = require('../models/Course');
const {
    ensureImageDir,
    imagePublicPath,
    deleteImageFile,
    listImageFilenames,
    IMAGE_DIR,
} = require('../utils/courseImageStorage');

const adminOnly = [authMiddleware, allowRoles('super-admin', 'admin')];

const IMAGE_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/avif',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

function isAllowedCourseImage(file) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (IMAGE_MIME.has(file.mimetype)) return true;
    if (ALLOWED_EXT.has(ext)) return true;
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
          filename: (_req, file, cb) => {
              const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
              const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
              cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`);
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
    const normalized = String(publicPath || '').trim();
    if (!normalized) return;
    const inUse = await Course.countDocuments({ homepageImage: normalized });
    if (inUse === 0) deleteImageFile(normalized);
}

async function buildCourseImageGallery() {
    const filenames = listImageFilenames();
    const paths = filenames.map((name) => imagePublicPath(name));
    const usageRows = paths.length
        ? await Course.find({ homepageImage: { $in: paths } })
              .select('title homepageImage')
              .lean()
        : [];

    const usageByPath = new Map();
    usageRows.forEach((row) => {
        const key = row.homepageImage;
        if (!usageByPath.has(key)) usageByPath.set(key, []);
        usageByPath.get(key).push(row.title || 'Untitled');
    });

    return filenames
        .map((filename) => {
            const imagePath = imagePublicPath(filename);
            const usedByTitles = usageByPath.get(imagePath) || [];
            return {
                filename,
                path: imagePath,
                usedBy: usedByTitles.length,
                usedByTitles,
            };
        })
        .sort((a, b) => b.filename.localeCompare(a.filename));
}

const router = express.Router();
router.use(...adminOnly);

router.get('/', async (req, res) => {
    try {
        const images = await buildCourseImageGallery();
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
        const replacePath = String(req.body?.replacePath || '').trim();
        if (replacePath && replacePath !== imagePath) {
            await deleteCourseImageIfOrphan(replacePath);
        }
        return res.status(201).json({
            success: true,
            imagePath,
            filename: req.file.filename,
        });
    });
});

router.delete('/', async (req, res) => {
    try {
        const imagePath = String(req.body?.imagePath || '').trim();
        if (!imagePath) {
            return res.status(400).json({ success: false, error: 'imagePath is required' });
        }
        const inUse = await Course.countDocuments({ homepageImage: imagePath });
        if (inUse > 0) {
            return res.status(400).json({
                success: false,
                error: `Image is used by ${inUse} course(s). Remove it from those courses first.`,
            });
        }
        deleteImageFile(imagePath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Delete failed' });
    }
});

module.exports = router;
