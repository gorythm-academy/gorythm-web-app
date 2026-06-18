const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const BlogComment = require('../models/BlogComment');
const ResearchPost = require('../models/ResearchPost');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');

const adminOnly = [authMiddleware, validateSessionUser, allowRoles('super-admin', 'manager')];

const validateCommentIds = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return 'Comment IDs are required';
    const invalidId = ids.find((id) => !mongoose.Types.ObjectId.isValid(String(id)));
    return invalidId ? 'Comment IDs are invalid' : null;
};

const deleteCommentIds = async (ids) => {
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(String(id)));
    const result = await BlogComment.deleteMany({ _id: { $in: objectIds } });
    return result.deletedCount || 0;
};

router.get('/', ...adminOnly, async (req, res) => {
    try {
        const filter = {};
        const postSlug = String(req.query.postSlug || '').trim();
        if (postSlug) filter.postSlug = postSlug;

        const comments = await BlogComment.find(filter).sort({ createdAt: -1 }).limit(2000).lean();
        const slugs = [...new Set(comments.map((c) => c.postSlug).filter(Boolean))];
        const posts = slugs.length
            ? await ResearchPost.find({ slug: { $in: slugs } }).select('slug title').lean()
            : [];
        const titleBySlug = Object.fromEntries(posts.map((p) => [p.slug, p.title]));

        return res.json({
            success: true,
            comments: comments.map((c) => ({
                id: c._id.toString(),
                postSlug: c.postSlug,
                postTitle: titleBySlug[c.postSlug] || c.postSlug,
                authorName: c.authorName,
                authorEmail: c.authorEmail || '',
                text: c.text,
                date: c.createdAt,
            })),
        });
    } catch (error) {
        req.log?.error?.('admin research comments list', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to fetch research comments' });
    }
});

router.post('/bulk-delete', ...adminOnly, async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => String(id)) : [];
        const validationError = validateCommentIds(ids);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const deletedCount = await deleteCommentIds(ids);
        return res.json({ success: true, deletedCount });
    } catch (error) {
        req.log?.error?.('admin research comments bulk delete', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to delete comments' });
    }
});

router.delete('/:id', ...adminOnly, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const validationError = validateCommentIds([id]);
        if (validationError) {
            return res.status(400).json({ success: false, error: 'Comment ID is invalid' });
        }

        const deletedCount = await deleteCommentIds([id]);
        if (deletedCount < 1) {
            return res.status(404).json({ success: false, error: 'Comment not found' });
        }

        return res.json({ success: true, deletedCount });
    } catch (error) {
        req.log?.error?.('admin research comment delete', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to delete comment' });
    }
});

module.exports = router;
