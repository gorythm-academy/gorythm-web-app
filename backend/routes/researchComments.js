const express = require('express');
const router = express.Router();
const ResearchComment = require('../models/ResearchComment');
const { publicWriteRateLimiter } = require('../middleware/publicWriteRateLimit');

const approvedFilter = {
    $or: [{ status: 'approved' }, { status: { $exists: false } }],
};

const mapPublicComment = (c) => ({
    id: c._id.toString(),
    authorName: c.authorName,
    text: c.text,
    date: c.createdAt,
    adminReply: c.adminReply || '',
    repliedAt: c.repliedAt || null,
});

// GET /api/research/counts - returns { postSlug: count } only for approved feedback
router.get('/counts', async (req, res) => {
    try {
        const counts = await ResearchComment.aggregate([
            { $match: approvedFilter },
            { $group: { _id: '$postSlug', count: { $sum: 1 } } },
            { $project: { postSlug: '$_id', count: 1, _id: 0 } },
        ]);
        const map = {};
        counts.forEach(({ postSlug, count }) => {
            map[postSlug] = count;
        });
        res.json({ success: true, counts: map });
    } catch (error) {
        req.log.error('Error fetching comment counts', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch comment counts' });
    }
});

// GET /api/research/:postSlug/comments
router.get('/:postSlug/comments', async (req, res) => {
    try {
        const comments = await ResearchComment.find({
            postSlug: req.params.postSlug,
            ...approvedFilter,
        })
            .sort({ createdAt: -1 })
            .lean();
        res.json({
            success: true,
            comments: comments.map(mapPublicComment),
        });
    } catch (error) {
        req.log.error('Error fetching comments', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch comments' });
    }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/research/:postSlug/comments
router.post('/:postSlug/comments', publicWriteRateLimiter, async (req, res) => {
    try {
        const { authorName, authorEmail, text } = req.body;
        const postSlug = req.params.postSlug;
        if (!authorName || !text || !postSlug) {
            return res.status(400).json({ success: false, error: 'Name and feedback text are required' });
        }
        const email = authorEmail ? String(authorEmail).trim() : '';
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                success: false,
                error:
                    'Enter a full email address (e.g. abc@email.com). The part after the last dot must be at least 2 letters.',
            });
        }
        const comment = new ResearchComment({
            postSlug,
            authorName: String(authorName).trim(),
            authorEmail: email,
            text: String(text).trim(),
            status: 'pending',
        });
        await comment.save();
        res.status(201).json({
            success: true,
            message: 'Thank you — your feedback will appear after review.',
        });
    } catch (error) {
        req.log.error('Error posting comment', { err: error });
        res.status(500).json({ success: false, error: 'Failed to post feedback' });
    }
});

module.exports = router;
