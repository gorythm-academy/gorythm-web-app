const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ResearchComment = require('../models/ResearchComment');
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

const validateCommentId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) return 'Comment ID is invalid';
    return null;
};

const deleteCommentIds = async (ids) => {
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(String(id)));
    const result = await ResearchComment.deleteMany({ _id: { $in: objectIds } });
    return result.deletedCount || 0;
};

const mapAdminComment = (c, titleBySlug) => ({
    id: c._id.toString(),
    postSlug: c.postSlug,
    postTitle: titleBySlug[c.postSlug] || c.postSlug,
    authorName: c.authorName,
    authorEmail: c.authorEmail || '',
    text: c.text,
    status: c.status || 'approved',
    adminReply: c.adminReply || '',
    repliedAt: c.repliedAt || null,
    date: c.createdAt,
});

router.get('/', ...adminOnly, async (req, res) => {
    try {
        const filter = {};
        const postSlug = String(req.query.postSlug || '').trim();
        const status = String(req.query.status || '').trim();
        if (postSlug) filter.postSlug = postSlug;
        if (status === 'pending' || status === 'approved') filter.status = status;

        const comments = await ResearchComment.find(filter).sort({ createdAt: -1 }).limit(2000).lean();
        const slugs = [...new Set(comments.map((c) => c.postSlug).filter(Boolean))];
        const posts = slugs.length
            ? await ResearchPost.find({ slug: { $in: slugs } }).select('slug title').lean()
            : [];
        const titleBySlug = Object.fromEntries(posts.map((p) => [p.slug, p.title]));

        return res.json({
            success: true,
            comments: comments.map((c) => mapAdminComment(c, titleBySlug)),
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

router.post('/:id/approve', ...adminOnly, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const validationError = validateCommentId(id);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const comment = await ResearchComment.findByIdAndUpdate(
            id,
            { $set: { status: 'approved' } },
            { new: true }
        ).lean();
        if (!comment) {
            return res.status(404).json({ success: false, error: 'Feedback not found' });
        }

        return res.json({ success: true, comment: { id: comment._id.toString(), status: 'approved' } });
    } catch (error) {
        req.log?.error?.('admin research comment approve', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to approve feedback' });
    }
});

router.post('/:id/reject', ...adminOnly, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const validationError = validateCommentId(id);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const deletedCount = await deleteCommentIds([id]);
        if (deletedCount < 1) {
            return res.status(404).json({ success: false, error: 'Feedback not found' });
        }

        return res.json({ success: true, deletedCount });
    } catch (error) {
        req.log?.error?.('admin research comment reject', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to reject feedback' });
    }
});

router.patch('/:id/reply', ...adminOnly, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const validationError = validateCommentId(id);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const adminReply = String(req.body?.adminReply ?? req.body?.text ?? '').trim();
        if (!adminReply) {
            return res.status(400).json({ success: false, error: 'Reply text is required' });
        }

        const comment = await ResearchComment.findByIdAndUpdate(
            id,
            { $set: { adminReply, repliedAt: new Date() } },
            { new: true }
        ).lean();
        if (!comment) {
            return res.status(404).json({ success: false, error: 'Feedback not found' });
        }

        return res.json({
            success: true,
            comment: {
                id: comment._id.toString(),
                adminReply: comment.adminReply,
                repliedAt: comment.repliedAt,
            },
        });
    } catch (error) {
        req.log?.error?.('admin research comment reply', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to save reply' });
    }
});

router.delete('/:id/reply', ...adminOnly, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const validationError = validateCommentId(id);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const comment = await ResearchComment.findByIdAndUpdate(
            id,
            { $set: { adminReply: '', repliedAt: null } },
            { new: true }
        ).lean();
        if (!comment) {
            return res.status(404).json({ success: false, error: 'Feedback not found' });
        }

        return res.json({ success: true });
    } catch (error) {
        req.log?.error?.('admin research comment clear reply', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to clear reply' });
    }
});

router.delete('/:id', ...adminOnly, async (req, res) => {
    try {
        const id = String(req.params.id || '');
        const validationError = validateCommentId(id);
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
