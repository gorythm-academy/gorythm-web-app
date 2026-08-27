const Course = require('../models/Course');
const ClassSchedule = require('../models/ClassSchedule');
const Enrollment = require('../models/Enrollment');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const { applyInstructorsToCourse, teacherIdsOnCourse } = require('../utils/courseInstructors');

/** Remove stale teacher references when a teacher account is trashed or deleted. */
async function cleanupTeacherOnTrash(teacherId) {
    if (!teacherId) return;

    const courses = await Course.find({
        $or: [{ instructor: teacherId }, { instructors: teacherId }],
    });

    for (const course of courses) {
        const remaining = teacherIdsOnCourse(course).filter((id) => id !== String(teacherId));
        await applyInstructorsToCourse(course, remaining, { requireAll: false });
        await course.save();
    }

    await TeacherSalaryProfile.deleteOne({ teacher: teacherId });

    const schedules = await ClassSchedule.find({ teacher: teacherId }).select('_id').lean();
    const scheduleIds = schedules.map((s) => s._id);
    if (!scheduleIds.length) return;

    await Enrollment.updateMany(
        { assignedSchedule: { $in: scheduleIds } },
        { $set: { assignedSchedule: null } }
    );
    await ClassSchedule.deleteMany({ teacher: teacherId });
}

module.exports = { cleanupTeacherOnTrash };
