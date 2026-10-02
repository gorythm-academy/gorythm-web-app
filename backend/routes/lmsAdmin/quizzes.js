const express = require('express');
const router = express.Router();

const Course = require('../../models/Course');
const Quiz = require('../../models/Quiz');
const QuizAttempt = require('../../models/QuizAttempt');
const { getTeachersByCourseIds, getTeachersForCourse } = require('../../services/courseTeachers');
const { publishedActiveCourseFilter } = require('../../utils/courseQuery');
const { activeLmsFilter } = require('../../utils/lmsTrashQuery');
const { normalizeQuizFiles, normalizeQuizQuestions } = require('../portal/helpers');

router.get('/quizzes', async (req, res) => {
    try {
        const [quizzes, courses] = await Promise.all([
            Quiz.find({ ...activeLmsFilter() })
                .populate('course', 'title')
                .populate('teacher', 'name email')
                .sort({ createdAt: -1 })
                .lean(),
            Course.find({ ...publishedActiveCourseFilter() }).select('title').sort({ title: 1 }).lean(),
        ]);
        const courseTeachers = await getTeachersByCourseIds(courses.map((c) => c._id));
        const attemptCounts = await QuizAttempt.aggregate([
            { $match: { quiz: { $in: quizzes.map((q) => q._id) }, ...activeLmsFilter() } },
            { $group: { _id: '$quiz', count: { $sum: 1 } } },
        ]);
        const countByQuiz = Object.fromEntries(attemptCounts.map((r) => [String(r._id), r.count]));
        res.json({
            success: true,
            quizzes: quizzes.map((q) => ({ ...q, attemptCount: countByQuiz[String(q._id)] || 0 })),
            courses,
            courseTeachers,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quizzes' });
    }
});

router.post('/quizzes', async (req, res) => {
    try {
        const { courseId, teacherId, title, questions, totalMarks, dueDate } = req.body || {};
        const quizType = req.body?.quizType === 'file' ? 'file' : 'mcq';
        if (!courseId || !teacherId || !title) {
            return res.status(400).json({ success: false, error: 'Course, teacher, and title are required' });
        }
        const course = await Course.findOne({ _id: courseId, ...publishedActiveCourseFilter() });
        if (!course) return res.status(404).json({ success: false, error: 'Course not found or not published' });
        const teachers = await getTeachersForCourse(courseId);
        if (!teachers.some((t) => String(t._id) === String(teacherId))) {
            return res.status(400).json({ success: false, error: 'That teacher does not teach this course' });
        }
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
        const quiz = await Quiz.create({
            title: String(title).trim(),
            course: courseId,
            teacher: teacherId,
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
        });
        const populated = await Quiz.findById(quiz._id).populate('course', 'title').populate('teacher', 'name email');
        res.status(201).json({ success: true, quiz: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to create quiz' });
    }
});

router.patch('/quizzes/:id', async (req, res) => {
    try {
        const quiz = await Quiz.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const { courseId, teacherId, title, questions, totalMarks, dueDate } = req.body || {};
        if (courseId) {
            const course = await Course.findOne({ _id: courseId, ...publishedActiveCourseFilter() });
            if (!course) return res.status(404).json({ success: false, error: 'Course not found or not published' });
            quiz.course = courseId;
        }
        const nextTeacher = teacherId || quiz.teacher;
        const teachers = await getTeachersForCourse(quiz.course);
        if (!teachers.some((t) => String(t._id) === String(nextTeacher))) {
            return res.status(400).json({ success: false, error: 'That teacher does not teach this course' });
        }
        quiz.teacher = nextTeacher;
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

router.delete('/quizzes/:id', async (req, res) => {
    try {
        const quiz = await Quiz.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const trashedAt = new Date();
        quiz.deletedAt = trashedAt;
        await quiz.save();
        await QuizAttempt.updateMany({ quiz: quiz._id, ...activeLmsFilter() }, { $set: { deletedAt: trashedAt } });
        res.json({ success: true, message: 'Quiz moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete quiz' });
    }
});

module.exports = router;
