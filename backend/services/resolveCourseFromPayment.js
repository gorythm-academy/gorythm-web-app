const Course = require('../models/Course');

function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve course id from payment.course or payment.courseName (case-insensitive title). */
async function resolveAndLinkCourseOnPayment(payment) {
    if (!payment) return null;

    let courseId = payment.course?._id || payment.course;
    if (courseId) return courseId;

    const title = String(payment.courseName || '').trim();
    if (!title) return null;

    const course = await Course.findOne({
        title: { $regex: new RegExp(`^${escapeRegex(title)}$`, 'i') },
    }).select('_id title');

    if (course) {
        payment.course = course._id;
        if (!payment.courseName) payment.courseName = course.title;
        await payment.save();
        return course._id;
    }

    return null;
}

module.exports = { resolveAndLinkCourseOnPayment };
