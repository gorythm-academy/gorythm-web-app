const express = require('express');
const router = express.Router();
const BlogComment = require('../models/BlogComment');

// GET /api/blog/counts - returns { postSlug: count } only for posts that have comments
router.get('/counts', async (req, res) => {
  try {
    const counts = await BlogComment.aggregate([
      { $group: { _id: '$postSlug', count: { $sum: 1 } } },
      { $project: { postSlug: '$_id', count: 1, _id: 0 } }
    ]);
    const map = {};
    counts.forEach(({ postSlug, count }) => { map[postSlug] = count; });
    res.json({ success: true, counts: map });
  } catch (error) {
    console.error('Error fetching comment counts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch comment counts' });
  }
});

// GET /api/blog/:postSlug/comments
router.get('/:postSlug/comments', async (req, res) => {
  try {
    const comments = await BlogComment.find({ postSlug: req.params.postSlug })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      success: true,
      comments: comments.map((c) => ({
        id: c._id.toString(),
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        text: c.text,
        date: c.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch comments' });
  }
});

// Require full format: local@domain.tld with TLD at least 2 chars (e.g. .com, .co.uk)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST /api/blog/:postSlug/comments
router.post('/:postSlug/comments', async (req, res) => {
  try {
    const { authorName, authorEmail, text } = req.body;
    const postSlug = req.params.postSlug;
    if (!authorName || !text || !postSlug) {
      return res.status(400).json({ success: false, error: 'Name and comment text are required' });
    }
    const email = authorEmail ? String(authorEmail).trim() : '';
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, error: 'Enter a full email address (e.g. abc@email.com). The part after the last dot must be at least 2 letters.' });
    }
    const comment = new BlogComment({
      postSlug,
      authorName: String(authorName).trim(),
      authorEmail: email,
      text: String(text).trim()
    });
    await comment.save();
    res.status(201).json({
      success: true,
      comment: {
        id: comment._id.toString(),
        authorName: comment.authorName,
        authorEmail: comment.authorEmail,
        text: comment.text,
        date: comment.createdAt
      }
    });
  } catch (error) {
    console.error('Error posting comment:', error);
    res.status(500).json({ success: false, error: 'Failed to post comment' });
  }
});

module.exports = router;
