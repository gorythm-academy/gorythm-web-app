const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');

/** Add one course to User.enrolledCourses and Course.students. */
async function addEnrollmentToRosters(studentUserId, courseId) {
    if (!studentUserId || !courseId) return;
    await User.findByIdAndUpdate(studentUserId, { $addToSet: { enrolledCourses: courseId } });
    await Course.findByIdAndUpdate(courseId, { $addToSet: { students: studentUserId } });
}

/** Remove one course from User.enrolledCourses and Course.students. */
async function removeEnrollmentFromRosters(studentUserId, courseId) {
    if (!studentUserId || !courseId) return;
    await User.findByIdAndUpdate(studentUserId, { $pull: { enrolledCourses: courseId } });
    await Course.findByIdAndUpdate(courseId, { $pull: { students: studentUserId } });
}

/**
 * Rebuild User.enrolledCourses + Course.students for one student from active enrollment rows.
 * Enrollment collection is the source of truth.
 */
async function syncStudentRosterFromEnrollments(studentUserId) {
    if (!studentUserId) return;

    const rows = await Enrollment.find({
        student: studentUserId,
        ...activeEnrollmentFilter(),
        course: { $ne: null, $exists: true },
    }).select('course');

    const courseIds = [...new Set(rows.map((r) => String(r.course)).filter(Boolean))];

    await User.findByIdAndUpdate(studentUserId, { $set: { enrolledCourses: courseIds } });

    await Course.updateMany(
        { students: studentUserId },
        { $pull: { students: studentUserId } }
    );

    if (courseIds.length) {
        await Course.updateMany(
            { _id: { $in: courseIds } },
            { $addToSet: { students: studentUserId } }
        );
    }
}

module.exports = {
    addEnrollmentToRosters,
    removeEnrollmentFromRosters,
    syncStudentRosterFromEnrollments,
};
