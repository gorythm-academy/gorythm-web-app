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

function deleteProofFile(proofUrl) {
    const abs = proofAbsolutePathFromPublic(proofUrl);
    if (!abs || !fs.existsSync(abs)) return;
    try {
        fs.unlinkSync(abs);
    } catch {
        /* ignore */
    }
}

async function permanentlyDeletePayments(filter) {
    const payments = await Payment.find(filter).select('proofUrl').lean();
    for (const payment of payments) {
        if (payment.proofUrl) deleteProofFile(payment.proofUrl);
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
    await Enrollment.updateMany(
        { course: courseId, deletedAt: { $exists: true, $ne: null } },
        { $set: { deletedAt: null } }
    );

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
    permanentlyDeletePayments,
    deleteCourseMediaFiles,
    permanentlyDeleteCourseRelations,
    softTrashCourseEnrollments,
    restoreCourseEnrollments,
    syncStudentRostersAfterUserRestore,
    permanentlyDeleteUserRelations,
};
