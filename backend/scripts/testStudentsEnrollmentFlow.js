/**
 * Full enrollment flow test: orphan cleanup safety, multi-course add, reconcile.
 * Run: node backend/scripts/testStudentsEnrollmentFlow.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { buildVisibleListFilter } = require('../utils/enrollmentAdminList');
const {
    removeOrphanEnrollmentRows,
    reconcileMissingEnrollmentRows,
} = require('../utils/enrollmentOrphanCleanup');

async function simulateAddCoursePost(student, courseId, existingCourseCount) {
    const forceNew = existingCourseCount > 0;
    if (forceNew) {
        return Enrollment.create({
            student: student._id,
            course: courseId,
            status: 'inactive',
            paymentStatus: 'pending',
        });
    }
    const placeholder = await Enrollment.findOne({
        student: student._id,
        $or: [{ course: null }, { course: { $exists: false } }],
        ...activeEnrollmentFilter(),
    });
    if (placeholder) {
        placeholder.course = courseId;
        await placeholder.save();
        return placeholder;
    }
    return Enrollment.create({
        student: student._id,
        course: courseId,
        status: 'inactive',
        paymentStatus: 'pending',
    });
}

async function main() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('No MONGODB_URI');
        process.exit(1);
    }
    await mongoose.connect(uri);

    const student = await User.findOne({ role: 'student', deletedAt: null });
    const courses = await Course.find({ isPublished: true, deletedAt: null }).limit(3);
    if (!student || courses.length < 2) {
        console.log('Need 1 student and 2 published courses — skip');
        await mongoose.disconnect();
        process.exit(0);
    }

    const createdIds = [];
    const cleanup = async () => {
        if (createdIds.length) await Enrollment.deleteMany({ _id: { $in: createdIds } });
    };

    try {
        // 1) First course
        const first = await simulateAddCoursePost(student, courses[0]._id, 0);
        createdIds.push(first._id);

        // 2) Second course (forceNew path)
        const beforeSecond = await Enrollment.countDocuments({
            student: student._id,
            ...activeEnrollmentFilter(),
        });
        const second = await simulateAddCoursePost(student, courses[1]._id, beforeSecond);
        createdIds.push(second._id);

        const afterSecond = await Enrollment.countDocuments({
            student: student._id,
            ...activeEnrollmentFilter(),
        });
        if (afterSecond !== beforeSecond + 1) {
            throw new Error(`Expected ${beforeSecond + 1} rows after add course, got ${afterSecond}`);
        }
        console.log('PASS: add second course creates new row');

        // 3) Orphan cleanup must not remove valid rows
        const orphanResult = await removeOrphanEnrollmentRows();
        const afterOrphan = await Enrollment.countDocuments({ _id: { $in: createdIds } });
        if (afterOrphan !== createdIds.length) {
            throw new Error(`Orphan cleanup removed valid rows (deleted ${orphanResult.deletedCount})`);
        }
        console.log('PASS: orphan cleanup preserves valid enrollments');

        // 4) String student ref must not cause ObjectId rows to be wiped
        const col = mongoose.connection.collection('enrollments');
        const stringInsert = await col.insertOne({
            student: String(student._id),
            course: courses[0]._id,
            status: 'inactive',
            paymentStatus: 'pending',
            enrollmentDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        await removeOrphanEnrollmentRows();
        const stringRowGone = (await col.countDocuments({ _id: stringInsert.insertedId })) === 0;
        const objectRowsOk = (await Enrollment.countDocuments({ _id: { $in: createdIds } })) === createdIds.length;
        await col.deleteOne({ _id: stringInsert.insertedId }).catch(() => {});
        if (!objectRowsOk) throw new Error('Orphan cleanup wiped ObjectId rows when string ref existed');
        console.log('PASS: ObjectId rows safe even with legacy string ref present', { stringRowGone });

        // 5) Visible list filter includes rows
        const filter = await buildVisibleListFilter({ ...activeEnrollmentFilter() }, false);
        const visible = await Enrollment.countDocuments({
            ...filter,
            _id: { $in: createdIds },
        });
        if (visible !== createdIds.length) {
            throw new Error(`Visible filter hid enrollments: ${visible}/${createdIds.length}`);
        }
        console.log('PASS: buildVisibleListFilter shows enrollments');

        // 6) Roster sync rebuilds User.enrolledCourses from enrollment rows
        const User = require('../models/User');
        const studentDoc = await User.findById(student._id).select('enrolledCourses');
        const courseId = courses[0]._id;
        await User.findByIdAndUpdate(student._id, { $set: { enrolledCourses: [] } });
        await Enrollment.create({
            student: student._id,
            course: courseId,
            status: 'inactive',
            paymentStatus: 'pending',
        });
        const { syncAllRostersFromEnrollments } = require('../utils/enrollmentOrphanCleanup');
        await syncAllRostersFromEnrollments();
        const afterSync = await User.findById(student._id).select('enrolledCourses');
        if (!afterSync.enrolledCourses?.length) {
            throw new Error('Roster sync failed to rebuild enrolledCourses');
        }
        await Enrollment.deleteMany({ student: student._id, course: courseId });
        await syncAllRostersFromEnrollments();
        console.log('PASS: roster sync derives User.enrolledCourses from enrollments');

        console.log('\nAll enrollment flow tests passed.');
    } finally {
        await cleanup();
        await mongoose.disconnect();
    }
}

main().catch(async (err) => {
    console.error('FAIL:', err.message || err);
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
    process.exit(1);
});
