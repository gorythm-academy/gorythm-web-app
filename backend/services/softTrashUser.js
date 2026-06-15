const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { cleanupTeacherOnTrash } = require('./cleanupTeacherOnTrash');

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
    }

    return user;
}

async function restoreTrashedUser(user) {
    if (!user || !user.deletedAt) return user;

    user.deletedAt = null;
    const loginAllowed = user.status === 'active' || user.status === 'completed';
    user.isActive = loginAllowed;
    user.canLogin = loginAllowed;
    user.updatedAt = Date.now();
    await user.save();

    if (user.role === 'student') {
        await Enrollment.updateMany(
            { student: user._id, deletedAt: { $exists: true, $ne: null } },
            { $set: { deletedAt: null } }
        );
    }

    return user;
}

module.exports = { softTrashUser, restoreTrashedUser };
