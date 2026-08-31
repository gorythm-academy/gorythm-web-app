const express = require('express');
const router = express.Router();

const User = require('../../models/User');
const Assignment = require('../../models/Assignment');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const { mapSubmissionForPortal } = require('../../utils/lmsContentRules');
const { activeUserFilter } = require('../../utils/userQuery');
const { activeLmsFilter, trashedLmsFilter, parseTrashQuery } = require('../../utils/lmsTrashQuery');
const { softDeleteMany, permanentDeleteMany } = require('../../services/lmsTrashOps');
const { collectSubmissionUrls, cleanupUrlsAfterPermanentDelete } = require('../../utils/lmsUploadCleanup');
const { parseListPagination, parseIncludeMeta, escapeRegex, loadActiveCoursesMeta } = require('./shared');

async function buildSubmissionSearchFilter(search, trash) {
    const q = String(search || '').trim();
    if (!q) return null;
    const re = new RegExp(escapeRegex(q), 'i');
    const [studentIds, assignmentIds, teacherIds] = await Promise.all([
        User.find({
            role: 'student',
            ...(trash ? {} : activeUserFilter()),
            $or: [{ name: re }, { studentId: re }, { email: re }],
        }).distinct('_id'),
        Assignment.find({
            ...(trash ? trashedLmsFilter() : activeLmsFilter()),
            title: re,
        }).distinct('_id'),
        User.find({ role: 'teacher', ...activeUserFilter(), name: re }).distinct('_id'),
    ]);
    let teacherAssignmentIds = [];
    if (teacherIds.length) {
        teacherAssignmentIds = await Assignment.find({
            ...(trash ? trashedLmsFilter() : activeLmsFilter()),
            teacher: { $in: teacherIds },
        }).distinct('_id');
    }
    const or = [];
    if (studentIds.length) or.push({ student: { $in: studentIds } });
    if (assignmentIds.length) or.push({ assignment: { $in: assignmentIds } });
    if (teacherAssignmentIds.length) or.push({ assignment: { $in: teacherAssignmentIds } });
    if (!or.length) return { _id: null };
    return { $or: or };
}

async function submissionListFilter(courseId, trash) {
    const filter = trash ? { ...trashedLmsFilter() } : { ...activeLmsFilter() };
    if (courseId) {
        const assignmentFilter = { course: courseId };
        if (!trash) Object.assign(assignmentFilter, activeLmsFilter());
        const assignmentIds = await Assignment.find(assignmentFilter).distinct('_id');
        filter.assignment = { $in: assignmentIds };
    }
    return filter;
}

// ——— Assignment submissions (admin view by course) ———
router.get('/submissions', async (req, res) => {
    try {
        const trash = parseTrashQuery(req);
        const courseId = req.query.courseId || null;
        const includeMeta = parseIncludeMeta(req);
        const { page, limit, skip } = parseListPagination(req);
        const searchFilter = await buildSubmissionSearchFilter(req.query.search, trash);
        const baseFilter = await submissionListFilter(courseId, trash);
        const activeStudentIds = await User.find({ role: 'student', ...activeUserFilter() }).distinct('_id');
        const andParts = [baseFilter, { student: { $in: activeStudentIds } }];
        if (searchFilter) andParts.push(searchFilter);
        const filter = andParts.length === 1 ? andParts[0] : { $and: andParts };
        const trashScope = courseId ? await submissionListFilter(courseId, true) : { ...trashedLmsFilter() };

        const listQuery = AssignmentSubmission.find(filter)
            .select('student assignment submittedAt status revisionCount deletedAt createdAt updatedAt')
            .populate('student', 'name email studentId deletedAt')
            .populate({
                path: 'assignment',
                select: 'title dueDate course teacher deletedAt',
                populate: [
                    { path: 'course', select: 'title instructorName deletedAt' },
                    { path: 'teacher', select: 'name email' },
                ],
            })
            .sort({ submittedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const countPromise = AssignmentSubmission.countDocuments(filter);
        const trashCountPromise = AssignmentSubmission.countDocuments(trashScope);
        const coursesPromise = includeMeta ? loadActiveCoursesMeta() : Promise.resolve(null);

        const [submissionsRaw, total, trashCount, courses] = await Promise.all([
            listQuery,
            countPromise,
            trashCountPromise,
            coursesPromise,
        ]);

        const submissions = submissionsRaw.filter((s) => {
            if (!s.student || s.student.deletedAt) return false;
            if (!s.assignment?.course || s.assignment.course.deletedAt) return false;
            if (!trash && s.assignment.deletedAt) return false;
            return true;
        });

        const payload = {
            success: true,
            submissions: submissions.map((s) => mapSubmissionForPortal(s)),
            trashCount,
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit)),
            limit,
        };
        if (includeMeta && courses) payload.courses = courses;
        res.json(payload);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load submissions' });
    }
});

router.get('/submissions/:id', async (req, res) => {
    try {
        const submission = await AssignmentSubmission.findById(req.params.id)
            .populate('student', 'name email studentId deletedAt')
            .populate({
                path: 'assignment',
                select: 'title dueDate course teacher deletedAt',
                populate: [
                    { path: 'course', select: 'title instructorName deletedAt' },
                    { path: 'teacher', select: 'name email' },
                ],
            })
            .lean();
        if (!submission || !submission.student || submission.student.deletedAt) {
            return res.status(404).json({ success: false, error: 'Submission not found' });
        }
        if (!submission.assignment?.course || submission.assignment.course.deletedAt) {
            return res.status(404).json({ success: false, error: 'Submission not found' });
        }
        res.json({ success: true, submission });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load submission' });
    }
});

router.delete('/submissions/:id/permanent', async (req, res) => {
    try {
        const doc = await AssignmentSubmission.findOne({
            _id: req.params.id,
            ...trashedLmsFilter(),
        }).lean();
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Submission must be in trash before permanent delete',
            });
        }
        const fileUrls = collectSubmissionUrls(doc);
        await AssignmentSubmission.findOneAndDelete({ _id: req.params.id, ...trashedLmsFilter() });
        await cleanupUrlsAfterPermanentDelete(fileUrls);
        res.json({ success: true, deletedCount: 1, message: 'Permanently deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete submission' });
    }
});

router.patch('/submissions/:id/restore', async (req, res) => {
    try {
        const doc = await AssignmentSubmission.findOne({ _id: req.params.id, ...trashedLmsFilter() });
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Trashed submission not found' });
        }
        const assignment = await Assignment.findOne({ _id: doc.assignment, ...activeLmsFilter() });
        if (!assignment) {
            return res.status(400).json({
                success: false,
                error: 'Restore the assignment before restoring this submission.',
            });
        }
        doc.deletedAt = null;
        await doc.save();
        res.json({ success: true, restoredCount: 1 });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore submission' });
    }
});

router.delete('/submissions/:id', async (req, res) => {
    try {
        const doc = await AssignmentSubmission.findOneAndUpdate(
            { _id: req.params.id, ...activeLmsFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Submission not found' });
        }
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to move submission to trash' });
    }
});

router.post('/submissions/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const deletedCount = await softDeleteMany(AssignmentSubmission, ids);
        res.json({ success: true, deletedCount, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to move submissions to trash' });
    }
});

router.post('/submissions/bulk-restore', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const activeAssignmentIds = await Assignment.find({ ...activeLmsFilter() }).distinct('_id');
        const result = await AssignmentSubmission.updateMany(
            {
                _id: { $in: ids },
                ...trashedLmsFilter(),
                assignment: { $in: activeAssignmentIds },
            },
            { $set: { deletedAt: null } }
        );
        res.json({ success: true, restoredCount: result.modifiedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore submissions' });
    }
});

router.post('/submissions/bulk-permanent-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const docs = await AssignmentSubmission.find({ _id: { $in: ids }, ...trashedLmsFilter() }).lean();
        const fileUrls = docs.flatMap(collectSubmissionUrls);
        const deletedCount = await permanentDeleteMany(AssignmentSubmission, ids);
        await cleanupUrlsAfterPermanentDelete(fileUrls);
        res.json({ success: true, deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete submissions' });
    }
});

module.exports = router;
