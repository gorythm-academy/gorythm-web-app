require('dotenv').config();
const mongoose = require('mongoose');
const ResearchPost = require('../models/ResearchPost');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);

    const all = await ResearchPost.find({}).sort({ updatedAt: -1 }).lean();
    console.log('=== All research posts ===');
    for (const p of all) {
        console.log('\n---');
        console.log('title:', p.title);
        console.log('slug:', p.slug);
        console.log('deletedAt:', p.deletedAt || null);
        console.log('imagePath:', p.imagePath || '(empty)');
        console.log('contentFormat:', p.contentFormat);
        console.log('content length:', (p.content || '').length);
        console.log('excerpt:', (p.excerpt || '').slice(0, 120));
        if (p.contentFormat === 'series-table' && p.seriesData) {
            const topics = p.seriesData.topics || [];
            console.log('series topics:', topics.length);
            topics.forEach((t, i) => {
                const events = t.events || t.sections || [];
                console.log(`  topic ${i + 1}:`, t.title || t.name || '(no title)', '| events:', events.length);
            });
        }
    }

    const trashed = await ResearchPost.find({ deletedAt: { $exists: true, $ne: null } }).lean();
    console.log('\n=== Trashed posts ===', trashed.length);
    for (const p of trashed) {
        console.log('-', p.title, '| slug:', p.slug, '| deleted:', p.deletedAt);
        console.log('  imagePath:', p.imagePath || '(empty)');
        console.log('  content length:', (p.content || '').length);
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
