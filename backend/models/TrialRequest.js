const mongoose = require('mongoose');

const trialRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    courseTitle: { type: String, required: true, trim: true, maxlength: 160 },
    courseSlug: { type: String, trim: true, maxlength: 160, default: '' },
    preferredTime: { type: String, trim: true, maxlength: 200, default: '' },
    consent: { type: Boolean, required: true },
    status: {
      type: String,
      enum: ['new', 'contacted'],
      default: 'new',
    },
    reply: { type: String, trim: true, maxlength: 5000, default: '' },
    repliedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

trialRequestSchema.index({ createdAt: -1 });
trialRequestSchema.index({ status: 1, createdAt: -1 });
trialRequestSchema.index({ deletedAt: 1, createdAt: -1 });

module.exports = mongoose.model('TrialRequest', trialRequestSchema);
