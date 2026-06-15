const Course = require('../models/Course');
const ClassSchedule = require('../models/ClassSchedule');
const { isUserTrashed } = require('../utils/userQuery');

const TEACHER_SELECT = 'name email deletedAt';

/** Teachers actually assigned on the class schedule; falls back to course instructor only when no schedule rows. */
async function getTeachersForCourse(courseId) {
    if (!courseId) return [];

    const schedules = await ClassSchedule.find({ course: courseId }).populate('teacher', TEACHER_SELECT);
    const byId = new Map();

    for (const row of schedules) {
        if (!row.teacher?._id || isUserTrashed(row.teacher)) continue;
        byId.set(String(row.teacher._id), {
            _id: row.teacher._id,
            name: row.teacher.name || 'Teacher',
            email: row.teacher.email || '',
        });
    }

    if (byId.size > 0) {
        return [...byId.values()];
    }

    const course = await Course.findById(courseId)
        .populate('instructor', TEACHER_SELECT)
        .select('instructor instructorName');
    if (course?.instructor?._id && !isUserTrashed(course.instructor)) {
        return [{
            _id: course.instructor._id,
            name: course.instructor.name || 'Instructor',
            email: course.instructor.email || '',
        }];
    }
    return [];
}

async function getTeachersByCourseIds(courseIds) {
    const unique = [...new Set((courseIds || []).map((id) => String(id)).filter(Boolean))];
    const out = {};
    await Promise.all(
        unique.map(async (id) => {
            out[id] = await getTeachersForCourse(id);
        })
    );
    return out;
}

async function attachTeachersToEnrollments(enrollments) {
    const docs = enrollments.map((e) => (e.toObject ? e.toObject() : { ...e }));
    const courseIds = docs.filter((e) => e.course?._id).map((e) => e.course._id);
    const map = await getTeachersByCourseIds(courseIds);
    return docs.map((e) => {
        const cid = e.course?._id ? String(e.course._id) : '';
        return { ...e, courseTeachers: cid ? map[cid] || [] : [] };
    });
}

module.exports = {
    getTeachersForCourse,
    getTeachersByCourseIds,
    attachTeachersToEnrollments,
};
