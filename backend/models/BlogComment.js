const mongoose = require('mongoose');

const blogCommentSchema = new mongoose.Schema({
  postSlug: { type: String, required: true, index: true },
  authorName: { type: String, required: true },
  authorEmail: { type: String, default: '' },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BlogComment', blogCommentSchema);
