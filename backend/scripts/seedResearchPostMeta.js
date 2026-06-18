/**
 * Fill tags and excerpts for the two article-format research papers.
 * Usage: node scripts/seedResearchPostMeta.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ResearchPost = require('../models/ResearchPost');

const META = [
    {
        slug: 'expansion-of-universe',
        excerpt:
            'A study of Surah Adh-Dhariyat 51:47 and Al-Anbiya 21:30 alongside modern astrophysical evidence for the expanding universe.',
        tags: ['quran', 'cosmology', 'universe', 'astrophysics', 'science', 'tafsir'],
    },
    {
        slug: 'the-meeting-of-the-two-seas',
        excerpt:
            'Classical tafsir and modern science on Surah Ar-Rahman 55:19–20 — the two seas, their meeting, and the barrier between them.',
        tags: ['quran', 'oceanography', 'ar-rahman', 'barzakh', 'tafsir', 'science'],
    },
];

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    for (const item of META) {
        const doc = await ResearchPost.findOneAndUpdate(
            { slug: item.slug },
            { $set: { excerpt: item.excerpt, tags: item.tags } },
            { new: true }
        );
        if (doc) {
            console.log(`Updated ${item.slug}`);
        } else {
            console.warn(`Post not found: ${item.slug}`);
        }
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
