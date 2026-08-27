require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const { activeEnrollmentFilter, trashedEnrollmentFilter } = require('../utils/enrollmentQuery');
const { buildVisibleListFilter } = require('../utils/enrollmentAdminList');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const total = await Enrollment.countDocuments({});
    const active = await Enrollment.countDocuments(activeEnrollmentFilter());
    const trashed = await Enrollment.countDocuments(trashedEnrollmentFilter());
    const filter = await buildVisibleListFilter({ ...activeEnrollmentFilter() }, false);
    const visible = await Enrollment.countDocuments(filter);
    const students = await User.find({ role: 'student' }).select('name deletedAt canLogin status');
    const all = await Enrollment.find({})
        .populate('student', 'name deletedAt')
        .populate('course', 'title deletedAt isPublished')
        .lean();

    console.log('Counts:', { total, active, trashed, visible, studentUsers: students.length });
    console.log('Students:', students.map((s) => ({ name: s.name, deletedAt: s.deletedAt, status: s.status })));
    console.log('Enrollments:');
    for (const e of all) {
        console.log({
            id: String(e._id),
            student: e.student?.name,
            studentDeleted: !!e.student?.deletedAt,
            course: e.course?.title || 'NULL',
            courseDeleted: !!e.course?.deletedAt,
            coursePublished: e.course?.isPublished,
            enrollmentDeletedAt: e.deletedAt,
            status: e.status,
        });
    }
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
