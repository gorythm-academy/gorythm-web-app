const express = require('express');
const router = express.Router();

const Course = require('../../models/Course');
const Quiz = require('../../models/Quiz');
const QuizAttempt = require('../../models/QuizAttempt');
const { getTeachersByCourseIds, getTeachersForCourse } = require('../../services/courseTeachers');
const { publishedActiveCourseFilter } = require('../../utils/courseQuery');
const { activeLmsFilter, trashedLmsFilter, parseTrashQuery } = require('../../utils/lmsTrashQuery');
const { restoreMany, permanentDeleteMany, countTrashed } = require('../../services/lmsTrashOps');
const { collectQuizUrls, collectSubmissionUrls, cleanupUrlsAfterPermanentDelete } = require('../../utils/lmsUploadCleanup');
const { normalizeQuizFiles, normalizeQuizQuestions } = require('../portal/helpers');
const { resolveValidScheduleTargets } = require('../../utils/lmsContentRules');

function requireIds(res, ids) {
    if (!Array.isArray(ids) || !ids.length) {
        res.status(400).json({ success: false, error: 'ids array required' });
        return null;
    }
    return ids;
}

async function trashQuizzesByIds(ids) {
    const trashedAt = new Date();
    const result = await Quiz.updateMany(
        { _id: { $in: ids }, ...activeLmsFilter() },
        { $set: { deletedAt: trashedAt } }
    );
    await QuizAttempt.updateMany(
        { quiz: { $in: ids }, ...activeLmsFilter() },
        { $set: { deletedAt: trashedAt } }
    );
    return result.modifiedCount;
}

async function restoreQuizzesByIds(ids) {
    const trashedQuizzes = await Quiz.find({
        _id: { $in: ids },
        ...trashedLmsFilter(),
    }).select('_id deletedAt');
    const restoredCount = await restoreMany(Quiz, ids);
    for (const quiz of trashedQuizzes) {
        if (!quiz.deletedAt) continue;
        await QuizAttempt.updateMany(
            { quiz: quiz._id, deletedAt: { $gte: quiz.deletedAt } },
            { $set: { deletedAt: null } }
        );
    }
    return restoredCount;
}

async function permanentDeleteQuizzesByIds(ids) {
    const quizzes = await Quiz.find({ _id: { $in: ids }, ...trashedLmsFilter() }).lean();
    const quizIds = quizzes.map((quiz) => quiz._id);
    const attempts = quizIds.length
        ? await QuizAttempt.find({ quiz: { $in: quizIds } }).lean()
        : [];
    const fileUrls = [
        ...quizzes.flatMap(collectQuizUrls),
        ...attempts.flatMap(collectSubmissionUrls),
    ];
    if (quizIds.length) {
        await QuizAttempt.deleteMany({ quiz: { $in: quizIds } });
    }
    const deletedCount = await permanentDeleteMany(Quiz, ids);
    await cleanupUrlsAfterPermanentDelete(fileUrls);
    return deletedCount;
}

router.get('/quizzes', async (req, res) => {
    try {
        const trash = parseTrashQuery(req);
        const listFilter = trash ? trashedLmsFilter() : activeLmsFilter();
        const [quizzes, courses, trashCount] = await Promise.all([
            Quiz.find(listFilter)
                .populate('course', 'title')
                .populate('teacher', 'name email')
                .populate('assignedSchedule', 'dayOfWeek startTime endTime')
                .sort({ createdAt: -1 })
                .lean(),
            Course.find({ ...publishedActiveCourseFilter() }).select('title').sort({ title: 1 }).lean(),
            countTrashed(Quiz),
        ]);
        const courseTeachers = await getTeachersByCourseIds(courses.map((c) => c._id));
        const attemptCounts = await QuizAttempt.aggregate([
            { $match: { quiz: { $in: quizzes.map((q) => q._id) }, ...(trash ? trashedLmsFilter() : activeLmsFilter()) } },
            { $group: { _id: '$quiz', count: { $sum: 1 } } },
        ]);
        const countByQuiz = Object.fromEntries(attemptCounts.map((r) => [String(r._id), r.count]));
        res.json({
            success: true,
            quizzes: quizzes.map((q) => ({ ...q, attemptCount: countByQuiz[String(q._id)] || 0 })),
            courses,
            courseTeachers,
            trashCount,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quizzes' });
    }
});

router.post('/quizzes', async (req, res) => {
    try {
        const { scheduleIds, title, questions, totalMarks, dueDate } = req.body || {};
        const quizType = req.body?.quizType === 'file' ? 'file' : 'mcq';
        if (!title || !String(title).trim()) {
            return res.status(400).json({ success: false, error: 'Title is required' });
        }
        const targets = await resolveValidScheduleTargets({ scheduleIds });
        const files = normalizeQuizFiles(req.body);
        let normalized = [];
        if (quizType === 'file') {
            if (!files.resourceLink && !files.attachments.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Add a reading link or at least one study file',
                });
            }
        } else {
            normalized = normalizeQuizQuestions(questions);
            if (!normalized.length) {
                return res.status(400).json({ success: false, error: 'Add at least one question with 3 options' });
            }
        }
        const shared = {
            title: String(title).trim(),
            quizType,
            questions: normalized,
            totalMarks: quizType === 'file' ? null : totalMarks != null && totalMarks !== '' ? Number(totalMarks) : null,
            dueDate: dueDate ? new Date(dueDate) : null,
            resourceLink: quizType === 'file' ? files.resourceLink : '',
            resourceFileUrl: quizType === 'file' ? files.resourceFileUrl : '',
            attachments: quizType === 'file' ? files.attachments : [],
            createdByRole: 'admin',
            lockedForTeacher: true,
            status: 'published',
        };
        const created = await Quiz.insertMany(
            targets.map(({ courseId: cid, teacherId: tid, scheduleId: sid }) => ({
                ...shared,
                course: cid,
                teacher: tid,
                assignedSchedule: sid,
            }))
        );
        const populated = await Quiz.find({ _id: { $in: created.map((quiz) => quiz._id) } })
            .populate('course', 'title')
            .populate('teacher', 'name email');
        res.status(201).json({
            success: true,
            createdCount: populated.length,
            quizzes: populated,
            quiz: populated[0] || null,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to create quiz' });
    }
});

router.patch('/quizzes/:id', async (req, res) => {
    try {
        const quiz = await Quiz.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const { courseId, teacherId, scheduleId, title, questions, totalMarks, dueDate } = req.body || {};
        if (scheduleId) {
            const [target] = await resolveValidScheduleTargets({ scheduleIds: [scheduleId] });
            quiz.course = target.courseId;
            quiz.teacher = target.teacherId;
            quiz.assignedSchedule = target.scheduleId;
        } else if (courseId) {
            const course = await Course.findOne({ _id: courseId, ...publishedActiveCourseFilter() });
            if (!course) return res.status(404).json({ success: false, error: 'Course not found or not published' });
            quiz.course = courseId;
        }
        if (!scheduleId) {
            const nextTeacher = teacherId || quiz.teacher;
            const teachers = await getTeachersForCourse(quiz.course);
            if (!teachers.some((t) => String(t._id) === String(nextTeacher))) {
                return res.status(400).json({ success: false, error: 'That teacher does not teach this course' });
            }
            quiz.teacher = nextTeacher;
        }
        if (title !== undefined) quiz.title = String(title).trim();
        if (quiz.quizType === 'file') {
            const files = normalizeQuizFiles({
                resourceLink: req.body.resourceLink !== undefined ? req.body.resourceLink : quiz.resourceLink,
                attachments: req.body.attachments !== undefined ? req.body.attachments : quiz.attachments,
                resourceFileUrl: req.body.resourceFileUrl,
            });
            quiz.resourceLink = files.resourceLink;
            quiz.resourceFileUrl = files.resourceFileUrl;
            quiz.attachments = files.attachments;
            if (!quiz.resourceLink && !quiz.attachments.length) {
                return res.status(400).json({
                    success: false,
                    error: 'A file/reading quiz needs a reading link or a study file',
                });
            }
        } else if (questions !== undefined) {
            const attemptCount = await QuizAttempt.countDocuments({ quiz: quiz._id, ...activeLmsFilter() });
            if (attemptCount > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Students have already taken this quiz. Questions cannot be changed.',
                });
            }
            const normalized = normalizeQuizQuestions(questions);
            if (!normalized.length) {
                return res.status(400).json({ success: false, error: 'Add at least one valid question' });
            }
            quiz.questions = normalized;
            quiz.attachments = [];
            quiz.resourceFileUrl = '';
            quiz.resourceLink = '';
        }
        if (totalMarks !== undefined && quiz.quizType !== 'file') {
            quiz.totalMarks = totalMarks != null && totalMarks !== '' ? Number(totalMarks) : null;
        }
        if (dueDate !== undefined) quiz.dueDate = dueDate ? new Date(dueDate) : null;
        quiz.createdByRole = 'admin';
        quiz.lockedForTeacher = true;
        await quiz.save();
        const populated = await Quiz.findById(quiz._id).populate('course', 'title').populate('teacher', 'name email');
        res.json({ success: true, quiz: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to update quiz' });
    }
});

router.post('/quizzes/bulk-delete', async (req, res) => {
    try {
        const ids = requireIds(res, req.body?.ids);
        if (!ids) return;
        const deletedCount = await trashQuizzesByIds(ids);
        res.json({ success: true, deletedCount, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to move quizzes to trash' });
    }
});

router.post('/quizzes/bulk-restore', async (req, res) => {
    try {
        const ids = requireIds(res, req.body?.ids);
        if (!ids) return;
        const restoredCount = await restoreQuizzesByIds(ids);
        res.json({ success: true, restoredCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore quizzes' });
    }
});

router.post('/quizzes/bulk-permanent-delete', async (req, res) => {
    try {
        const ids = requireIds(res, req.body?.ids);
        if (!ids) return;
        const deletedCount = await permanentDeleteQuizzesByIds(ids);
        res.json({ success: true, deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete quizzes' });
    }
});

router.delete('/quizzes/:id', async (req, res) => {
    try {
        const deletedCount = await trashQuizzesByIds([req.params.id]);
        if (!deletedCount) return res.status(404).json({ success: false, error: 'Quiz not found' });
        res.json({ success: true, deletedCount, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete quiz' });
    }
});

module.exports = router;
