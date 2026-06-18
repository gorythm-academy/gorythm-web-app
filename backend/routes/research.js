const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const ResearchPost = require('../models/ResearchPost');
const { deleteImageFile } = require('../utils/researchImageStorage');
const { activeLmsFilter, trashedLmsFilter, parseTrashQuery } = require('../utils/lmsTrashQuery');
const { softDeleteMany, restoreMany, permanentDeleteMany, countTrashed } = require('../services/lmsTrashOps');

const adminOnly = [authMiddleware, validateSessionUser, allowRoles('super-admin', 'manager')];

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

async function uniqueSlug(base, excludeId = null) {
    let slug = slugify(base) || 'post';
    let candidate = slug;
    let n = 0;
    while (true) {
        const query = { slug: candidate };
        if (excludeId) query._id = { $ne: excludeId };
        const exists = await ResearchPost.findOne(query).select('_id').lean();
        if (!exists) return candidate;
        n += 1;
        candidate = `${slug}-${n}`;
    }
}

function normalizeTags(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    }
    return String(raw)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
}

function serializePost(doc) {
    if (!doc) return null;
    const o = doc.toObject ? doc.toObject() : doc;
    const publishedAt = o.publishedAt || o.createdAt;
    return {
        id: String(o._id),
        slug: o.slug,
        title: o.title,
        excerpt: o.excerpt || '',
        content: o.content || '',
        contentFormat: o.contentFormat || 'article',
        seriesData: o.seriesData || null,
        imagePath: o.imagePath || '',
        category: o.category || 'General',
        tags: o.tags || [],
        author: o.author || 'Gorythm Team',
        date: publishedAt
            ? new Date(publishedAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
              })
            : '',
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        isPublished: o.isPublished !== false,
        source: 'api',
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
    };
}

async function deleteImageIfOrphan(publicPath) {
    const p = String(publicPath || '').trim();
    if (!p) return;
    const inUse = await ResearchPost.countDocuments({ imagePath: p, ...activeLmsFilter() });
    if (inUse === 0) deleteImageFile(p);
}

// —— Public (mounted at /api/research) ———————————————————————————————————————

const publicRouter = express.Router();

publicRouter.get('/posts', async (req, res) => {
    try {
        const docs = await ResearchPost.find({ isPublished: { $ne: false }, ...activeLmsFilter() })
            .sort({ publishedAt: -1, createdAt: -1 })
            .lean();
        return res.json({
            success: true,
            posts: docs.map(serializePost),
        });
    } catch (error) {
        req.log?.error?.('research list', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to load research posts' });
    }
});

publicRouter.get('/posts/:slug', async (req, res) => {
    try {
        const doc = await ResearchPost.findOne({
            slug: req.params.slug,
            isPublished: { $ne: false },
            ...activeLmsFilter(),
        }).lean();
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }
        return res.json({ success: true, post: serializePost(doc) });
    } catch (error) {
        req.log?.error?.('research get', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to load research post' });
    }
});

// —— Admin (mounted at /api/admin/research) ——————————————————————————————————

const adminRouter = express.Router();
adminRouter.use(...adminOnly);

adminRouter.get('/', async (req, res) => {
    try {
        const trash = parseTrashQuery(req);
        const filter = trash ? trashedLmsFilter() : activeLmsFilter();
        const sort = trash ? { deletedAt: -1 } : { publishedAt: -1, createdAt: -1 };
        const [docs, trashCount] = await Promise.all([
            ResearchPost.find(filter).sort(sort).lean(),
            countTrashed(ResearchPost),
        ]);
        return res.json({ success: true, posts: docs.map(serializePost), trashCount });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to list posts' });
    }
});

adminRouter.post('/', async (req, res) => {
    try {
        const {
            title,
            slug,
            excerpt,
            content,
            imagePath,
            contentFormat,
            seriesData,
            category,
            tags,
            author,
            publishedAt,
            isPublished,
        } = req.body || {};

        if (!title || !String(title).trim()) {
            return res.status(400).json({ success: false, error: 'Title is required' });
        }

        const finalSlug = await uniqueSlug(slug || title);

        const doc = await ResearchPost.create({
            title: String(title).trim(),
            slug: finalSlug,
            excerpt: String(excerpt || '').trim(),
            content: String(content || ''),
            imagePath: String(imagePath || '').trim(),
            contentFormat: contentFormat === 'series-table' ? 'series-table' : 'article',
            seriesData: contentFormat === 'series-table' && seriesData ? seriesData : null,
            category: String(category || 'General').trim(),
            tags: normalizeTags(tags),
            author: String(author || 'Gorythm Team').trim(),
            publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
            isPublished: isPublished !== false,
        });

        return res.status(201).json({ success: true, post: serializePost(doc) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Slug already exists' });
        }
        return res.status(500).json({ success: false, error: error.message || 'Failed to create post' });
    }
});

adminRouter.patch('/:id', async (req, res) => {
    try {
        const doc = await ResearchPost.findById(req.params.id);
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }

        const {
            title,
            slug,
            excerpt,
            content,
            imagePath,
            contentFormat,
            seriesData,
            category,
            tags,
            author,
            publishedAt,
            isPublished,
        } = req.body || {};

        const oldImagePath = doc.imagePath;

        if (title !== undefined) doc.title = String(title).trim();
        if (slug !== undefined) {
            doc.slug = await uniqueSlug(slug || doc.title, doc._id);
        }
        if (excerpt !== undefined) doc.excerpt = String(excerpt).trim();
        if (content !== undefined) doc.content = String(content);
        if (imagePath !== undefined) doc.imagePath = String(imagePath).trim();
        if (contentFormat !== undefined) {
            doc.contentFormat = contentFormat === 'series-table' ? 'series-table' : 'article';
        }
        if (seriesData !== undefined) {
            doc.seriesData = doc.contentFormat === 'series-table' ? seriesData : null;
        }
        if (category !== undefined) doc.category = String(category).trim();
        if (tags !== undefined) doc.tags = normalizeTags(tags);
        if (author !== undefined) doc.author = String(author).trim();
        if (publishedAt !== undefined) doc.publishedAt = publishedAt ? new Date(publishedAt) : doc.publishedAt;
        if (isPublished !== undefined) doc.isPublished = Boolean(isPublished);

        await doc.save();

        if (oldImagePath && oldImagePath !== doc.imagePath) {
            await deleteImageIfOrphan(oldImagePath);
        }

        return res.json({ success: true, post: serializePost(doc) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Slug already exists' });
        }
        return res.status(500).json({ success: false, error: error.message || 'Failed to update post' });
    }
});

adminRouter.delete('/:id', async (req, res) => {
    try {
        const doc = await ResearchPost.findOneAndUpdate(
            { _id: req.params.id, ...activeLmsFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }
        return res.json({ success: true, message: 'Moved to trash' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to move post to trash' });
    }
});

adminRouter.post('/bulk-delete', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
        if (!ids.length) {
            return res.status(400).json({ success: false, error: 'No posts selected' });
        }
        const deletedCount = await softDeleteMany(ResearchPost, ids);
        return res.json({ success: true, deletedCount, message: 'Moved to trash' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to move posts to trash' });
    }
});

adminRouter.patch('/:id/restore', async (req, res) => {
    try {
        const doc = await ResearchPost.findOneAndUpdate(
            { _id: req.params.id, ...trashedLmsFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Trashed post not found' });
        }
        return res.json({ success: true, post: serializePost(doc) });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to restore post' });
    }
});

adminRouter.post('/bulk-restore', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
        if (!ids.length) {
            return res.status(400).json({ success: false, error: 'No posts selected' });
        }
        const restoredCount = await restoreMany(ResearchPost, ids);
        return res.json({ success: true, restoredCount });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to restore posts' });
    }
});

adminRouter.delete('/:id/permanent', async (req, res) => {
    try {
        const doc = await ResearchPost.findOneAndDelete({
            _id: req.params.id,
            ...trashedLmsFilter(),
        });
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Post must be in trash before permanent delete' });
        }
        if (doc.imagePath) await deleteImageIfOrphan(doc.imagePath);
        return res.json({ success: true, message: 'Permanently deleted' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to permanently delete post' });
    }
});

adminRouter.post('/bulk-permanent-delete', async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
        if (!ids.length) {
            return res.status(400).json({ success: false, error: 'No posts selected' });
        }
        const docs = await ResearchPost.find({ _id: { $in: ids }, ...trashedLmsFilter() }).lean();
        const deletedCount = await permanentDeleteMany(ResearchPost, ids);
        for (const doc of docs) {
            if (doc.imagePath) await deleteImageIfOrphan(doc.imagePath);
        }
        return res.json({ success: true, deletedCount });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message || 'Failed to permanently delete posts' });
    }
});

module.exports = { publicRouter, adminRouter };
