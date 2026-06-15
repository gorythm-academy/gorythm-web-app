const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');

/** Remove student user and all enrollments when no enrollment rows remain. */
async function deleteStudentUserCompletely(studentUserId) {
    if (!studentUserId) return { deleted: false };

    const user = await User.findById(studentUserId).select('role');
    if (!user || user.role !== 'student') {
        return { deleted: false };
    }

    const remaining = await Enrollment.countDocuments({ student: studentUserId });
    if (remaining > 0) {
        return { deleted: false };
    }

    await Enrollment.deleteMany({ student: studentUserId });
    await Course.updateMany(
        { students: studentUserId },
        { $pull: { students: studentUserId } }
    );
    await User.findByIdAndDelete(studentUserId);

    return { deleted: true };
}

module.exports = { deleteStudentUserCompletely };
