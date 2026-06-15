const express = require('express');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const PromoVideo = require('../models/PromoVideo');
const SitePromoSettings = require('../models/SitePromoSettings');
const { parseVideoUrl } = require('../utils/videoEmbed');
const {
    ensureThumbDir,
    thumbPublicPath,
    deleteThumbFile,
    THUMB_DIR,
} = require('../utils/promoThumbnailStorage');

const SETTINGS_KEY = 'site-promo';
const adminOnly = [authMiddleware, allowRoles('admin', 'super-admin')];

const IMAGE_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/avif',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

function isAllowedThumbnail(file) {
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

ensureThumbDir();

const thumbStorage = multer
    ? multer.diskStorage({
          destination: (_req, _file, cb) => {
              ensureThumbDir();
              cb(null, THUMB_DIR);
          },
          filename: (_req, file, cb) => {
              const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
              const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
              cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`);
          },
      })
    : null;

const uploadThumb = thumbStorage
    ? multer({
          storage: thumbStorage,
          limits: { fileSize: 8 * 1024 * 1024 },
          fileFilter: (_req, file, cb) => {
              if (isAllowedThumbnail(file)) return cb(null, true);
              cb(new Error('Thumbnail must be JPEG, PNG, WebP, or AVIF'));
          },
      })
    : null;

async function getOrCreateSettings() {
    let doc = await SitePromoSettings.findOne({ key: SETTINGS_KEY });
    if (!doc) {
        doc = await SitePromoSettings.create({ key: SETTINGS_KEY });
    }
    return doc;
}

function serializeVideo(doc) {
    if (!doc) return null;
    const o = doc.toObject ? doc.toObject() : doc;
    return {
        id: String(o._id),
        name: o.name,
        videoUrl: o.videoUrl,
        provider: o.provider,
        videoId: o.videoId,
        embedSrc: o.embedSrc,
        thumbnailPath: o.thumbnailPath || '',
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
    };
}

async function loadActiveVideo(videoId) {
    if (!videoId) return null;
    const doc = await PromoVideo.findById(videoId).lean();
    return serializeVideo(doc);
}

/** Remove upload only when no video row still references it (avoids duplicate orphan files). */
async function deleteThumbnailIfOrphan(publicPath) {
    const path = String(publicPath || '').trim();
    if (!path) return;
    const inUse = await PromoVideo.countDocuments({ thumbnailPath: path });
    if (inUse === 0) deleteThumbFile(path);
}

// —— Public (mounted at /api/promo-videos) ———————————————————————————————————

const publicRouter = express.Router();

publicRouter.get('/active/:placement', async (req, res) => {
    try {
        const placement = String(req.params.placement || '').toLowerCase();
        if (placement !== 'home' && placement !== 'about') {
            return res.status(400).json({ success: false, error: 'Invalid placement' });
        }

        const settings = await SitePromoSettings.findOne({ key: SETTINGS_KEY }).lean();
        const videoId =
            placement === 'home' ? settings?.homepageVideoId : settings?.aboutVideoId;

        const video = await loadActiveVideo(videoId);
        return res.json({ success: true, video });
    } catch (error) {
        req.log?.error?.('promo video active', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to load video' });
    }
});

// —— Admin (mounted at /api/admin/promo-videos) ——————————————————————————————

const adminRouter = express.Router();
adminRouter.use(...adminOnly);

adminRouter.get('/', async (req, res) => {
    try {
        const [videos, settings] = await Promise.all([
            PromoVideo.find({}).sort({ createdAt: -1 }).lean(),
            getOrCreateSettings(),
        ]);

        return res.json({
            success: true,
            videos: videos.map(serializeVideo),
            selection: {
                homepageVideoId: settings.homepageVideoId ? String(settings.homepageVideoId) : '',
                aboutVideoId: settings.aboutVideoId ? String(settings.aboutVideoId) : '',
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to list videos' });
    }
});

adminRouter.patch('/selection', async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        const { homepageVideoId, aboutVideoId } = req.body || {};

        if (homepageVideoId !== undefined) {
            if (!homepageVideoId) {
                settings.homepageVideoId = null;
            } else {
                const exists = await PromoVideo.findById(homepageVideoId);
                if (!exists) {
                    return res.status(400).json({ success: false, error: 'Homepage video not found' });
                }
                settings.homepageVideoId = exists._id;
            }
        }

        if (aboutVideoId !== undefined) {
            if (!aboutVideoId) {
                settings.aboutVideoId = null;
            } else {
                const exists = await PromoVideo.findById(aboutVideoId);
                if (!exists) {
                    return res.status(400).json({ success: false, error: 'About page video not found' });
                }
                settings.aboutVideoId = exists._id;
            }
        }

        await settings.save();

        return res.json({
            success: true,
            selection: {
                homepageVideoId: settings.homepageVideoId ? String(settings.homepageVideoId) : '',
                aboutVideoId: settings.aboutVideoId ? String(settings.aboutVideoId) : '',
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to update selection' });
    }
});

adminRouter.post('/thumbnail/cleanup', async (req, res) => {
    try {
        await deleteThumbnailIfOrphan(req.body?.thumbnailPath);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Cleanup failed' });
    }
});

adminRouter.post('/thumbnail', (req, res) => {
    if (!uploadThumb) {
        return res.status(503).json({ success: false, error: 'Upload not available on server' });
    }
    uploadThumb.single('file')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        const url = thumbPublicPath(req.file.filename);
        const replacePath = String(req.body?.replacePath || '').trim();
        if (replacePath && replacePath !== url) {
            await deleteThumbnailIfOrphan(replacePath);
        }
        return res.status(201).json({
            success: true,
            thumbnailPath: url,
            filename: req.file.filename,
        });
    });
});

adminRouter.post('/', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const videoUrl = String(req.body?.videoUrl || '').trim();
        const thumbnailPath = String(req.body?.thumbnailPath || '').trim();

        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }
        if (!thumbnailPath) {
            return res.status(400).json({ success: false, error: 'Thumbnail is required' });
        }

        const parsed = parseVideoUrl(videoUrl);
        if (parsed.error) {
            return res.status(400).json({ success: false, error: parsed.error });
        }

        const doc = await PromoVideo.create({
            name,
            videoUrl: parsed.videoUrl,
            provider: parsed.provider,
            videoId: parsed.videoId,
            embedSrc: parsed.embedSrc,
            thumbnailPath,
        });

        return res.status(201).json({ success: true, video: serializeVideo(doc) });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to create video' });
    }
});

adminRouter.put('/:id', async (req, res) => {
    try {
        const doc = await PromoVideo.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const name = req.body?.name !== undefined ? String(req.body.name).trim() : doc.name;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }
        doc.name = name;

        if (req.body?.videoUrl !== undefined) {
            const parsed = parseVideoUrl(req.body.videoUrl);
            if (parsed.error) {
                return res.status(400).json({ success: false, error: parsed.error });
            }
            doc.videoUrl = parsed.videoUrl;
            doc.provider = parsed.provider;
            doc.videoId = parsed.videoId;
            doc.embedSrc = parsed.embedSrc;
        }

        if (req.body?.thumbnailPath !== undefined) {
            const next = String(req.body.thumbnailPath || '').trim();
            if (!next) {
                return res.status(400).json({ success: false, error: 'Thumbnail is required' });
            }
            if (doc.thumbnailPath && doc.thumbnailPath !== next) {
                deleteThumbFile(doc.thumbnailPath);
            }
            doc.thumbnailPath = next;
        }

        await doc.save();
        return res.json({ success: true, video: serializeVideo(doc) });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to update video' });
    }
});

adminRouter.delete('/:id', async (req, res) => {
    try {
        const doc = await PromoVideo.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        const settings = await getOrCreateSettings();
        const idStr = String(doc._id);
        const cleared = [];

        if (settings.homepageVideoId && String(settings.homepageVideoId) === idStr) {
            settings.homepageVideoId = null;
            cleared.push('homepage');
        }
        if (settings.aboutVideoId && String(settings.aboutVideoId) === idStr) {
            settings.aboutVideoId = null;
            cleared.push('about');
        }
        if (cleared.length) await settings.save();

        if (doc.thumbnailPath) deleteThumbFile(doc.thumbnailPath);
        await doc.deleteOne();

        return res.json({
            success: true,
            clearedSelection: cleared,
            selection: {
                homepageVideoId: settings.homepageVideoId ? String(settings.homepageVideoId) : '',
                aboutVideoId: settings.aboutVideoId ? String(settings.aboutVideoId) : '',
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to delete video' });
    }
});

module.exports = publicRouter;
module.exports.adminRouter = adminRouter;
