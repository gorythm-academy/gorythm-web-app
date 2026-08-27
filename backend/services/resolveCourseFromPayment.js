const Course = require('../models/Course');
const { activeCourseFilter } = require('../utils/courseQuery');

function escapeRegex(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const activePublishedCourseQuery = () => ({
    isPublished: true,
    ...activeCourseFilter(),
});

/** Resolve course id from payment.course (validated) or unique payment.courseName match. */
async function resolveAndLinkCourseOnPayment(payment) {
    if (!payment) return null;

    const storedCourseId = payment.course?._id || payment.course;
    if (storedCourseId) {
        const course = await Course.findOne({
            _id: storedCourseId,
            ...activePublishedCourseQuery(),
        }).select('_id title');
        if (!course) return null;
        return course._id;
    }

    const title = String(payment.courseName || '').trim();
    if (!title) return null;

    const matches = await Course.find({
        title: { $regex: new RegExp(`^${escapeRegex(title)}$`, 'i') },
        ...activePublishedCourseQuery(),
    })
        .select('_id title')
        .limit(2);

    if (!matches.length) return null;
    if (matches.length > 1) {
        throw new Error(
            'Multiple courses match this payment title. Set the correct course on the payment record before approving.'
        );
    }

    const course = matches[0];
    payment.course = course._id;
    if (!payment.courseName) payment.courseName = course.title;
    await payment.save();
    return course._id;
}

module.exports = { resolveAndLinkCourseOnPayment };
