require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
require('../models/Course');
const { activeEnrollmentFilter, trashedEnrollmentFilter } = require('../utils/enrollmentQuery');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const students = await User.find({ role: 'student' }).select('name studentId enrolledCourses');
    for (const s of students) {
        const active = await Enrollment.find({ student: s._id, ...activeEnrollmentFilter() })
            .populate('course', 'title')
            .select('course status paymentStatus');
        const trash = await Enrollment.find({ student: s._id, ...trashedEnrollmentFilter() })
            .populate('course', 'title')
            .select('course status');
        const activeIds = new Set(active.map((e) => String(e.course?._id || e.course)));
        const overlap = trash.filter((e) => activeIds.has(String(e.course?._id || e.course)));
        console.log({
            name: s.name,
            roll: s.studentId,
            rosterLen: (s.enrolledCourses || []).length,
            active: active.map((e) => `${e.course?.title}[${e.status}/${e.paymentStatus}]`),
            trash: trash.map((e) => e.course?.title),
            overlap: overlap.map((e) => e.course?.title),
        });
    }
    await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
