const crypto = require('crypto');
const Enrollment = require('../models/Enrollment');
const { getTeachersForCourse } = require('../services/courseTeachers');

function startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function minDueDateInputValue() {
    return startOfDay().toISOString().slice(0, 10);
}

function assertDueDateNotPast(dueDate, { allowPast = false } = {}) {
    if (allowPast) return startOfDay(dueDate);
    const parsed = startOfDay(dueDate);
    if (Number.isNaN(parsed.getTime())) {
        const err = new Error('Invalid due date');
        err.status = 400;
        throw err;
    }
    if (parsed.getTime() < startOfDay().getTime()) {
        const err = new Error('Due date cannot be in the past');
        err.status = 400;
        throw err;
    }
    return parsed;
}

function normalizeIdList(raw) {
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : [raw];
    return [...new Set(list.map((id) => String(id || '').trim()).filter(Boolean))];
}

/**
 * Valid course+teacher pairs where the teacher actually teaches the course.
 */
async function resolveValidTargetPairs({ courseIds, teacherIds, explicitTargets }) {
    if (Array.isArray(explicitTargets) && explicitTargets.length) {
        const pairs = [];
        for (const row of explicitTargets) {
            const courseId = String(row?.courseId || row?.course || '').trim();
            const teacherId = String(row?.teacherId || row?.teacher || '').trim();
            if (!courseId || !teacherId) continue;
            const teachers = await getTeachersForCourse(courseId);
            if (teachers.some((t) => String(t._id) === teacherId)) {
                pairs.push({ courseId, teacherId });
            }
        }
        return dedupePairs(pairs);
    }

    const courses = normalizeIdList(courseIds);
    const teachers = normalizeIdList(teacherIds);
    if (!courses.length) {
        const err = new Error('Select at least one course');
        err.status = 400;
        throw err;
    }
    if (!teachers.length) {
        const err = new Error('Select at least one teacher');
        err.status = 400;
        throw err;
    }

    const pairs = [];
    for (const courseId of courses) {
        const courseTeachers = await getTeachersForCourse(courseId);
        const allowed = new Set(courseTeachers.map((t) => String(t._id)));
        for (const teacherId of teachers) {
            if (allowed.has(teacherId)) {
                pairs.push({ courseId, teacherId });
            }
        }
    }
    return dedupePairs(pairs);
}

function dedupePairs(pairs) {
    const seen = new Set();
    return pairs.filter(({ courseId, teacherId }) => {
        const key = `${courseId}:${teacherId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function newPublishGroupId() {
    return crypto.randomUUID();
}

/** courseId -> assigned slot teacher id */
async function getStudentEnrollmentTeachers(studentId) {
    const enrollments = await Enrollment.find({
        student: studentId,
        course: { $ne: null },
        status: 'active',
        deletedAt: null,
    })
        .select('course assignedSchedule')
        .populate('assignedSchedule', 'teacher')
        .lean();

    const byCourse = new Map();
    for (const enr of enrollments) {
        const courseId = String(enr.course);
        const scheduleTeacher = enr.assignedSchedule?.teacher;
        const teacherId = scheduleTeacher ? String(scheduleTeacher._id || scheduleTeacher) : null;
        if (courseId && teacherId) {
            byCourse.set(courseId, teacherId);
        }
    }
    return byCourse;
}

async function studentAssignmentMongoFilter(studentId) {
    const enrollmentTeachers = await getStudentEnrollmentTeachers(studentId);
    const pairs = [...enrollmentTeachers.entries()].map(([courseId, teacherId]) => ({
        course: courseId,
        teacher: teacherId,
    }));
    if (!pairs.length) return { _id: { $in: [] } };
    return { $or: pairs };
}

function resourceScopeForDoc(resource) {
    if (resource?.scope === 'course' || resource?.scope === 'teacher') return resource.scope;
    if (resource?.teacher) return 'teacher';
    return 'course';
}

function resourceVisibleToStudent(resource, enrollmentTeachers) {
    const courseId = String(resource.course?._id || resource.course || '');
    if (!courseId || !enrollmentTeachers.has(courseId)) return false;

    const scope = resourceScopeForDoc(resource);
    if (scope === 'course') return true;

    const slotTeacher = enrollmentTeachers.get(courseId);
    if (!slotTeacher) return false;
    const ownerTeacher = String(
        resource.teacher?._id || resource.teacher || resource.uploadedBy?._id || resource.uploadedBy || ''
    );
    return ownerTeacher && slotTeacher === ownerTeacher;
}

async function filterResourcesForStudent(resources, studentId) {
    const enrollmentTeachers = await getStudentEnrollmentTeachers(studentId);
    return resources.filter((r) => resourceVisibleToStudent(r, enrollmentTeachers));
}

function teacherAssignmentScopeFilter(teacherId) {
    return { teacher: teacherId };
}

async function teacherResourceMongoFilter(teacherId, courseIds) {
    const ids = courseIds || [];
    if (!ids.length) return { _id: { $in: [] } };
    return {
        course: { $in: ids },
        $or: [
            { teacher: teacherId },
            { uploadedBy: teacherId },
            { scope: 'course' },
            { teacher: null, scope: { $ne: 'teacher' } },
            { teacher: { $exists: false }, scope: { $ne: 'teacher' } },
        ],
    };
}

function isAssignmentLockedForTeacher(assignment) {
    return !!(assignment?.lockedForTeacher || assignment?.createdByRole === 'admin');
}

function assertTeacherCanMutateAssignment(assignment, { allowDueDateOnly = false } = {}) {
    if (!isAssignmentLockedForTeacher(assignment)) return;
    if (allowDueDateOnly) return;
    const err = new Error('This assignment was created by admin and cannot be edited');
    err.status = 403;
    throw err;
}

function assertTeacherCanDeleteAssignment(assignment) {
    if (!isAssignmentLockedForTeacher(assignment)) return;
    const err = new Error('This assignment was created by admin and cannot be deleted');
    err.status = 403;
    throw err;
}

function isResourceLockedForTeacher(resource) {
    return !!(resource?.lockedForTeacher || resource?.createdByRole === 'admin');
}

function assertTeacherCanMutateResource(resource) {
    if (!isResourceLockedForTeacher(resource)) return;
    const err = new Error('This resource was created by admin and cannot be edited');
    err.status = 403;
    throw err;
}

function assertTeacherCanDeleteResource(resource) {
    if (!isResourceLockedForTeacher(resource)) return;
    const err = new Error('This resource was created by admin and cannot be deleted');
    err.status = 403;
    throw err;
}

function recordDueDateExtension(assignment, newDueDate, extendedBy, extendedByRole = null) {
    const previousDueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
    const nextDue = assertDueDateNotPast(newDueDate);
    if (previousDueDate && nextDue.getTime() <= startOfDay(previousDueDate).getTime()) {
        const err = new Error('Extended due date must be after the current due date');
        err.status = 400;
        throw err;
    }
    if (!Array.isArray(assignment.dueDateExtensions)) assignment.dueDateExtensions = [];
    assignment.dueDateExtensions.push({
        extendedAt: new Date(),
        extendedBy,
        extendedByRole: extendedByRole || null,
        previousDueDate,
        newDueDate: nextDue,
    });
    assignment.dueDate = nextDue;
    return nextDue;
}

function assignmentPastDue(assignment, now = new Date()) {
    if (!assignment?.dueDate) return false;
    return startOfDay(assignment.dueDate).getTime() < startOfDay(now).getTime();
}

function latestDueDateExtension(assignment) {
    const list = assignment?.dueDateExtensions;
    if (!Array.isArray(list) || !list.length) return null;
    return list[list.length - 1];
}

/** User-facing notice when a due date was extended (admin or teacher). */
function buildDueDateExtensionNotice(assignment, { viewerRole = 'student' } = {}) {
    const latest = latestDueDateExtension(assignment);
    if (!latest?.newDueDate) return null;

    const newDate = startOfDay(latest.newDueDate).toLocaleDateString();
    const prevDate = latest.previousDueDate
        ? startOfDay(latest.previousDueDate).toLocaleDateString()
        : null;
    const extRole = String(
        latest.extendedByRole || latest.extendedBy?.role || assignment.lastExtendedByRole || ''
    ).toLowerCase();

    let prefix = 'Due date extended';
    if (extRole === 'teacher') {
        prefix =
            viewerRole === 'teacher'
                ? 'You extended the due date'
                : viewerRole === 'student'
                  ? 'Due date extended'
                  : 'Teacher extended the due date';
    } else if (extRole === 'admin' || extRole === 'manager' || extRole === 'super-admin') {
        prefix =
            viewerRole === 'student'
                ? 'Due date extended'
                : viewerRole === 'teacher'
                  ? 'Due date extended by admin'
                  : 'Admin extended the due date';
    } else if (viewerRole === 'student') {
        prefix = 'Due date extended';
    }

    if (prevDate) return `${prefix} to ${newDate} (was ${prevDate}).`;
    return `${prefix} to ${newDate}.`;
}

function isSubmissionRevised(submission) {
    if (!submission) return false;
    if (Number(submission.revisionCount) > 0) return true;
    const created = submission.createdAt ? new Date(submission.createdAt).getTime() : 0;
    const updated = submission.updatedAt ? new Date(submission.updatedAt).getTime() : 0;
    return updated > created + 60_000;
}

/** Short label under Submitted column when a student updated their work. */
function buildSubmissionRevisionNotice(submission) {
    if (!isSubmissionRevised(submission)) return null;
    const count = Number(submission.revisionCount) || 1;
    return count > 1 ? 'Re-submitted' : 'Edited';
}

function mapSubmissionForPortal(submission) {
    if (!submission) return null;
    const obj = submission.toObject ? submission.toObject() : { ...submission };
    return {
        ...obj,
        revisionNotice: buildSubmissionRevisionNotice(obj),
    };
}

async function getStudentSlotIssues(studentId) {
    const enrollments = await Enrollment.find({
        student: studentId,
        course: { $ne: null },
        status: 'active',
        deletedAt: null,
    })
        .populate('course', 'title')
        .populate('assignedSchedule', 'teacher')
        .lean();

    const coursesWithoutSlot = [];
    for (const enr of enrollments) {
        const scheduleTeacher = enr.assignedSchedule?.teacher;
        const teacherId = scheduleTeacher ? String(scheduleTeacher._id || scheduleTeacher) : null;
        if (!teacherId && enr.course) {
            coursesWithoutSlot.push({
                courseId: String(enr.course._id || enr.course),
                title: enr.course.title || 'Course',
            });
        }
    }
    return { coursesWithoutSlot, hasMissingSlots: coursesWithoutSlot.length > 0 };
}

async function assertStudentCanAccessAssignment(studentId, assignment) {
    const enrollmentTeachers = await getStudentEnrollmentTeachers(studentId);
    const courseId = String(assignment.course?._id || assignment.course || '');
    const slotTeacher = enrollmentTeachers.get(courseId);
    if (!slotTeacher) {
        const err = new Error('No class slot assigned for this course — contact admin');
        err.status = 403;
        throw err;
    }
    if (String(assignment.teacher) !== slotTeacher) {
        const err = new Error('This assignment is not for your class slot');
        err.status = 403;
        throw err;
    }
}

module.exports = {
    startOfDay,
    minDueDateInputValue,
    assertDueDateNotPast,
    normalizeIdList,
    resolveValidTargetPairs,
    dedupePairs,
    newPublishGroupId,
    getStudentEnrollmentTeachers,
    getStudentSlotIssues,
    assertStudentCanAccessAssignment,
    studentAssignmentMongoFilter,
    resourceScopeForDoc,
    resourceVisibleToStudent,
    filterResourcesForStudent,
    teacherAssignmentScopeFilter,
    teacherResourceMongoFilter,
    isAssignmentLockedForTeacher,
    assertTeacherCanMutateAssignment,
    assertTeacherCanDeleteAssignment,
    isResourceLockedForTeacher,
    assertTeacherCanMutateResource,
    assertTeacherCanDeleteResource,
    recordDueDateExtension,
    assignmentPastDue,
    latestDueDateExtension,
    buildDueDateExtensionNotice,
    isSubmissionRevised,
    buildSubmissionRevisionNotice,
    mapSubmissionForPortal,
};
