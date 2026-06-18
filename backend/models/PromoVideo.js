const mongoose = require('mongoose');

const promoVideoSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        videoUrl: { type: String, required: true, trim: true },
        provider: { type: String, enum: ['vimeo', 'youtube'], required: true },
        videoId: { type: String, required: true },
        embedSrc: { type: String, required: true },
        thumbnailPath: { type: String, default: '', trim: true },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

promoVideoSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PromoVideo', promoVideoSchema);
