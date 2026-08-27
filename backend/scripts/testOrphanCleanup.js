/**
 * Test removeOrphanEnrollmentRows safety — must NOT delete valid enrollments.
 * Run: node backend/scripts/testOrphanCleanup.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');

const { removeOrphanEnrollmentRows } = require('../utils/enrollmentOrphanCleanup');

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('No MONGODB_URI');
        process.exit(1);
    }
    await mongoose.connect(uri);

    const students = await User.find({ role: 'student', deletedAt: null }).limit(3);
    const course = await Course.findOne({ deletedAt: null }).select('_id title');
    if (!students.length || !course) {
        console.log('Need students and a course');
        await mongoose.disconnect();
        process.exit(0);
    }

    const created = [];
    for (const s of students) {
        const row = await Enrollment.create({
            student: s._id,
            course: course._id,
            status: 'inactive',
            paymentStatus: 'pending',
        });
        created.push(row._id);
    }

    const before = await Enrollment.countDocuments({ _id: { $in: created } });
    console.log('Created test rows:', before);

    const result = await removeOrphanEnrollmentRows();
    console.log('Orphan cleanup deletedCount:', result.deletedCount);

    const after = await Enrollment.countDocuments({ _id: { $in: created } });
    console.log('Remaining test rows:', after);

    // Cleanup
    await Enrollment.deleteMany({ _id: { $in: created } });
    await mongoose.disconnect();

    if (after !== before) {
        console.error('FAIL: orphan cleanup removed valid enrollments');
        process.exit(1);
    }
    console.log('PASS: orphan cleanup preserved valid enrollments');
}

main().catch(async (err) => {
    console.error(err);
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
    process.exit(1);
});
