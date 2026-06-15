const Course = require('../models/Course');
const ClassSchedule = require('../models/ClassSchedule');
const Enrollment = require('../models/Enrollment');

/** Remove stale teacher references when a teacher account is trashed or deleted. */
async function cleanupTeacherOnTrash(teacherId) {
    if (!teacherId) return;

    await Course.updateMany({ instructor: teacherId }, { $set: { instructorName: '' } });

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
