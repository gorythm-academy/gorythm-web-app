const mongoose = require('mongoose');

const researchCommentSchema = new mongoose.Schema({
  postSlug: { type: String, required: true, index: true },
  authorName: { type: String, required: true },
  authorEmail: { type: String, default: '' },
  text: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved'], default: 'approved', index: true },
  adminReply: { type: String, default: '' },
  repliedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ResearchComment', researchCommentSchema, 'blogcomments');
