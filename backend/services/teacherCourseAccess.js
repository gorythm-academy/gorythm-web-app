const Course = require('../models/Course');
const ClassSchedule = require('../models/ClassSchedule');
const { activeCourseFilter } = require('../utils/courseQuery');

async function teacherCanAccessCourse(teacherId, courseId) {
    if (!teacherId || !courseId) return false;

    const asInstructor = await Course.findOne({
        _id: courseId,
        instructor: teacherId,
        ...activeCourseFilter(),
    }).select('_id');

    if (asInstructor) return true;

    const onSchedule = await ClassSchedule.exists({ course: courseId, teacher: teacherId });
    if (!onSchedule) return false;

    const courseActive = await Course.findOne({ _id: courseId, ...activeCourseFilter() }).select('_id');
    return Boolean(courseActive);
}

async function assertTeacherOwnsCourse(teacherId, courseId) {
    const allowed = await teacherCanAccessCourse(teacherId, courseId);
    if (!allowed) {
        const err = new Error('Not your course');
        err.status = 403;
        throw err;
    }
    return Course.findById(courseId);
}

async function getTeacherCourseIds(teacherId) {
    if (!teacherId) return [];

    const instructorIds = await Course.find({
        instructor: teacherId,
        ...activeCourseFilter(),
    }).distinct('_id');

    const scheduleCourseIds = await ClassSchedule.find({ teacher: teacherId }).distinct('course');
    const scheduleActive = scheduleCourseIds.length
        ? await Course.find({ _id: { $in: scheduleCourseIds }, ...activeCourseFilter() }).distinct('_id')
        : [];

    const merged = new Set([
        ...instructorIds.map(String),
        ...scheduleActive.map(String),
    ]);
    return [...merged];
}

module.exports = {
    teacherCanAccessCourse,
    assertTeacherOwnsCourse,
    getTeacherCourseIds,
};
