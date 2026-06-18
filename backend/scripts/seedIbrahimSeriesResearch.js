/**
 * Seed Ibrahim Series Research as the 3rd research post (series-table format).
 * Usage: node scripts/seedIbrahimSeriesResearch.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ResearchPost = require('../models/ResearchPost');
const ibrahimData = require('../data/ibrahimSeriesResearch');

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const payload = {
        title: ibrahimData.title,
        slug: ibrahimData.slug,
        excerpt: ibrahimData.excerpt,
        content: '',
        contentFormat: 'series-table',
        seriesData: { topics: ibrahimData.topics },
        imagePath: '',
        category: 'Islamic Studies',
        tags: ibrahimData.tags,
        author: ibrahimData.author,
        publishedAt: new Date(),
        isPublished: true,
        deletedAt: null,
    };

    const existing = await ResearchPost.findOne({ slug: ibrahimData.slug });
    if (existing) {
        existing.title = payload.title;
        existing.excerpt = payload.excerpt;
        existing.contentFormat = payload.contentFormat;
        existing.seriesData = payload.seriesData;
        existing.tags = payload.tags;
        existing.author = payload.author;
        existing.isPublished = true;
        existing.deletedAt = null;
        await existing.save();
        console.log('Updated existing Ibrahim Series post:', existing._id.toString());
    } else {
        const doc = await ResearchPost.create(payload);
        console.log('Created Ibrahim Series post:', doc._id.toString());
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
