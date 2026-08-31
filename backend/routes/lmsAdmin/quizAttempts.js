const express = require('express');
const router = express.Router();

const User = require('../../models/User');
const Quiz = require('../../models/Quiz');
const QuizAttempt = require('../../models/QuizAttempt');
const { buildQuizReviewPayload, formatScoreDisplay } = require('../../utils/quizReview');
const { activeUserFilter } = require('../../utils/userQuery');
const { activeLmsFilter, trashedLmsFilter, parseTrashQuery } = require('../../utils/lmsTrashQuery');
const { softDeleteMany, restoreMany, permanentDeleteMany } = require('../../services/lmsTrashOps');
const { parseListPagination, parseIncludeMeta, escapeRegex, loadActiveCoursesMeta } = require('./shared');

async function buildQuizAttemptSearchFilter(search) {
    const q = String(search || '').trim();
    if (!q) return null;
    const re = new RegExp(escapeRegex(q), 'i');
    const [studentIds, quizIds, teacherIds] = await Promise.all([
        User.find({
            role: 'student',
            ...activeUserFilter(),
            $or: [{ name: re }, { studentId: re }, { email: re }],
        }).distinct('_id'),
        Quiz.find({ title: re }).distinct('_id'),
        User.find({ role: 'teacher', ...activeUserFilter(), name: re }).distinct('_id'),
    ]);
    let teacherQuizIds = [];
    if (teacherIds.length) {
        teacherQuizIds = await Quiz.find({ teacher: { $in: teacherIds } }).distinct('_id');
    }
    const allQuizIds = [...new Set([...quizIds.map(String), ...teacherQuizIds.map(String)])];
    const or = [];
    if (studentIds.length) or.push({ student: { $in: studentIds } });
    if (allQuizIds.length) or.push({ quiz: { $in: allQuizIds } });
    if (!or.length) return { _id: null };
    return { $or: or };
}

async function quizAttemptListFilter(courseId, trash) {
    const filter = trash ? { ...trashedLmsFilter() } : { ...activeLmsFilter() };
    if (courseId) {
        const quizIds = await Quiz.find({ course: courseId }).distinct('_id');
        filter.quiz = { $in: quizIds };
    }
    return filter;
}

router.get('/quiz-attempts', async (req, res) => {
    try {
        const trash = parseTrashQuery(req);
        const courseId = req.query.courseId || null;
        const includeMeta = parseIncludeMeta(req);
        const { page, limit, skip } = parseListPagination(req);
        const searchFilter = await buildQuizAttemptSearchFilter(req.query.search);
        const baseFilter = await quizAttemptListFilter(courseId, trash);
        const activeStudentIds = await User.find({ role: 'student', ...activeUserFilter() }).distinct('_id');
        const andParts = [baseFilter, { student: { $in: activeStudentIds } }];
        if (searchFilter) andParts.push(searchFilter);
        const filter = andParts.length === 1 ? andParts[0] : { $and: andParts };
        const trashScope = courseId ? await quizAttemptListFilter(courseId, true) : { ...trashedLmsFilter() };

        const listQuery = QuizAttempt.find(filter)
            .select('student quiz score submittedAt createdAt deletedAt')
            .populate('student', 'name email studentId deletedAt')
            .populate({
                path: 'quiz',
                select: 'title totalMarks course teacher',
                populate: [
                    { path: 'course', select: 'title instructorName deletedAt' },
                    { path: 'teacher', select: 'name email' },
                ],
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const countPromise = QuizAttempt.countDocuments(filter);
        const trashCountPromise = QuizAttempt.countDocuments(trashScope);
        const coursesPromise = includeMeta ? loadActiveCoursesMeta() : Promise.resolve(null);

        const [attemptsRaw, total, trashCount, courses] = await Promise.all([
            listQuery,
            countPromise,
            trashCountPromise,
            coursesPromise,
        ]);

        const attempts = attemptsRaw
            .filter(
                (a) =>
                    a.student &&
                    !a.student.deletedAt &&
                    a.quiz?.course &&
                    !a.quiz.course.deletedAt
            )
            .map((a) => ({
                ...a,
                scoreDisplay: formatScoreDisplay(a.score, a.quiz?.totalMarks),
            }));

        const payload = {
            success: true,
            trashCount,
            attempts,
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit)),
            limit,
        };
        if (includeMeta && courses) payload.courses = courses;
        res.json(payload);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quiz attempts' });
    }
});

router.get('/quiz-attempts/:id', async (req, res) => {
    try {
        const attemptDoc = await QuizAttempt.findById(req.params.id)
            .populate('student', 'name email studentId deletedAt')
            .populate({
                path: 'quiz',
                select: 'title totalMarks course teacher questions',
                populate: [
                    { path: 'course', select: 'title instructorName deletedAt' },
                    { path: 'teacher', select: 'name email' },
                ],
            });
        if (!attemptDoc) {
            return res.status(404).json({ success: false, error: 'Quiz attempt not found' });
        }
        const a = attemptDoc.toObject();
        if (!a.student || a.student.deletedAt || !a.quiz?.course || a.quiz.course.deletedAt) {
            return res.status(404).json({ success: false, error: 'Quiz attempt not found' });
        }
        a.scoreDisplay = formatScoreDisplay(a.score, a.quiz?.totalMarks);
        a.review = buildQuizReviewPayload(a.quiz, a.answers || []);
        res.json({ success: true, attempt: a });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quiz attempt' });
    }
});

router.delete('/quiz-attempts/:id/permanent', async (req, res) => {
    try {
        const doc = await QuizAttempt.findOneAndDelete({
            _id: req.params.id,
            ...trashedLmsFilter(),
        });
        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Quiz attempt must be in trash before permanent delete',
            });
        }
        res.json({ success: true, deletedCount: 1, message: 'Permanently deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete quiz attempt' });
    }
});

router.patch('/quiz-attempts/:id/restore', async (req, res) => {
    try {
        const doc = await QuizAttempt.findOneAndUpdate(
            { _id: req.params.id, ...trashedLmsFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Trashed quiz attempt not found' });
        }
        res.json({ success: true, restoredCount: 1 });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore quiz attempt' });
    }
});

router.delete('/quiz-attempts/:id', async (req, res) => {
    try {
        const doc = await QuizAttempt.findOneAndUpdate(
            { _id: req.params.id, ...activeLmsFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Quiz attempt not found' });
        }
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to move quiz attempt to trash' });
    }
});

router.post('/quiz-attempts/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const deletedCount = await softDeleteMany(QuizAttempt, ids);
        res.json({ success: true, deletedCount, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to move quiz attempts to trash' });
    }
});

router.post('/quiz-attempts/bulk-restore', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const restoredCount = await restoreMany(QuizAttempt, ids);
        res.json({ success: true, restoredCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore quiz attempts' });
    }
});

router.post('/quiz-attempts/bulk-permanent-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const deletedCount = await permanentDeleteMany(QuizAttempt, ids);
        res.json({ success: true, deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete quiz attempts' });
    }
});

module.exports = router;
