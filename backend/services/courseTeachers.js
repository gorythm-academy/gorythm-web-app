const Course = require('../models/Course');
const ClassSchedule = require('../models/ClassSchedule');
const { isUserTrashed } = require('../utils/userQuery');
const { teacherIdsOnCourse } = require('../utils/courseInstructors');

const TEACHER_SELECT = 'name email deletedAt';

/**
 * Teachers linked to the course (instructors list + legacy instructor),
 * then any teachers who only appear on class schedules.
 */
async function getTeachersForCourse(courseId) {
    if (!courseId) return [];

    const byId = new Map();

    const course = await Course.findById(courseId)
        .populate('instructor', TEACHER_SELECT)
        .populate('instructors', TEACHER_SELECT)
        .select('instructor instructorName instructors');

    if (course) {
        for (const t of course.instructors || []) {
            if (!t?._id || isUserTrashed(t)) continue;
            byId.set(String(t._id), {
                _id: t._id,
                name: t.name || 'Teacher',
                email: t.email || '',
            });
        }
        if (course.instructor?._id && !isUserTrashed(course.instructor)) {
            byId.set(String(course.instructor._id), {
                _id: course.instructor._id,
                name: course.instructor.name || course.instructorName || 'Instructor',
                email: course.instructor.email || '',
            });
        }
    }

    const schedules = await ClassSchedule.find({ course: courseId }).populate('teacher', TEACHER_SELECT);
    for (const row of schedules) {
        if (!row.teacher?._id || isUserTrashed(row.teacher)) continue;
        if (byId.has(String(row.teacher._id))) continue;
        byId.set(String(row.teacher._id), {
            _id: row.teacher._id,
            name: row.teacher.name || 'Teacher',
            email: row.teacher.email || '',
        });
    }

    return [...byId.values()];
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
    teacherIdsOnCourse,
};
