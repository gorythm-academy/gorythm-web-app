const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Quiz = require('../models/Quiz');
const Resource = require('../models/Resource');
const ParentStudentLink = require('../models/ParentStudentLink');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { getTeacherCourseIds } = require('./teacherCourseAccess');
const { uploadUrlVariants, normalizeUploadPublicPath } = require('../utils/uploadUrlMatch');
const {
    getStudentEnrollmentTeachers,
    resourceVisibleToStudent,
    teacherAssignmentScopeFilter,
} = require('../utils/lmsContentRules');
const { activeLmsFilter } = require('../utils/lmsTrashQuery');

const STAFF_ROLES = new Set(['manager', 'super-admin', 'accountant']);

async function getStudentCourseIds(studentId) {
    const Enrollment = require('../models/Enrollment');
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

function buildFileMatchQuery(variants, suffixRegex, fields) {
    const clauses = [];
    for (const field of fields) {
        if (field === 'attachments') {
            clauses.push(
                suffixRegex
                    ? { attachments: { $in: variants } }
                    : { attachments: { $in: variants } }
            );
            if (suffixRegex) {
                clauses.push({ attachments: { $regex: suffixRegex } });
            }
        } else if (suffixRegex) {
            clauses.push({ [field]: { $in: variants } }, { [field]: { $regex: suffixRegex } });
        } else {
            clauses.push({ [field]: { $in: variants } });
        }
    }
    return { $or: clauses };
}

async function findAssignmentsForUpload(publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return [];
    const variants = uploadUrlVariants(normalized);
    const relSuffix = normalized.replace('/api/uploads/', '');
    const suffixRegex =
        relSuffix && relSuffix !== normalized
            ? new RegExp(`${relSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
            : null;
    return Assignment.find({
        ...buildFileMatchQuery(variants, suffixRegex, ['attachments']),
        ...activeLmsFilter(),
    })
        .select('course teacher attachments')
        .lean();
}

async function findResourcesForUpload(publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return [];
    const variants = uploadUrlVariants(normalized);
    const relSuffix = normalized.replace('/api/uploads/', '');
    const suffixRegex =
        relSuffix && relSuffix !== normalized
            ? new RegExp(`${relSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
            : null;
    const fileQuery = buildFileMatchQuery(variants, suffixRegex, ['fileUrl', 'attachments']);
    return Resource.find({ ...fileQuery, deletedAt: null })
        .select('course teacher scope uploadedBy fileUrl attachments')
        .lean();
}

async function findSubmissionsForUpload(publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return [];
    const variants = uploadUrlVariants(normalized);
    const relSuffix = normalized.replace('/api/uploads/', '');
    const suffixRegex =
        relSuffix && relSuffix !== normalized
            ? new RegExp(`${relSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
            : null;
    return AssignmentSubmission.find({
        ...buildFileMatchQuery(variants, suffixRegex, ['attachments']),
        ...activeLmsFilter(),
    })
        .select('assignment student attachments')
        .populate({ path: 'assignment', select: 'course teacher' })
        .lean();
}

async function findQuizzesForUpload(publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return [];
    const variants = uploadUrlVariants(normalized);
    const relSuffix = normalized.replace('/api/uploads/', '');
    const suffixRegex =
        relSuffix && relSuffix !== normalized
            ? new RegExp(`${relSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
            : null;
    return Quiz.find({
        ...buildFileMatchQuery(variants, suffixRegex, ['resourceFileUrl']),
        ...activeLmsFilter(),
    })
        .select('course teacher resourceFileUrl')
        .lean();
}

async function studentCanAccessUpload(userId, publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return false;

    const enrollmentTeachers = await getStudentEnrollmentTeachers(userId);
    const variants = uploadUrlVariants(normalized);

    if (normalized.includes('/assignments/student/')) {
        const owned = await AssignmentSubmission.findOne({
            student: userId,
            attachments: { $in: variants },
            ...activeLmsFilter(),
        }).select('_id');
        if (owned) return true;
    }

    const assignments = await findAssignmentsForUpload(normalized);
    for (const assignment of assignments) {
        const courseId = String(assignment.course || '');
        const slotTeacher = enrollmentTeachers.get(courseId);
        if (slotTeacher && String(assignment.teacher) === slotTeacher) return true;
    }

    const resources = await findResourcesForUpload(normalized);
    for (const resource of resources) {
        if (resourceVisibleToStudent(resource, enrollmentTeachers)) return true;
    }

    const submissions = await findSubmissionsForUpload(normalized);
    for (const submission of submissions) {
        const assignment = submission.assignment;
        if (!assignment) continue;
        const courseId = String(assignment.course || '');
        const slotTeacher = enrollmentTeachers.get(courseId);
        if (slotTeacher && String(assignment.teacher) === slotTeacher) return true;
    }

    const quizzes = await findQuizzesForUpload(normalized);
    for (const quiz of quizzes) {
        const courseId = String(quiz.course || '');
        if (enrollmentTeachers.has(courseId)) return true;
    }

    return false;
}

async function teacherCanAccessUpload(userId, publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return false;

    const teacherId = String(userId);
    const teacherCourses = await getTeacherCourseIds(userId);
    const courseSet = new Set(teacherCourses.map(String));

    const assignments = await findAssignmentsForUpload(normalized);
    for (const assignment of assignments) {
        if (String(assignment.teacher) === teacherId) return true;
    }

    const resources = await findResourcesForUpload(normalized);
    for (const resource of resources) {
        const courseId = String(resource.course || '');
        if (!courseSet.has(courseId)) continue;
        const ownerTeacher = String(resource.teacher || resource.uploadedBy || '');
        if (resource.scope === 'course' || ownerTeacher === teacherId || !ownerTeacher) return true;
    }

    const submissions = await findSubmissionsForUpload(normalized);
    for (const submission of submissions) {
        const assignment = submission.assignment;
        if (assignment && String(assignment.teacher) === teacherId) return true;
    }

    const quizzes = await findQuizzesForUpload(normalized);
    for (const quiz of quizzes) {
        const courseId = String(quiz.course || '');
        if (courseSet.has(courseId)) return true;
    }

    return false;
}

async function parentCanAccessUpload(userId, publicPath) {
    const childIds = await getParentStudentIds(userId);
    for (const childId of childIds) {
        if (await studentCanAccessUpload(childId, publicPath)) return true;
    }
    return false;
}

async function findCourseIdsForUpload(publicPath) {
    const normalized = normalizeUploadPublicPath(publicPath);
    if (!normalized) return [];

    const courseIds = new Set();
    const assignments = await findAssignmentsForUpload(normalized);
    assignments.forEach((a) => a.course && courseIds.add(String(a.course)));

    const quizzes = await findQuizzesForUpload(normalized);
    quizzes.forEach((q) => q.course && courseIds.add(String(q.course)));

    const resources = await findResourcesForUpload(normalized);
    resources.forEach((r) => r.course && courseIds.add(String(r.course)));

    const submissions = await findSubmissionsForUpload(normalized);
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

    if (role === 'student') {
        return studentCanAccessUpload(userId, normalized);
    }
    if (role === 'teacher') {
        return teacherCanAccessUpload(userId, normalized);
    }
    if (role === 'parent') {
        return parentCanAccessUpload(userId, normalized);
    }

    return false;
}

module.exports = {
    canAccessLmsUpload,
    findCourseIdsForUpload,
    normalizeUploadPublicPath,
};
