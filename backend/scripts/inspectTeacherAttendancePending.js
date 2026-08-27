require('dotenv').config();
const mongoose = require('mongoose');
require('../models/User');
const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    const dailyPending = await TeacherSelfAttendanceDay.find({
        approvalStatus: 'pending',
        submittedAt: { $ne: null },
    })
        .populate('teacher', 'name')
        .lean();
    const monthlyPending = await TeacherAttendanceRequest.find({ status: 'pending' })
        .populate('teacher', 'name')
        .lean();

    console.log('dailyPending count:', dailyPending.length);
    dailyPending.forEach((d) => {
        const date = d.date ? new Date(d.date).toISOString().slice(0, 10) : '?';
        const dow = d.date ? new Date(d.date).getDay() : '?';
        console.log('  daily:', date, 'dow', dow, 'teacher', d.teacher?.name, 'month', date.slice(0, 7));
    });
    console.log('monthlyPending count:', monthlyPending.length);
    monthlyPending.forEach((r) => {
        console.log('  monthly:', r.monthKey, 'teacher', r.teacher?.name);
    });
    console.log('badge would be:', dailyPending.length + monthlyPending.length);
    console.log('currentMonth:', new Date().toISOString().slice(0, 7));
    await mongoose.disconnect();
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
