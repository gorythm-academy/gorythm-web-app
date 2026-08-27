const express = require('express');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const ResearchPost = require('../models/ResearchPost');
const { buildGallery, cleanupOrphan, deleteMedia } = require('../services/mediaLibrary');
const {
    ensureImageDir,
    imagePublicPath,
    renameImageFile,
    IMAGE_DIR,
    ALLOWED_EXT,
} = require('../utils/researchImageStorage');
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

function isAllowedResearchImage(file) {
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

const uploadResearchImage = diskStorage
    ? multer({
          storage: diskStorage,
          limits: { fileSize: 8 * 1024 * 1024 },
          fileFilter: (_req, file, cb) => {
              if (isAllowedResearchImage(file)) return cb(null, true);
              cb(new Error('Image must be JPEG, PNG, WebP, or AVIF'));
          },
      })
    : null;

async function deleteResearchImageIfOrphan(publicPath) {
    await cleanupOrphan('research-images', publicPath);
}

const router = express.Router();
router.use(...adminOnly);

router.get('/', async (req, res) => {
    try {
        const images = await buildGallery('research-images');
        return res.json({ success: true, images });
    } catch (error) {
        req.log?.error?.('Error listing research images', { err: error });
        return res.status(500).json({ success: false, error: error.message || 'Failed to list images' });
    }
});

router.post('/cleanup', async (req, res) => {
    try {
        await deleteResearchImageIfOrphan(req.body?.imagePath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Cleanup failed' });
    }
});

router.post('/', (req, res) => {
    if (!uploadResearchImage) {
        return res.status(503).json({ success: false, error: 'Upload not available on server' });
    }
    uploadResearchImage.single('file')(req, res, async (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    error: 'Image is too large. Maximum size is 8 MB.',
                });
            }
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
        const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
        const newFilename = rawName.includes('.') ? safeBasename(rawName) : safeBasename(`${rawName}${safeExt}`);
        if (!newFilename) {
            return res.status(400).json({ success: false, error: 'Invalid file name.' });
        }

        const newPath = imagePublicPath(newFilename);
        if (newPath === oldPath) {
            return res.json({ success: true, imagePath: oldPath, filename: newFilename });
        }

        const renamedPath = renameImageFile(oldPath, newFilename);

        await ResearchPost.updateMany({ imagePath: oldPath }, { $set: { imagePath: renamedPath } });

        return res.json({ success: true, imagePath: renamedPath, filename: newFilename });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message || 'Rename failed' });
    }
});

router.post('/delete', async (req, res) => {
    try {
        const imagePath = String(req.body?.imagePath || '').trim();
        if (!imagePath) {
            return res.status(400).json({ success: false, error: 'imagePath is required' });
        }
        const force =
            req.body?.force === true ||
            req.body?.force === 1 ||
            req.body?.force === '1' ||
            req.body?.force === 'true';
        const result = await deleteMedia('research-images', imagePath, { force });
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
