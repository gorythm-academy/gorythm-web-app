const express = require('express');
const router = express.Router();

const Course = require('../../models/Course');
const User = require('../../models/User');
const Resource = require('../../models/Resource');
const { getTeachersByCourseIds } = require('../../services/courseTeachers');
const {
    resolveValidTargetPairs,
    newPublishGroupId,
    normalizeIdList,
} = require('../../utils/lmsContentRules');
const { activeUserFilter } = require('../../utils/userQuery');
const { publishedActiveCourseFilter } = require('../../utils/courseQuery');
const { activeLmsFilter, trashedLmsFilter, parseTrashQuery } = require('../../utils/lmsTrashQuery');
const { softDeleteMany, restoreMany, permanentDeleteMany, countTrashed } = require('../../services/lmsTrashOps');
const { collectResourceUrls, cleanupUrlsAfterPermanentDelete } = require('../../utils/lmsUploadCleanup');
const { parseMetaOnly } = require('./shared');

async function resourceScopeFilter(courseId) {
    if (!courseId) return {};
    return { course: courseId };
}

function normalizeResourceAttachments(input) {
    const list = Array.isArray(input?.attachments)
        ? input.attachments.map((u) => String(u || '').trim()).filter(Boolean)
        : [];
    if (list.length) return list;
    const legacy = String(input?.fileUrl || '').trim();
    return legacy ? [legacy] : [];
}

function applyResourceFiles(resource, { fileUrl, attachments, type }) {
    if (attachments !== undefined || fileUrl !== undefined) {
        const normalized = normalizeResourceAttachments({ attachments, fileUrl });
        resource.attachments = normalized;
        resource.fileUrl = normalized[0] || '';
    }
    if (type !== undefined) resource.type = type || 'file';
}

// ——— Course resources (books, files, links) ———
router.get('/resources', async (req, res) => {
    try {
        const trash = parseTrashQuery(req);
        const metaOnly = parseMetaOnly(req);
        const scope = await resourceScopeFilter(req.query.courseId);
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
        const trashCountPromise = countTrashed(Resource, scope);

        if (metaOnly) {
            const [trashCount, courses, teachers] = await Promise.all([
                trashCountPromise,
                coursesPromise,
                teachersPromise,
            ]);
            const courseTeachers = await getTeachersByCourseIds(courses.map((c) => c._id));
            return res.json({ success: true, resources: [], courses, teachers, courseTeachers, trashCount });
        }

        const [resources, trashCount, courses, teachers] = await Promise.all([
            Resource.find(listFilter)
                .select(
                    'title description fileUrl attachments type course teacher scope uploadedBy createdByRole lockedForTeacher publishGroupId createdAt updatedAt deletedAt'
                )
                .populate('course', 'title instructorName')
                .populate('teacher', 'name email')
                .populate('uploadedBy', 'name email role')
                .sort({ createdAt: -1 })
                .lean(),
            trashCountPromise,
            coursesPromise,
            teachersPromise,
        ]);
        res.json({ success: true, resources, courses, teachers, trashCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load resources' });
    }
});

router.post('/resources/preview-targets', async (req, res) => {
    try {
        const { courseIds, teacherIds, targets } = req.body || {};
        const pairs = await resolveValidTargetPairs({ courseIds, teacherIds, explicitTargets: targets });
        res.json({ success: true, count: pairs.length, pairs });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to preview targets' });
    }
});

router.post('/resources', async (req, res) => {
    try {
        const {
            courseId,
            teacherId,
            courseIds,
            teacherIds,
            targets,
            title,
            description,
            fileUrl,
            type,
            attachments,
            scope = 'teacher',
        } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, error: 'title is required' });
        }
        const attachmentList = normalizeResourceAttachments({ attachments, fileUrl });
        const adminUserId = req.user?.userId || null;
        const resourceScope = scope === 'course' ? 'course' : 'teacher';

        let pairs = [];
        if (courseId) {
            const course = await Course.findOne({ _id: courseId, ...publishedActiveCourseFilter() });
            if (!course) return res.status(404).json({ success: false, error: 'Course not found or not published' });
            if (resourceScope === 'teacher') {
                const resolvedTeacher = teacherId || course.instructor;
                if (!resolvedTeacher) {
                    return res.status(400).json({ success: false, error: 'Teacher is required for teacher-scoped resources' });
                }
                pairs = await resolveValidTargetPairs({
                    explicitTargets: [{ courseId, teacherId: resolvedTeacher }],
                });
            } else {
                pairs = [{ courseId, teacherId: teacherId || course.instructor || null }];
            }
        } else {
            const normalizedCourses = normalizeIdList(courseIds);
            if (!normalizedCourses.length) {
                return res.status(400).json({ success: false, error: 'Select at least one course' });
            }
            if (resourceScope === 'course') {
                pairs = normalizedCourses.map((cid) => ({ courseId: cid, teacherId: null }));
            } else {
                pairs = await resolveValidTargetPairs({ courseIds, teacherIds, explicitTargets: targets });
            }
        }
        if (!pairs.length) {
            return res.status(400).json({
                success: false,
                error: 'No valid course+teacher pairs. Each teacher must teach the selected course.',
            });
        }

        const publishGroupId = pairs.length > 1 ? newPublishGroupId() : null;
        const created = await Resource.insertMany(
            pairs.map(({ courseId: cid, teacherId: tid }) => ({
                title: String(title).trim(),
                description: description || '',
                fileUrl: attachmentList[0] || '',
                attachments: attachmentList,
                type: type || 'file',
                course: cid,
                teacher: resourceScope === 'teacher' ? tid : tid || null,
                scope: resourceScope,
                uploadedBy: adminUserId,
                createdByRole: 'admin',
                createdByUser: adminUserId,
                lockedForTeacher: true,
                publishGroupId,
            }))
        );

        const populated = await Resource.find({ _id: { $in: created.map((r) => r._id) } })
            .populate('course', 'title')
            .populate('teacher', 'name email')
            .populate('uploadedBy', 'name role');

        res.status(201).json({
            success: true,
            createdCount: populated.length,
            publishGroupId,
            resources: populated,
            resource: populated[0] || null,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to create resource' });
    }
});

router.patch('/resources/:id', async (req, res) => {
    try {
        const resource = await Resource.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        const { courseId, teacherId, title, description, fileUrl, type, attachments, scope } = req.body;
        if (courseId) {
            const course = await Course.findOne({ _id: courseId, ...publishedActiveCourseFilter() });
            if (!course) return res.status(404).json({ success: false, error: 'Course not found or not published' });
            resource.course = courseId;
        }
        if (teacherId !== undefined) {
            if (teacherId) {
                const targetCourse = courseId || resource.course;
                const pairs = await resolveValidTargetPairs({
                    explicitTargets: [{ courseId: targetCourse, teacherId }],
                });
                if (!pairs.length) {
                    return res.status(400).json({ success: false, error: 'Selected teacher does not teach this course' });
                }
            }
            resource.teacher = teacherId || null;
        }
        if (scope !== undefined) resource.scope = scope === 'course' ? 'course' : 'teacher';
        if (title !== undefined) resource.title = String(title).trim();
        if (description !== undefined) resource.description = description || '';
        applyResourceFiles(resource, { fileUrl, attachments, type });
        await resource.save();
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('teacher', 'name email')
            .populate('uploadedBy', 'name role');
        res.json({ success: true, resource: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update resource' });
    }
});

router.post('/resources/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const deletedCount = await softDeleteMany(Resource, ids);
        res.json({ success: true, deletedCount, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete resources' });
    }
});

router.post('/resources/bulk-restore', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const restoredCount = await restoreMany(Resource, ids);
        res.json({ success: true, restoredCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore resources' });
    }
});

router.post('/resources/bulk-permanent-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const docs = await Resource.find({ _id: { $in: ids }, ...trashedLmsFilter() }).lean();
        const fileUrls = docs.flatMap(collectResourceUrls);
        const deletedCount = await permanentDeleteMany(Resource, ids);
        await cleanupUrlsAfterPermanentDelete(fileUrls);
        res.json({ success: true, deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete resources' });
    }
});

router.delete('/resources/:id', async (req, res) => {
    try {
        const doc = await Resource.findOneAndUpdate(
            { _id: req.params.id, ...activeLmsFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Resource not found' });
        }
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete resource' });
    }
});

module.exports = router;
