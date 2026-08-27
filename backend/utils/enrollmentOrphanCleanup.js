const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');
const { syncStudentRosterFromEnrollments } = require('../services/enrollmentRosterSync');

const toObjectId = (value) => {
    if (!value) return null;
    const str = String(value);
    if (!mongoose.Types.ObjectId.isValid(str)) return null;
    return new mongoose.Types.ObjectId(str);
};

/**
 * Remove enrollment rows with no student, or whose student user no longer exists.
 * Uses explicit existence checks — never `{ student: { $nin: [...] } }`.
 * Run via admin script only — never on GET list.
 */
async function removeOrphanEnrollmentRows() {
    await Enrollment.deleteMany({
        $or: [{ student: null }, { student: { $exists: false } }],
    });

    const studentRefs = await Enrollment.distinct('student', { student: { $ne: null } });
    if (!studentRefs.length) return { deletedCount: 0 };

    for (const ref of studentRefs) {
        if (typeof ref !== 'string') continue;
        const oid = toObjectId(ref);
        if (!oid) continue;
        await Enrollment.updateMany({ student: ref }, { $set: { student: oid } });
    }

    const refreshedRefs = await Enrollment.distinct('student', { student: { $ne: null } });

    const normalizedIds = [...new Set(refreshedRefs.map(toObjectId).filter(Boolean).map(String))];
    if (!normalizedIds.length) {
        const invalidOnly = await Enrollment.deleteMany({ student: { $in: refreshedRefs } });
        return { deletedCount: invalidOnly.deletedCount || 0 };
    }

    const objectIds = normalizedIds.map((id) => new mongoose.Types.ObjectId(id));
    const existingUsers = await User.find({ _id: { $in: objectIds } }).select('_id').lean();
    const existingSet = new Set(existingUsers.map((u) => String(u._id)));

    const orphanRefs = refreshedRefs.filter((ref) => {
        const oid = toObjectId(ref);
        if (!oid) return true;
        return !existingSet.has(String(oid));
    });

    if (!orphanRefs.length) return { deletedCount: 0 };

    const result = await Enrollment.deleteMany({ student: { $in: orphanRefs } });
    return { deletedCount: result.deletedCount || 0 };
}

/**
 * Rebuild User.enrolledCourses + Course.students from Enrollment rows (master data).
 * Does NOT create enrollment rows from stale roster arrays.
 */
async function syncAllRostersFromEnrollments() {
    const studentIds = await Enrollment.distinct('student', { student: { $ne: null } });
    let synced = 0;
    for (const studentId of studentIds) {
        await syncStudentRosterFromEnrollments(studentId);
        synced += 1;
    }
    return { synced };
}

/** @deprecated Use syncAllRostersFromEnrollments — kept for script compatibility. */
async function reconcileMissingEnrollmentRows() {
    return syncAllRostersFromEnrollments();
}

module.exports = {
    removeOrphanEnrollmentRows,
    syncAllRostersFromEnrollments,
    reconcileMissingEnrollmentRows,
    toObjectId,
};
