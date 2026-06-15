const User = require('../models/User');

/** Mirror enrollment access status onto the student portal account. */
async function syncStudentUserLoginFromEnrollmentStatus(studentUserId, enrollmentStatus) {
    if (!studentUserId) return null;

    const user = await User.findById(studentUserId);
    if (!user || user.role !== 'student') return null;

    if (enrollmentStatus === 'active') {
        user.status = 'active';
        user.isActive = true;
        user.canLogin = true;
    } else if (enrollmentStatus === 'inactive' || enrollmentStatus === 'pending') {
        user.status = 'inactive';
        user.isActive = false;
        user.canLogin = false;
    } else if (enrollmentStatus === 'completed') {
        user.status = 'completed';
        user.isActive = true;
        user.canLogin = true;
    }

    user.updatedAt = Date.now();
    await user.save();
    return user;
}

module.exports = { syncStudentUserLoginFromEnrollmentStatus };
