const express = require('express');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const Course = require('../models/Course');
const { activeCourseFilter } = require('../utils/courseQuery');
const {
    ensureImageDir,
    imagePublicPath,
    deleteImageFile,
    listImageFilenames,
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
    const normalized = String(publicPath || '').trim();
    if (!normalized) return;
    const inUse = await Course.countDocuments({
        homepageImage: normalized,
        ...activeCourseFilter(),
    });
    if (inUse === 0) deleteImageFile(normalized);
}

async function countActiveCoursesUsingImage(imagePath, excludeCourseId = null) {
    const filter = {
        homepageImage: imagePath,
        ...activeCourseFilter(),
    };
    if (excludeCourseId) {
        filter._id = { $ne: excludeCourseId };
    }
    return Course.countDocuments(filter);
}

async function getActiveCoursesUsingImage(imagePath) {
    return Course.find({
        homepageImage: imagePath,
        ...activeCourseFilter(),
    })
        .select('title _id')
        .lean();
}

async function buildCourseImageGallery() {
    const filenames = listImageFilenames();
    const paths = filenames.map((name) => imagePublicPath(name));
    const usageRows = paths.length
        ? await Course.find({ homepageImage: { $in: paths }, ...activeCourseFilter() })
              .select('title homepageImage')
              .lean()
        : [];

    const usageByPath = new Map();
    usageRows.forEach((row) => {
        const key = row.homepageImage;
        if (!usageByPath.has(key)) usageByPath.set(key, { titles: [], ids: [] });
        const entry = usageByPath.get(key);
        entry.titles.push(row.title || 'Untitled');
        entry.ids.push(String(row._id));
    });

    return filenames
        .map((filename) => {
            const imagePath = imagePublicPath(filename);
            const usage = usageByPath.get(imagePath) || { titles: [], ids: [] };
            return {
                filename,
                path: imagePath,
                usedBy: usage.titles.length,
                usedByTitles: usage.titles,
                usedByCourseIds: usage.ids,
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
        const inUse = await countActiveCoursesUsingImage(imagePath, excludeCourseId);
        if (inUse > 0) {
            const courses = await getActiveCoursesUsingImage(imagePath);
            const names = courses
                .filter((c) => !excludeCourseId || String(c._id) !== String(excludeCourseId))
                .map((c) => c.title || 'Untitled')
                .join(', ');
            return res.status(400).json({
                success: false,
                error: `Image is used by ${inUse} course(s): ${names}. Clear the image on those courses first.`,
            });
        }
        if (excludeCourseId) {
            await Course.updateMany(
                { _id: excludeCourseId, homepageImage: imagePath, ...activeCourseFilter() },
                { $set: { homepageImage: '' } }
            );
        }
        deleteImageFile(imagePath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Delete failed' });
    }
});

router.delete('/', async (req, res) => {
    try {
        const imagePath = String(req.body?.imagePath || req.query?.imagePath || '').trim();
        const excludeCourseId = String(req.body?.excludeCourseId || req.query?.excludeCourseId || '').trim() || null;
        if (!imagePath) {
            return res.status(400).json({ success: false, error: 'imagePath is required' });
        }
        const inUse = await countActiveCoursesUsingImage(imagePath, excludeCourseId);
        if (inUse > 0) {
            const courses = await getActiveCoursesUsingImage(imagePath);
            const names = courses
                .filter((c) => !excludeCourseId || String(c._id) !== String(excludeCourseId))
                .map((c) => c.title || 'Untitled')
                .join(', ');
            return res.status(400).json({
                success: false,
                error: `Image is used by ${inUse} course(s): ${names}. Clear the image on those courses first.`,
            });
        }
        if (excludeCourseId) {
            await Course.updateMany(
                { _id: excludeCourseId, homepageImage: imagePath, ...activeCourseFilter() },
                { $set: { homepageImage: '' } }
            );
        }
        deleteImageFile(imagePath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Delete failed' });
    }
});

module.exports = router;
