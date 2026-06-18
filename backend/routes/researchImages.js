const express = require('express');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const ResearchPost = require('../models/ResearchPost');
const {
    ensureImageDir,
    imagePublicPath,
    deleteImageFile,
    listImageFilenames,
    renameImageFile,
    publicPathForFilename,
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
    const normalized = String(publicPath || '').trim();
    if (!normalized) return;
    const inUse = await ResearchPost.countDocuments({ imagePath: normalized });
    if (inUse === 0) deleteImageFile(normalized);
}

async function countPostsUsingImage(imagePath) {
    return ResearchPost.countDocuments({ imagePath });
}

async function getPostsUsingImage(imagePath) {
    return ResearchPost.find({ imagePath }).select('title').lean();
}

async function buildResearchImageGallery() {
    const filenames = listImageFilenames();
    const paths = filenames.map((name) => publicPathForFilename(name));
    const usageRows = paths.length
        ? await ResearchPost.find({ imagePath: { $in: paths } }).select('title imagePath').lean()
        : [];

    const usageByPath = new Map();
    usageRows.forEach((row) => {
        const key = row.imagePath;
        if (!usageByPath.has(key)) usageByPath.set(key, []);
        usageByPath.get(key).push(row.title || 'Untitled');
    });

    return filenames
        .map((filename) => {
            const imagePath = publicPathForFilename(filename);
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
        const images = await buildResearchImageGallery();
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
        const replacePath = String(req.body?.replacePath || '').trim();
        if (replacePath && replacePath !== imagePath) {
            await deleteResearchImageIfOrphan(replacePath);
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
        const inUse = await countPostsUsingImage(imagePath);
        if (inUse > 0) {
            const posts = await getPostsUsingImage(imagePath);
            const names = posts.map((p) => p.title || 'Untitled').join(', ');
            return res.status(400).json({
                success: false,
                error: `Image is used by ${inUse} article(s): ${names}. Clear the image on those articles first.`,
            });
        }
        deleteImageFile(imagePath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Delete failed' });
    }
});

module.exports = router;
