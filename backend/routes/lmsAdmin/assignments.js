const express = require('express');
const router = express.Router();

const Course = require('../../models/Course');
const User = require('../../models/User');
const Assignment = require('../../models/Assignment');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const ClassSchedule = require('../../models/ClassSchedule');
const { getTeachersByCourseIds } = require('../../services/courseTeachers');
const {
    assertDueDateNotPast,
    resolveValidTargetPairs,
    resolveValidScheduleTargets,
    newPublishGroupId,
    recordDueDateExtension,
    startOfDay,
    buildDueDateExtensionNotice,
} = require('../../utils/lmsContentRules');
const { activeUserFilter } = require('../../utils/userQuery');
const { publishedActiveCourseFilter } = require('../../utils/courseQuery');
const { activeLmsFilter, trashedLmsFilter, parseTrashQuery } = require('../../utils/lmsTrashQuery');
const { restoreMany, permanentDeleteMany, countTrashed } = require('../../services/lmsTrashOps');
const {
    collectAssignmentUrls,
    collectSubmissionUrls,
    cleanupUrlsAfterPermanentDelete,
} = require('../../utils/lmsUploadCleanup');
const { parseMetaOnly } = require('./shared');

async function assignmentScopeFilter(courseId) {
    if (!courseId) return {};
    return { course: courseId };
}

async function loadAssignmentSchedules(courseId) {
    const filter = courseId ? { course: courseId } : {};
    return ClassSchedule.find(filter)
        .select('course teacher dayOfWeek startTime endTime roomOrLink')
        .populate('course', 'title')
        .populate('teacher', 'name email')
        .sort({ dayOfWeek: 1, startTime: 1 })
        .lean();
}

// ——— Assignments (admin view + create; includes teacher-created) ———
router.get('/assignments', async (req, res) => {
    try {
        const trash = parseTrashQuery(req);
        const metaOnly = parseMetaOnly(req);
        const scope = await assignmentScopeFilter(req.query.courseId);
        const listFilter = { ...scope, ...(trash ? trashedLmsFilter() : activeLmsFilter()) };
        const coursesPromise = Course.find({ ...publishedActiveCourseFilter() })
            .select('title instructorName instructor')
            .populate('instructor', 'name email')
            .sort({ title: 1 })
            .lean();
        const teachersPromise = User.find({ role: 'teacher', ...activeUserFilter() })
            .select('name email')
            .sort({ name: 1 })
            .lean();
        const trashCountPromise = countTrashed(Assignment, scope);
        const schedulesPromise = loadAssignmentSchedules(req.query.courseId);

        if (metaOnly) {
            const [trashCount, courses, teachers, schedules] = await Promise.all([
                trashCountPromise,
                coursesPromise,
                teachersPromise,
                schedulesPromise,
            ]);
            const courseTeachers = await getTeachersByCourseIds(courses.map((c) => c._id));
            return res.json({
                success: true,
                assignments: [],
                courses,
                teachers,
                courseTeachers,
                schedules,
                trashCount,
            });
        }

        const [assignments, trashCount, courses, teachers, schedules] = await Promise.all([
            Assignment.find(listFilter)
                .select(
                    'title description dueDate status course teacher assignedSchedule attachments createdByRole lockedForTeacher publishGroupId dueDateExtensions createdAt updatedAt deletedAt'
                )
                .populate('course', 'title instructorName')
                .populate('teacher', 'name email')
                .populate('assignedSchedule', 'dayOfWeek startTime endTime teacher')
                .sort({ dueDate: -1 })
                .lean(),
            trashCountPromise,
            coursesPromise,
            teachersPromise,
            schedulesPromise,
        ]);
        res.json({
            success: true,
            assignments: assignments.map((a) => ({
                ...a,
                dueDateNotice: buildDueDateExtensionNotice(a, { viewerRole: 'admin' }),
            })),
            courses,
            teachers,
            schedules,
            trashCount,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.post('/assignments/preview-targets', async (req, res) => {
    try {
        const { courseIds, teacherIds, scheduleIds, targets } = req.body || {};
        if (Array.isArray(scheduleIds) && scheduleIds.length) {
            const scheduleTargets = await resolveValidScheduleTargets({ scheduleIds });
            return res.json({ success: true, count: scheduleTargets.length, scheduleTargets });
        }
        const pairs = await resolveValidTargetPairs({ courseIds, teacherIds, explicitTargets: targets });
        res.json({ success: true, count: pairs.length, pairs });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to preview targets' });
    }
});

router.post('/assignments', async (req, res) => {
    try {
        const {
            courseId,
            teacherId,
            scheduleId,
            courseIds,
            teacherIds,
            scheduleIds,
            targets,
            title,
            description,
            dueDate,
            status,
            attachments,
        } = req.body;
        if (!title || !dueDate) {
            return res.status(400).json({ success: false, error: 'title and dueDate are required' });
        }
        const parsedDueDate = assertDueDateNotPast(dueDate);
        const attachmentList = Array.isArray(attachments) ? attachments : [];
        const adminUserId = req.user?.userId || null;
        const publishStatus = status || 'published';

        let scheduleTargets = [];
        if (courseId && (scheduleId || teacherId)) {
            if (!scheduleId) {
                return res.status(400).json({ success: false, error: 'Class slot is required' });
            }
            scheduleTargets = await resolveValidScheduleTargets({
                scheduleIds: [scheduleId],
                courseId,
                ...(teacherId ? { teacherId } : {}),
            });
        } else if (Array.isArray(scheduleIds) && scheduleIds.length) {
            scheduleTargets = await resolveValidScheduleTargets({ scheduleIds });
        } else if (Array.isArray(targets) && targets.some((row) => row?.scheduleId)) {
            scheduleTargets = await resolveValidScheduleTargets({ explicitTargets: targets });
        } else {
            return res.status(400).json({
                success: false,
                error: 'Select at least one class slot to publish this assignment.',
            });
        }

        const publishGroupId = scheduleTargets.length > 1 ? newPublishGroupId() : null;
        const created = await Assignment.insertMany(
            scheduleTargets.map(({ courseId: cid, teacherId: tid, scheduleId: sid }) => ({
                title: String(title).trim(),
                description: description || '',
                course: cid,
                teacher: tid,
                assignedSchedule: sid,
                dueDate: parsedDueDate,
                attachments: attachmentList,
                status: publishStatus,
                createdByRole: 'admin',
                createdByUser: adminUserId,
                lockedForTeacher: true,
                publishGroupId,
            }))
        );

        const populated = await Assignment.find({ _id: { $in: created.map((a) => a._id) } })
            .populate('course', 'title')
            .populate('teacher', 'name email')
            .populate('assignedSchedule', 'dayOfWeek startTime endTime');

        res.status(201).json({
            success: true,
            createdCount: populated.length,
            publishGroupId,
            assignments: populated,
            assignment: populated[0] || null,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to create assignment' });
    }
});

router.patch('/assignments/:id', async (req, res) => {
    try {
        const assignment = await Assignment.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        const { courseId, teacherId, scheduleId, title, description, dueDate, status, attachments, extendDueDate } = req.body;
        if (courseId) {
            const course = await Course.findOne({ _id: courseId, ...publishedActiveCourseFilter() });
            if (!course) return res.status(404).json({ success: false, error: 'Course not found or not published' });
            assignment.course = courseId;
            if (!teacherId) assignment.teacher = course.instructor;
        }
        if (teacherId) {
            const targetCourse = courseId || assignment.course;
            const pairs = await resolveValidTargetPairs({
                explicitTargets: [{ courseId: targetCourse, teacherId }],
            });
            if (!pairs.length) {
                return res.status(400).json({ success: false, error: 'Selected teacher does not teach this course' });
            }
            assignment.teacher = teacherId;
        }
        if (scheduleId) {
            const [target] = await resolveValidScheduleTargets({
                scheduleIds: [scheduleId],
                courseId: courseId || assignment.course,
                ...(teacherId || assignment.teacher
                    ? { teacherId: teacherId || assignment.teacher }
                    : {}),
            });
            assignment.assignedSchedule = target.scheduleId;
            assignment.course = target.courseId;
            assignment.teacher = target.teacherId;
        }
        if (title !== undefined) assignment.title = String(title).trim();
        if (description !== undefined) assignment.description = description || '';
        if (dueDate) {
            const parsed = assertDueDateNotPast(dueDate);
            const prev = assignment.dueDate ? startOfDay(assignment.dueDate) : null;
            const next = startOfDay(parsed);
            if (!prev) {
                assignment.dueDate = next;
            } else if (next.getTime() === prev.getTime()) {
                // Due date unchanged — allow other field updates.
            } else if (extendDueDate || next.getTime() > prev.getTime()) {
                recordDueDateExtension(
                    assignment,
                    dueDate,
                    req.user?.userId || null,
                    req.user?.role || 'admin'
                );
            } else {
                const err = new Error('Extended due date must be after the current due date');
                err.status = 400;
                throw err;
            }
        }
        if (status !== undefined) assignment.status = status;
        if (attachments !== undefined) assignment.attachments = Array.isArray(attachments) ? attachments : [];
        await assignment.save();
        const populated = await Assignment.findById(assignment._id)
            .populate('course', 'title')
            .populate('teacher', 'name')
            .populate('assignedSchedule', 'dayOfWeek startTime endTime teacher');
        const assignmentObj = populated.toObject ? populated.toObject() : populated;
        res.json({
            success: true,
            assignment: {
                ...assignmentObj,
                dueDateNotice: buildDueDateExtensionNotice(assignmentObj, { viewerRole: 'admin' }),
            },
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update assignment' });
    }
});

router.post('/assignments/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const trashedAt = new Date();
        const assignResult = await Assignment.updateMany(
            { _id: { $in: ids }, ...activeLmsFilter() },
            { $set: { deletedAt: trashedAt } }
        );
        await AssignmentSubmission.updateMany(
            { assignment: { $in: ids }, ...activeLmsFilter() },
            { $set: { deletedAt: trashedAt } }
        );
        res.json({ success: true, deletedCount: assignResult.modifiedCount, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete assignments' });
    }
});

router.post('/assignments/bulk-restore', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const trashedAssignments = await Assignment.find({
            _id: { $in: ids },
            ...trashedLmsFilter(),
        }).select('_id deletedAt');
        const restoredCount = await restoreMany(Assignment, ids);
        for (const assignment of trashedAssignments) {
            if (!assignment.deletedAt) continue;
            await AssignmentSubmission.updateMany(
                {
                    assignment: assignment._id,
                    deletedAt: { $gte: assignment.deletedAt },
                },
                { $set: { deletedAt: null } }
            );
        }
        res.json({ success: true, restoredCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore assignments' });
    }
});

router.post('/assignments/bulk-permanent-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const [assignmentDocs, submissionDocs] = await Promise.all([
            Assignment.find({ _id: { $in: ids }, ...trashedLmsFilter() }).lean(),
            AssignmentSubmission.find({ assignment: { $in: ids }, ...trashedLmsFilter() }).lean(),
        ]);
        const fileUrls = [
            ...assignmentDocs.flatMap(collectAssignmentUrls),
            ...submissionDocs.flatMap(collectSubmissionUrls),
        ];
        await AssignmentSubmission.deleteMany({ assignment: { $in: ids }, ...trashedLmsFilter() });
        const deletedCount = await permanentDeleteMany(Assignment, ids);
        await cleanupUrlsAfterPermanentDelete(fileUrls);
        res.json({ success: true, deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete assignments' });
    }
});

router.delete('/assignments/:id', async (req, res) => {
    try {
        const trashedAt = new Date();
        const doc = await Assignment.findOneAndUpdate(
            { _id: req.params.id, ...activeLmsFilter() },
            { $set: { deletedAt: trashedAt } },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        }
        await AssignmentSubmission.updateMany(
            { assignment: req.params.id, ...activeLmsFilter() },
            { $set: { deletedAt: trashedAt } }
        );
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete assignment' });
    }
});

module.exports = router;
