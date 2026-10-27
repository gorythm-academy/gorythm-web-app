const fs = require('fs');
const Payment = require('../models/Payment');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const ClassSchedule = require('../models/ClassSchedule');
const ParentStudentLink = require('../models/ParentStudentLink');
const { proofAbsolutePathFromPublic } = require('../utils/paymentProofStorage');
const { deleteImageFile } = require('../utils/courseImageStorage');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { isDuplicateKeyError } = require('../utils/duplicateKey');

function deleteProofFile(proofUrl) {
    const abs = proofAbsolutePathFromPublic(proofUrl);
    if (!abs) return { ok: false, reason: 'invalid' };
    if (!fs.existsSync(abs)) return { ok: true, reason: 'missing' };
    try {
        fs.unlinkSync(abs);
    } catch {
        return { ok: false, reason: 'failed' };
    }
    if (fs.existsSync(abs)) return { ok: false, reason: 'failed' };
    return { ok: true, reason: 'deleted' };
}

/** Remove the file only when no other payment, including quarantined rows, still points at it. */
async function deleteProofFileIfLastReference(proofUrl, exceptIds = []) {
    if (!proofUrl) return { ok: true, reason: 'none' };
    const others = await Payment.countDocuments({
        proofUrl,
        ...(exceptIds.length ? { _id: { $nin: exceptIds } } : {}),
    });
    if (others > 0) return { ok: true, reason: 'shared' };
    return deleteProofFile(proofUrl);
}

async function permanentlyDeletePayments(filter) {
    const payments = await Payment.find(filter).select('_id proofUrl').lean();
    const ids = payments.map((payment) => payment._id);
    const urls = [...new Set(payments.map((payment) => payment.proofUrl).filter(Boolean))];
    for (const proofUrl of urls) {
        const removed = await deleteProofFileIfLastReference(proofUrl, ids);
        if (!removed.ok) {
            const err = new Error('Could not delete a payment proof file. The records were kept.');
            err.status = 500;
            throw err;
        }
    }
    const result = await Payment.deleteMany(filter);
    return result.deletedCount || 0;
}

function deleteCourseMediaFiles(course) {
    if (!course) return;
    if (course.homepageImage) deleteImageFile(course.homepageImage);
    if (course.imageUrl && course.imageUrl !== course.homepageImage) {
        deleteImageFile(course.imageUrl);
    }
}

async function permanentlyDeleteCourseRelations(courseId) {
    const enrollments = await Enrollment.find({ course: courseId }).select('student').lean();
    const paymentsRemoved = await permanentlyDeletePayments({ course: courseId });
    const enrollmentsRemoved = (await Enrollment.deleteMany({ course: courseId })).deletedCount || 0;
    const schedulesRemoved = (await ClassSchedule.deleteMany({ course: courseId })).deletedCount || 0;

    await User.updateMany(
        { enrolledCourses: courseId },
        { $pull: { enrolledCourses: courseId } }
    );
    await Course.updateMany(
        { _id: courseId },
        { $set: { students: [] } }
    );

    return {
        enrollmentsRemoved,
        paymentsRemoved,
        schedulesRemoved,
        studentsAffected: enrollments.length,
    };
}

async function softTrashCourseEnrollments(courseId) {
    return Enrollment.updateMany(
        { course: courseId, ...activeEnrollmentFilter() },
        { $set: { deletedAt: new Date() } }
    );
}

async function restoreCourseEnrollments(courseId) {
    // One row at a time: a student who already has an active row for this course keeps the
    // quarantined one in quarantine instead of failing the whole restore.
    const quarantined = await Enrollment.find({
        course: courseId,
        deletedAt: { $exists: true, $ne: null },
    }).select('_id');
    for (const row of quarantined) {
        try {
            await Enrollment.updateOne(
                { _id: row._id, deletedAt: { $exists: true, $ne: null } },
                { $set: { deletedAt: null } }
            );
        } catch (err) {
            if (!isDuplicateKeyError(err)) throw err;
        }
    }

    const enrollments = await Enrollment.find({
        course: courseId,
        ...activeEnrollmentFilter(),
    }).select('student');

    for (const enrollment of enrollments) {
        if (!enrollment.student) continue;
        await Course.findByIdAndUpdate(courseId, {
            $addToSet: { students: enrollment.student },
        });
        await User.findByIdAndUpdate(enrollment.student, {
            $addToSet: { enrolledCourses: courseId },
        });
    }
}

async function syncStudentRostersAfterUserRestore(userId) {
    const enrollments = await Enrollment.find({
        student: userId,
        ...activeEnrollmentFilter(),
    }).select('course');

    for (const enrollment of enrollments) {
        if (!enrollment.course) continue;
        const course = await Course.findById(enrollment.course).select('deletedAt').lean();
        if (course?.deletedAt) continue;
        await Course.findByIdAndUpdate(enrollment.course, {
            $addToSet: { students: userId },
        });
        await User.findByIdAndUpdate(userId, {
            $addToSet: { enrolledCourses: enrollment.course },
        });
    }
}

async function permanentlyDeleteUserRelations(userId) {
    const paymentsRemoved = await permanentlyDeletePayments({ user: userId });
    const linksRemoved = (await ParentStudentLink.deleteMany({
        $or: [{ parent: userId }, { student: userId }],
    })).deletedCount || 0;

    return { paymentsRemoved, linksRemoved };
}

module.exports = {
    deleteProofFile,
    deleteProofFileIfLastReference,
    permanentlyDeletePayments,
    deleteCourseMediaFiles,
    permanentlyDeleteCourseRelations,
    softTrashCourseEnrollments,
    restoreCourseEnrollments,
    syncStudentRostersAfterUserRestore,
    permanentlyDeleteUserRelations,
};
