const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { cleanupTeacherOnTrash } = require('./cleanupTeacherOnTrash');
const { syncStudentUserLoginFromAllEnrollments } = require('./syncStudentAccountLogin');

async function softTrashUser(user) {
    if (!user || user.deletedAt) return user;

    user.deletedAt = new Date();
    user.isActive = false;
    user.canLogin = false;
    user.status = 'inactive';
    user.updatedAt = Date.now();
    await user.save();

    if (user.role === 'teacher') {
        await cleanupTeacherOnTrash(user._id);
    }

    if (user.role === 'student') {
        const enrollments = await Enrollment.find({
            student: user._id,
            ...activeEnrollmentFilter(),
        }).select('course');

        const courseIds = enrollments.map((e) => e.course).filter(Boolean);
        if (courseIds.length) {
            await Course.updateMany(
                { _id: { $in: courseIds } },
                { $pull: { students: user._id } }
            );
        }

        await Enrollment.updateMany(
            { student: user._id, ...activeEnrollmentFilter() },
            { $set: { deletedAt: new Date() } }
        );

        await User.findByIdAndUpdate(user._id, { $set: { enrolledCourses: [] } });
    }

    return user;
}

/**
 * Restore student account. Re-activates enrollments that were soft-deleted with the user,
 * re-links course rosters, and syncs portal login. Skips restoring a course row when an
 * active twin already exists (keeps that row quarantined to avoid duplicates).
 */
async function restoreTrashedUser(user) {
    if (!user || !user.deletedAt) return user;

    user.deletedAt = null;
    const loginAllowed = user.status === 'active' || user.status === 'completed';
    user.isActive = loginAllowed;
    user.canLogin = loginAllowed;
    user.updatedAt = Date.now();
    await user.save();

    if (user.role === 'student') {
        const trashed = await Enrollment.find({
            student: user._id,
            deletedAt: { $exists: true, $ne: null },
        }).select('_id course');

        for (const row of trashed) {
            if (row.course) {
                const twin = await Enrollment.findOne({
                    student: user._id,
                    course: row.course,
                    _id: { $ne: row._id },
                    ...activeEnrollmentFilter(),
                }).select('_id');
                if (twin) continue;
            }

            await Enrollment.updateOne({ _id: row._id }, { $set: { deletedAt: null } });

            if (row.course) {
                await Course.findByIdAndUpdate(row.course, {
                    $addToSet: { students: user._id },
                });
                await User.findByIdAndUpdate(user._id, {
                    $addToSet: { enrolledCourses: row.course },
                });
            }
        }

        await syncStudentUserLoginFromAllEnrollments(user._id);
    }

    return user;
}

module.exports = { softTrashUser, restoreTrashedUser };
