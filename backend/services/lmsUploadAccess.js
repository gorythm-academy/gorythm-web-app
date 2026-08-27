const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Quiz = require('../models/Quiz');
const Resource = require('../models/Resource');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const ParentStudentLink = require('../models/ParentStudentLink');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const { getTeacherCourseIds } = require('./teacherCourseAccess');
const { uploadUrlVariants, normalizeUploadPublicPath } = require('../utils/uploadUrlMatch');

const STAFF_ROLES = new Set(['manager', 'super-admin', 'accountant']);

function urlInField(value, variants) {
    if (!value) return false;
    return variants.includes(String(value).trim());
}

function attachmentMatches(attachments, variants) {
    if (!Array.isArray(attachments)) return false;
    return attachments.some((a) => urlInField(a, variants));
}

async function getStudentCourseIds(studentId) {
    const enrollments = await Enrollment.find({
        student: studentId,
        ...activeEnrollmentFilter(),
        course: { $ne: null },
    })
        .select('course')
        .lean();
    return enrollments.map((e) => String(e.course)).filter(Boolean);
}

async function getParentStudentIds(parentId) {
    const links = await ParentStudentLink.find({ parent: parentId }).select('student').lean();
    return links.map((l) => String(l.student)).filter(Boolean);
}

async function userCanAccessCourse(userId, role, courseId) {
    if (!courseId) return false;
    const cid = String(courseId);

    if (role === 'teacher') {
        const teacherCourses = await getTeacherCourseIds(userId);
        return teacherCourses.some((id) => String(id) === cid);
    }

    if (role === 'student') {
        const studentCourses = await getStudentCourseIds(userId);
        return studentCourses.includes(cid);
    }

    if (role === 'parent') {
        const childIds = await getParentStudentIds(userId);
        for (const childId of childIds) {
            const childCourses = await getStudentCourseIds(childId);
            if (childCourses.includes(cid)) return true;
        }
    }

    return false;
}

async function findCourseIdsForUpload(publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return [];

    const variants = uploadUrlVariants(normalized);
    const relSuffix = normalized.replace('/api/uploads/', '');
    const courseIds = new Set();

    const assignments = await Assignment.find({ attachments: { $in: variants } })
        .select('course')
        .lean();
    assignments.forEach((a) => a.course && courseIds.add(String(a.course)));

    const quizzes = await Quiz.find({ resourceFileUrl: { $in: variants } })
        .select('course')
        .lean();
    quizzes.forEach((q) => q.course && courseIds.add(String(q.course)));

    const resources = await Resource.find({
        fileUrl: { $in: variants },
        deletedAt: null,
    })
        .select('course')
        .lean();
    resources.forEach((r) => r.course && courseIds.add(String(r.course)));

    const submissions = await AssignmentSubmission.find({
        attachments: { $in: variants },
    })
        .select('assignment student')
        .populate({ path: 'assignment', select: 'course' })
        .lean();
    submissions.forEach((s) => {
        if (s.assignment?.course) courseIds.add(String(s.assignment.course));
    });

    return [...courseIds];
}

async function canAccessLmsUpload(userId, role, publicPath) {
    if (!userId || !role) return false;
    if (STAFF_ROLES.has(role)) return true;

    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return false;

    const courseIds = await findCourseIdsForUpload(normalized);
    if (courseIds.length === 0) {
        return false;
    }

    for (const courseId of courseIds) {
        if (await userCanAccessCourse(userId, role, courseId)) {
            return true;
        }
    }

    const variants = uploadUrlVariants(normalized);
    if (role === 'student' && normalized.includes('/assignments/student/')) {
        const owned = await AssignmentSubmission.findOne({
            student: userId,
            attachments: { $in: variants },
        }).select('_id');
        if (owned) return true;
    }

    return false;
}

module.exports = {
    canAccessLmsUpload,
    findCourseIdsForUpload,
    normalizeUploadPublicPath,
};
