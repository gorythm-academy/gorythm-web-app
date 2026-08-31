const express = require('express');
const router = express.Router();

const Course = require('../../models/Course');
const User = require('../../models/User');
const Assignment = require('../../models/Assignment');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const { getTeachersByCourseIds } = require('../../services/courseTeachers');
const {
    assertDueDateNotPast,
    resolveValidTargetPairs,
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

        if (metaOnly) {
            const [trashCount, courses, teachers] = await Promise.all([
                trashCountPromise,
                coursesPromise,
                teachersPromise,
            ]);
            const courseTeachers = await getTeachersByCourseIds(courses.map((c) => c._id));
            return res.json({ success: true, assignments: [], courses, teachers, courseTeachers, trashCount });
        }

        const [assignments, trashCount, courses, teachers] = await Promise.all([
            Assignment.find(listFilter)
                .select(
                    'title description dueDate status course teacher attachments createdByRole lockedForTeacher publishGroupId dueDateExtensions createdAt updatedAt deletedAt'
                )
                .populate('course', 'title instructorName')
                .populate('teacher', 'name email')
                .sort({ dueDate: -1 })
                .lean(),
            trashCountPromise,
            coursesPromise,
            teachersPromise,
        ]);
        res.json({
            success: true,
            assignments: assignments.map((a) => ({
                ...a,
                dueDateNotice: buildDueDateExtensionNotice(a, { viewerRole: 'admin' }),
            })),
            courses,
            teachers,
            trashCount,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.post('/assignments/preview-targets', async (req, res) => {
    try {
        const { courseIds, teacherIds, targets } = req.body || {};
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
            courseIds,
            teacherIds,
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

        let pairs = [];
        if (courseId) {
            const course = await Course.findOne({ _id: courseId, ...publishedActiveCourseFilter() });
            if (!course) return res.status(404).json({ success: false, error: 'Course not found or not published' });
            const resolvedTeacher = teacherId || course.instructor;
            if (!resolvedTeacher) {
                return res.status(400).json({ success: false, error: 'Teacher is required for this course' });
            }
            pairs = await resolveValidTargetPairs({
                explicitTargets: [{ courseId, teacherId: resolvedTeacher }],
            });
        } else {
            pairs = await resolveValidTargetPairs({ courseIds, teacherIds, explicitTargets: targets });
        }
        if (!pairs.length) {
            return res.status(400).json({
                success: false,
                error: 'No valid course+teacher pairs. Each teacher must teach the selected course.',
            });
        }

        const publishGroupId = pairs.length > 1 ? newPublishGroupId() : null;
        const created = await Assignment.insertMany(
            pairs.map(({ courseId: cid, teacherId: tid }) => ({
                title: String(title).trim(),
                description: description || '',
                course: cid,
                teacher: tid,
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
            .populate('teacher', 'name email');

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
        const { courseId, teacherId, title, description, dueDate, status, attachments, extendDueDate } = req.body;
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
        if (title !== undefined) assignment.title = String(title).trim();
        if (description !== undefined) assignment.description = description || '';
        if (dueDate) {
            if (extendDueDate) {
                const extRole = req.user?.role || 'admin';
                recordDueDateExtension(assignment, dueDate, req.user?.userId || null, extRole);
            } else {
                const parsed = assertDueDateNotPast(dueDate);
                const prev = assignment.dueDate ? startOfDay(assignment.dueDate) : null;
                if (prev && startOfDay(parsed).getTime() > prev.getTime()) {
                    recordDueDateExtension(
                        assignment,
                        dueDate,
                        req.user?.userId || null,
                        req.user?.role || 'admin'
                    );
                } else {
                    assignment.dueDate = parsed;
                }
            }
        }
        if (status !== undefined) assignment.status = status;
        if (attachments !== undefined) assignment.attachments = Array.isArray(attachments) ? attachments : [];
        await assignment.save();
        const populated = await Assignment.findById(assignment._id)
            .populate('course', 'title')
            .populate('teacher', 'name');
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
