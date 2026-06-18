const mongoose = require('mongoose');

const researchPostSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true, index: true, trim: true },
        excerpt: { type: String, default: '', trim: true },
        content: { type: String, default: '' },
        contentFormat: {
            type: String,
            enum: ['article', 'series-table'],
            default: 'article',
        },
        seriesData: { type: mongoose.Schema.Types.Mixed, default: null },
        imagePath: { type: String, default: '' },
        category: { type: String, default: 'General', trim: true },
        tags: { type: [String], default: [] },
        author: { type: String, default: 'Gorythm Team', trim: true },
        publishedAt: { type: Date, default: Date.now },
        isPublished: { type: Boolean, default: true },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('ResearchPost', researchPostSchema);
