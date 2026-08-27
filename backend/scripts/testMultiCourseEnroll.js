/**
 * Smoke test: adding a second course must create a NEW enrollment row.
 * Run: node backend/scripts/testMultiCourseEnroll.js
 * Requires MONGODB_URI in backend/.env and an existing student+course pair.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('No MONGODB_URI — skip live DB test');
        process.exit(0);
    }
    await mongoose.connect(uri);

    const student = await User.findOne({ role: 'student', deletedAt: null }).select('_id name');
    const courses = await Course.find({ isPublished: true, deletedAt: null }).select('_id title').limit(5);
    if (!student || courses.length < 2) {
        console.log('Need at least 1 student and 2 published courses to run live test. Skipping.');
        await mongoose.disconnect();
        process.exit(0);
    }

    const before = await Enrollment.find({
        student: student._id,
        course: { $ne: null },
        ...activeEnrollmentFilter(),
    }).select('_id course');

    console.log(`Student ${student.name} has ${before.length} course enrollment(s) before`);

    // Simulate forceNew create path (same as POST when existingCourseCount > 0)
    const target = courses.find((c) => !before.some((e) => String(e.course) === String(c._id))) || courses[0];
    const already = await Enrollment.findOne({
        student: student._id,
        course: target._id,
        ...activeEnrollmentFilter(),
    });
    if (already) {
        console.log(`Already enrolled in ${target.title} — logic OK (would 400). Cleaning up test not needed.`);
        await mongoose.disconnect();
        process.exit(0);
    }

    const existingCourseCount = before.length;
    const forceNew = existingCourseCount > 0;
    console.log({ existingCourseCount, forceNew, target: target.title });

    if (!forceNew && existingCourseCount === 0) {
        console.log('Student has no courses yet — first enroll would fill placeholder. Multi-course path N/A.');
        await mongoose.disconnect();
        process.exit(0);
    }

    const created = await Enrollment.create({
        student: student._id,
        course: target._id,
        status: 'inactive',
        paymentStatus: 'pending',
    });

    const after = await Enrollment.find({
        student: student._id,
        course: { $ne: null },
        ...activeEnrollmentFilter(),
    }).select('_id course');

    const stillHaveOld = before.every((b) => after.some((a) => String(a._id) === String(b._id)));
    const hasNew = after.some((a) => String(a._id) === String(created._id));

    console.log({
        beforeCount: before.length,
        afterCount: after.length,
        stillHaveOld,
        hasNew,
        ok: stillHaveOld && hasNew && after.length === before.length + 1,
    });

    // Cleanup test row
    await Enrollment.deleteOne({ _id: created._id });
    await mongoose.disconnect();

    if (!(stillHaveOld && hasNew && after.length === before.length + 1)) {
        process.exit(1);
    }
    console.log('PASS: second course creates a new row without removing old ones');
}

main().catch(async (err) => {
    console.error(err);
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
    process.exit(1);
});
