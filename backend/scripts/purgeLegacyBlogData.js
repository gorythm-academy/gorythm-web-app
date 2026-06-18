/**
 * Remove trashed research posts and orphaned research-images not referenced in DB.
 * Keeps active ResearchPost documents and their image files.
 *
 * Usage: node scripts/purgeLegacyBlogData.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ResearchPost = require('../models/ResearchPost');
const BlogComment = require('../models/BlogComment');
const { IMAGE_DIR, imageAbsolutePathFromPublic } = require('../utils/researchImageStorage');

const KEEP_SLUGS = new Set([
    'expansion-of-universe',
    'the-meeting-of-the-two-seas',
]);

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const trashed = await ResearchPost.deleteMany({ deletedAt: { $exists: true, $ne: null } });
    const removedPosts = await ResearchPost.deleteMany({ slug: { $nin: [...KEEP_SLUGS] } });
    const comments = await BlogComment.deleteMany({});

    const kept = await ResearchPost.find({}).lean();
    const keepPaths = new Set(
        kept.map((p) => p.imagePath).filter(Boolean)
    );

    let deletedFiles = 0;
    if (fs.existsSync(IMAGE_DIR)) {
        for (const name of fs.readdirSync(IMAGE_DIR)) {
            const publicPath = `/api/uploads/research-images/${name}`;
            if (!keepPaths.has(publicPath)) {
                const abs = imageAbsolutePathFromPublic(publicPath);
                if (abs && fs.existsSync(abs)) {
                    fs.unlinkSync(abs);
                    deletedFiles += 1;
                }
            }
        }
    }

    console.log(JSON.stringify({
        trashedResearchPostsRemoved: trashed.deletedCount,
        extraResearchPostsRemoved: removedPosts.deletedCount,
        blogCommentsRemoved: comments.deletedCount,
        researchImagesDeleted: deletedFiles,
        keptPosts: kept.map((p) => ({ title: p.title, slug: p.slug, imagePath: p.imagePath })),
    }, null, 2));

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
