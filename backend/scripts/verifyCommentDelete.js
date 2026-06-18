/**
 * Verify research comments are hard-deleted from MongoDB.
 * Usage: node scripts/verifyCommentDelete.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const BlogComment = require('../models/BlogComment');

async function main() {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
    await mongoose.connect(process.env.MONGODB_URI);

    const test = await BlogComment.create({
        postSlug: '__delete-test-slug__',
        authorName: 'Delete Test',
        authorEmail: 'test@example.com',
        text: 'temporary comment for delete verification',
    });
    const id = test._id;
    console.log('Created:', id.toString());

    const before = await BlogComment.countDocuments({ _id: id });
    const del = await BlogComment.deleteMany({ _id: { $in: [id] } });
    const after = await BlogComment.countDocuments({ _id: id });
    const publicList = await BlogComment.find({ postSlug: '__delete-test-slug__' }).lean();

    console.log('Before delete:', before);
    console.log('deleteMany deletedCount:', del.deletedCount);
    console.log('After delete:', after);
    console.log('Public slug query length:', publicList.length);

    await mongoose.disconnect();

    const ok = before === 1 && del.deletedCount === 1 && after === 0 && publicList.length === 0;
    if (!ok) {
        console.error('VERIFICATION FAILED');
        process.exit(1);
    }
    console.log('VERIFICATION PASSED: hard delete from MongoDB');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
