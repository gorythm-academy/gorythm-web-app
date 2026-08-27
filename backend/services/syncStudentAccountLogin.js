const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');

const { normalizeEnrollmentStatus } = require('../utils/enrollmentStatus');

const normalizeStatus = (status) => normalizeEnrollmentStatus(status);

/** Derive portal access from all active enrollment rows with a course assigned. */
async function syncStudentUserLoginFromAllEnrollments(studentUserId) {
    if (!studentUserId) return null;

    const user = await User.findById(studentUserId);
    if (!user || user.role !== 'student') return null;

    const enrollments = await Enrollment.find({
        student: studentUserId,
        ...activeEnrollmentFilter(),
        course: { $ne: null },
    }).select('status course');

    const statuses = enrollments.map((row) => normalizeStatus(row.status));

    let derived = 'inactive';
    if (statuses.some((s) => s === 'active')) {
        derived = 'active';
    } else if (statuses.some((s) => s === 'completed')) {
        derived = 'completed';
    }

    if (derived === 'active') {
        user.status = 'active';
        user.isActive = true;
        user.canLogin = true;
    } else if (derived === 'completed') {
        user.status = 'completed';
        user.isActive = true;
        user.canLogin = true;
    } else {
        user.status = 'inactive';
        user.isActive = false;
        user.canLogin = false;
    }

    user.updatedAt = Date.now();
    await user.save();
    return user;
}

/** @deprecated Use syncStudentUserLoginFromAllEnrollments — kept for call-site compatibility. */
async function syncStudentUserLoginFromEnrollmentStatus(studentUserId) {
    return syncStudentUserLoginFromAllEnrollments(studentUserId);
}

module.exports = {
    syncStudentUserLoginFromAllEnrollments,
    syncStudentUserLoginFromEnrollmentStatus,
};
