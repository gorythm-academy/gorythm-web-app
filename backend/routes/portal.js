const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const Enrollment = require('../models/Enrollment');
const AttendanceRecord = require('../models/AttendanceRecord');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Resource = require('../models/Resource');
const ParentStudentLink = require('../models/ParentStudentLink');

router.use(authMiddleware);

// Student dashboard + content
router.get('/student/dashboard', allowRoles('student'), async (req, res) => {
    try {
        const studentId = req.user.userId;
        const enrollments = await Enrollment.find({ student: studentId }).populate('course', 'title category');
        const courseIds = enrollments.map((e) => e.course?._id).filter(Boolean);

        const attendance = await AttendanceRecord.find({ student: studentId });
        const presentCount = attendance.filter((r) => r.status === 'present').length;
        const attendanceRate = attendance.length ? Math.round((presentCount / attendance.length) * 100) : 0;

        const assignments = await Assignment.find({ course: { $in: courseIds }, status: 'published' })
            .sort({ dueDate: 1 })
            .limit(10);
        const submissions = await AssignmentSubmission.find({ student: studentId });

        const quizzes = await Quiz.find({ course: { $in: courseIds }, status: 'published' }).limit(10);
        const attempts = await QuizAttempt.find({ student: studentId });
        const resources = await Resource.find({ course: { $in: courseIds } }).sort({ createdAt: -1 }).limit(10);

        res.json({
            success: true,
            summary: {
                enrolledCourses: enrollments.length,
                attendanceRate,
                assignmentsDue: assignments.length,
                quizzesAvailable: quizzes.length,
            },
            enrollments,
            assignments,
            submissionsCount: submissions.length,
            quizzes,
            attemptsCount: attempts.length,
            resources,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load student portal data' });
    }
});

router.post('/student/submissions', allowRoles('student'), async (req, res) => {
    try {
        const { assignmentId, text, attachments = [] } = req.body;
        const submission = await AssignmentSubmission.create({
            assignment: assignmentId,
            student: req.user.userId,
            text: text || '',
            attachments,
        });
        res.status(201).json({ success: true, submission });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to submit assignment' });
    }
});

router.post('/student/quiz-attempts', allowRoles('student'), async (req, res) => {
    try {
        const { quizId, answers = [] } = req.body;
        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        let score = 0;
        quiz.questions.forEach((q, idx) => {
            if (answers[idx] === q.correctAnswer) score += 1;
        });
        const attempt = await QuizAttempt.create({
            quiz: quizId,
            student: req.user.userId,
            answers,
            score,
        });
        res.status(201).json({ success: true, attempt });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to submit quiz attempt' });
    }
});

// Teacher dashboard + content management
router.get('/teacher/dashboard', allowRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.user.userId;
        const courses = await Resource.distinct('course', { uploadedBy: teacherId });
        const assignmentsCount = await Assignment.countDocuments({ teacher: teacherId });
        const quizzesCount = await Quiz.countDocuments({ teacher: teacherId });
        const pendingSubmissions = await AssignmentSubmission.countDocuments({ status: 'submitted' });
        res.json({
            success: true,
            summary: {
                coursesManaged: courses.length,
                assignmentsCount,
                quizzesCount,
                pendingSubmissions,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teacher dashboard' });
    }
});

router.post('/teacher/attendance', allowRoles('teacher'), async (req, res) => {
    try {
        const { courseId, records = [] } = req.body;
        const created = await Promise.all(
            records.map((r) =>
                AttendanceRecord.create({
                    course: courseId,
                    teacher: req.user.userId,
                    student: r.studentId,
                    status: r.status || 'present',
                    notes: r.notes || '',
                    date: r.date || new Date(),
                })
            )
        );
        res.status(201).json({ success: true, createdCount: created.length });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark attendance' });
    }
});

router.post('/teacher/assignments', allowRoles('teacher'), async (req, res) => {
    try {
        const assignment = await Assignment.create({
            ...req.body,
            teacher: req.user.userId,
        });
        res.status(201).json({ success: true, assignment });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create assignment' });
    }
});

router.post('/teacher/quizzes', allowRoles('teacher'), async (req, res) => {
    try {
        const quiz = await Quiz.create({
            ...req.body,
            teacher: req.user.userId,
        });
        res.status(201).json({ success: true, quiz });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create quiz' });
    }
});

router.post('/teacher/resources', allowRoles('teacher'), async (req, res) => {
    try {
        const resource = await Resource.create({
            ...req.body,
            uploadedBy: req.user.userId,
        });
        res.status(201).json({ success: true, resource });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create resource' });
    }
});

// Parent dashboard
router.get('/parent/dashboard', allowRoles('parent'), async (req, res) => {
    try {
        const parentId = req.user.userId;
        const links = await ParentStudentLink.find({ parent: parentId }).populate('student', 'name email');
        const studentIds = links.map((l) => l.student?._id).filter(Boolean);

        const enrollments = await Enrollment.find({ student: { $in: studentIds } }).populate('course', 'title');
        const attendance = await AttendanceRecord.find({ student: { $in: studentIds } });
        const quizAttempts = await QuizAttempt.find({ student: { $in: studentIds } });

        res.json({
            success: true,
            children: links,
            summary: {
                childrenCount: links.length,
                enrollmentsCount: enrollments.length,
                attendanceRecords: attendance.length,
                quizAttempts: quizAttempts.length,
            },
            enrollments,
            attendance,
            quizAttempts,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load parent dashboard' });
    }
});

// Admin helper for linking parents and students
router.post('/admin/link-parent-student', allowRoles('admin', 'super-admin'), async (req, res) => {
    try {
        const { parentId, studentId, relation = 'guardian' } = req.body;
        const link = await ParentStudentLink.findOneAndUpdate(
            { parent: parentId, student: studentId },
            { relation },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to link parent and student' });
    }
});

module.exports = router;
