const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { allowPortalRoles, getPortalActorId, previewDashboardPayload } = require('../middleware/portalAccess');
const PayrollRun = require('../models/PayrollRun');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const TeacherAttendance = require('../models/TeacherAttendance');
const {
    normalizeMonthKey,
    getTeacherAttendanceForPayroll,
    calculatePayrollAmounts,
    buildPayrollRun,
} = require('../services/payrollCalculation');
const Enrollment = require('../models/Enrollment');
const AttendanceRecord = require('../models/AttendanceRecord');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Resource = require('../models/Resource');
const ParentStudentLink = require('../models/ParentStudentLink');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const ClassSchedule = require('../models/ClassSchedule');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const { getCourseRosterStudents } = require('../services/courseRoster');
const {
    isoDateKey,
    monthBounds,
    buildMonthCalendar,
    aggregateWorkingDaysOnly,
    aggregateTeacherMonthlyFromDays: aggregateMonthlyWithCalendar,
} = require('../services/teacherAttendanceCalendar');
const User = require('../models/User');
const {
    enrichEnrollmentsWithPaymentStatus,
    countPendingFeesForStudents,
} = require('../services/enrollmentPaymentStatus');
const { isValidAttendanceStatus } = require('../constants/attendanceStatuses');

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

router.use(authMiddleware);
router.use((req, res, next) => {
    req.portalActorId = getPortalActorId(req);
    next();
});

function emptyList(res, extra = {}) {
    return res.json({ success: true, previewMode: true, ...extra });
}

async function getStudentCourseIds(studentId) {
    if (!studentId) return [];
    const enrollments = await Enrollment.find({
        student: studentId,
        course: { $ne: null },
        status: { $in: ['active', 'completed', 'pending'] },
    });
    return enrollments.map((e) => e.course).filter(Boolean);
}

async function assertParentChild(parentId, studentId) {
    const link = await ParentStudentLink.findOne({ parent: parentId, student: studentId });
    if (!link) {
        const err = new Error('Child not linked to this parent');
        err.status = 403;
        throw err;
    }
    return link;
}

function dayRange(dateInput) {
    const dayStart = dateInput ? new Date(dateInput) : new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    return { dayStart, dayEnd };
}

async function assertTeacherOwnsCourse(teacherId, courseId) {
    const course = await Course.findOne({ _id: courseId, instructor: teacherId });
    if (!course) {
        const err = new Error('Not your course');
        err.status = 403;
        throw err;
    }
    return course;
}

function formatScoreDisplay(score, maxPoints) {
    if (score == null) return '—';
    if (maxPoints != null && maxPoints > 0) return `${score} / ${maxPoints}`;
    return String(score);
}

/** Each question must have exactly 3 options (A/B/C). */
function normalizeQuizQuestions(questions) {
    return (questions || [])
        .map((q) => {
            const opts = (q.options || []).map((o) => String(o).trim());
            while (opts.length < 3) opts.push('');
            const options = opts.slice(0, 3);
            let correctAnswer = Number(q.correctAnswer);
            if (!Number.isFinite(correctAnswer) || correctAnswer < 0 || correctAnswer > 2) {
                correctAnswer = 0;
            }
            return {
                question: String(q.question || '').trim(),
                options,
                correctAnswer,
            };
        })
        .filter((q) => q.question);
}

function buildQuizReviewPayload(quiz, answers) {
    const questions = quiz.questions || [];
    const total = questions.length;
    let correctCount = 0;
    const items = questions.map((q, idx) => {
        const chosen = answers[idx] != null ? Number(answers[idx]) : -1;
        const correctIdx = Number(q.correctAnswer) ?? 0;
        const isCorrect = chosen === correctIdx;
        if (isCorrect) correctCount += 1;
        return {
            question: q.question,
            options: (q.options || []).slice(0, 3),
            correctIndex: correctIdx,
            chosenIndex: chosen,
            isCorrect,
        };
    });
    const normalizedScore =
        quiz.totalMarks != null && quiz.totalMarks > 0 && total
            ? Math.round((correctCount / total) * quiz.totalMarks)
            : correctCount;
    return {
        items,
        correctCount,
        totalQuestions: total,
        score: normalizedScore,
        scoreDisplay: formatScoreDisplay(normalizedScore, quiz.totalMarks),
    };
}

/** One record per course+day (latest wins) for accurate attendance %. */
function dedupeAttendanceRecords(records) {
    const byKey = {};
    records.forEach((r) => {
        const day = new Date(r.date);
        day.setHours(0, 0, 0, 0);
        const key = `${String(r.course)}-${String(r.student)}-${day.getTime()}`;
        const prev = byKey[key];
        if (!prev || new Date(r.updatedAt || r.createdAt) > new Date(prev.updatedAt || prev.createdAt)) {
            byKey[key] = r;
        }
    });
    return Object.values(byKey);
}

function attendancePresentRate(records) {
    const unique = dedupeAttendanceRecords(records);
    if (!unique.length) return 0;
    const present = unique.filter((r) => r.status === 'present' || r.status === 'late').length;
    return Math.round((present / unique.length) * 100);
}

// ————————————————— STUDENT —————————————————

router.get('/student/dashboard', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.json(previewDashboardPayload('student'));
        const enrollmentsRaw = await Enrollment.find({ student: studentId }).populate('course', 'title category price');
        const enrollments = await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        );
        const courseIds = enrollments.map((e) => e.course?._id).filter(Boolean);

        const attendance = await AttendanceRecord.find({ student: studentId });
        const attendanceRate = attendancePresentRate(attendance);

        const now = new Date();
        const assignments = await Assignment.find({ course: { $in: courseIds }, status: 'published' })
            .populate('course', 'title')
            .sort({ dueDate: 1 })
            .limit(50);
        const submissions = await AssignmentSubmission.find({ student: studentId });
        const submittedIds = new Set(submissions.map((s) => String(s.assignment)));
        const dueAssignments = assignments.filter(
            (a) => !submittedIds.has(String(a._id)) && a.dueDate && new Date(a.dueDate) >= now
        );

        const quizzes = await Quiz.find({ course: { $in: courseIds }, status: 'published' }).limit(20);

        const pendingFees = enrollments.filter((e) => e.paymentStatus === 'pending' && e.course).length;

        res.json({
            success: true,
            summary: {
                enrolledCourses: enrollments.filter((e) => e.course).length,
                attendanceRate,
                assignmentsDue: dueAssignments.length,
                quizzesAvailable: quizzes.length,
                pendingFees,
            },
            enrollments,
            dueAssignments: dueAssignments.map((a) => ({
                _id: a._id,
                title: a.title,
                dueDate: a.dueDate,
                course: a.course,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load student portal data' });
    }
});

router.get('/student/courses', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return emptyList(res, { enrollments: [] });
        const enrollmentsRaw = await Enrollment.find({ student: studentId })
            .populate('course', 'title category description price duration level instructorName')
            .sort({ enrollmentDate: -1 });
        const enrollments = await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        );
        res.json({ success: true, enrollments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load courses' });
    }
});

router.get('/student/fees', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return emptyList(res, { enrollments: [], payments: [] });
        const enrollmentsRaw = await Enrollment.find({ student: studentId })
            .populate('course', 'title price')
            .sort({ updatedAt: -1 });
        const enrollments = await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        );
        const payments = await Payment.find({
            $or: [{ user: studentId }, { email: req.user.email }],
        })
            .populate('course', 'title')
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ success: true, enrollments, payments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load fees' });
    }
});

router.get('/student/schedule', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return emptyList(res, { schedules: [], dayLabels: DAY_LABELS });
        const courseIds = await getStudentCourseIds(studentId);
        const schedules = await ClassSchedule.find({ course: { $in: courseIds } })
            .populate('course', 'title')
            .populate('teacher', 'name')
            .sort({ dayOfWeek: 1, startTime: 1 });
        res.json({ success: true, schedules, dayLabels: DAY_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedule' });
    }
});

router.get('/student/assignments', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return emptyList(res, { assignments: [] });
        const courseIds = await getStudentCourseIds(studentId);
        const assignments = await Assignment.find({ course: { $in: courseIds }, status: 'published' })
            .populate('course', 'title')
            .sort({ dueDate: 1 });
        const submissions = await AssignmentSubmission.find({ student: studentId });
        const byAssignment = Object.fromEntries(submissions.map((s) => [String(s.assignment), s]));
        res.json({
            success: true,
            assignments: assignments.map((a) => ({
                ...a.toObject(),
                submission: byAssignment[String(a._id)] || null,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.get('/student/quizzes/:quizId', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(400).json({ success: false, error: 'Preview mode: quiz not available' });
        const quiz = await Quiz.findById(req.params.quizId).populate('course', 'title');
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(quiz.course._id || quiz.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const obj = quiz.toObject();
        obj.questions = (obj.questions || []).map((q) => {
            const { correctAnswer, ...rest } = q;
            return rest;
        });
        const attempt = await QuizAttempt.findOne({ quiz: quiz._id, student: studentId });
        let review = null;
        if (attempt) {
            const fullQuiz = await Quiz.findById(quiz._id).select('questions totalMarks title');
            review = buildQuizReviewPayload(fullQuiz, attempt.answers || []);
        }
        res.json({ success: true, quiz: obj, attempt, review });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quiz' });
    }
});

router.get('/student/quizzes', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return emptyList(res, { quizzes: [] });
        const courseIds = await getStudentCourseIds(studentId);
        const quizzes = await Quiz.find({ course: { $in: courseIds }, status: 'published' })
            .populate('course', 'title')
            .select('-questions.correctAnswer');
        const attempts = await QuizAttempt.find({ student: studentId });
        const byQuiz = Object.fromEntries(attempts.map((a) => [String(a.quiz), a]));
        res.json({
            success: true,
            quizzes: quizzes.map((q) => ({
                ...q.toObject(),
                attempt: byQuiz[String(q._id)] || null,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quizzes' });
    }
});

router.get('/student/content', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return emptyList(res, { courses: [], resources: [] });
        const courseIds = await getStudentCourseIds(studentId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title modules');
        const resources = await Resource.find({ course: { $in: courseIds } })
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        res.json({ success: true, courses, resources });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load content' });
    }
});

router.get('/student/attendance', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return emptyList(res, { records: [] });
        const records = await AttendanceRecord.find({ student: studentId })
            .populate('course', 'title')
            .sort({ date: -1 })
            .limit(100);
        res.json({ success: true, records });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance' });
    }
});

router.post('/student/submissions', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(400).json({ success: false, error: 'Preview mode: submit not available' });
        const { assignmentId, text, attachments = [] } = req.body;
        const hasText = String(text || '').trim().length > 0;
        const hasFiles = Array.isArray(attachments) && attachments.length > 0;
        if (!hasText && !hasFiles) {
            return res.status(400).json({ success: false, error: 'Add a written answer or attach a file' });
        }
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(assignment.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const existing = await AssignmentSubmission.findOne({ assignment: assignmentId, student: studentId });
        if (existing?.status === 'graded') {
            return res.status(400).json({ success: false, error: 'This assignment is already graded and cannot be resubmitted' });
        }
        let submission;
        if (existing) {
            existing.text = text || '';
            existing.attachments = Array.isArray(attachments) ? attachments : [];
            existing.submittedAt = new Date();
            existing.status = 'submitted';
            await existing.save();
            submission = existing;
        } else {
            submission = await AssignmentSubmission.create({
                assignment: assignmentId,
                student: studentId,
                text: text || '',
                attachments: Array.isArray(attachments) ? attachments : [],
            });
        }
        res.status(201).json({ success: true, submission });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to submit assignment' });
    }
});

router.post('/student/quiz-attempts', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(400).json({ success: false, error: 'Preview mode: quiz not available' });
        const { quizId, answers = [] } = req.body;
        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(quiz.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const prior = await QuizAttempt.findOne({ quiz: quizId, student: studentId });
        if (prior) {
            return res.status(400).json({ success: false, error: 'You have already attempted this quiz' });
        }
        const review = buildQuizReviewPayload(quiz, answers);
        const attempt = await QuizAttempt.create({
            quiz: quizId,
            student: studentId,
            answers,
            score: review.score,
        });
        res.status(201).json({
            success: true,
            attempt,
            review,
            totalQuestions: review.totalQuestions,
            rawCorrect: review.correctCount,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to submit quiz attempt' });
    }
});

// ————————————————— TEACHER —————————————————

router.get('/teacher/dashboard', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = getPortalActorId(req);
        if (!teacherId) return res.json(previewDashboardPayload('teacher'));
        const courses = await Course.find({ instructor: teacherId }).select('title category');
        const assignmentsCount = await Assignment.countDocuments({ teacher: teacherId });
        const quizzesCount = await Quiz.countDocuments({ teacher: teacherId });
        const courseIds = courses.map((c) => c._id);
        const myAssignmentIds = await Assignment.find({ course: { $in: courseIds } }).distinct('_id');
        const pendingSubmissions = await AssignmentSubmission.countDocuments({
            assignment: { $in: myAssignmentIds },
            status: 'submitted',
        });
        res.json({
            success: true,
            summary: {
                coursesManaged: courses.length,
                assignmentsCount,
                quizzesCount,
                pendingSubmissions,
            },
            courses,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teacher dashboard' });
    }
});

router.get('/teacher/courses', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = getPortalActorId(req);
        if (!teacherId) return emptyList(res, { courses: [] });
        const courses = await Course.find({ instructor: teacherId }).sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load courses' });
    }
});

router.get('/teacher/courses/:courseId/roster', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const course = await Course.findOne({ _id: req.params.courseId, instructor: req.portalActorId });
        if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
        const students = await getCourseRosterStudents(course._id);
        res.json({ success: true, enrollments: students, students, count: students.length });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load roster' });
    }
});

router.get('/teacher/assignments', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const courseIds = await Course.find({ instructor: req.portalActorId }).distinct('_id');
        const assignments = await Assignment.find({ course: { $in: courseIds } })
            .populate('course', 'title')
            .populate('teacher', 'name')
            .sort({ dueDate: -1 });
        res.json({ success: true, assignments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.get('/teacher/submissions', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const courseIds = await Course.find({ instructor: req.portalActorId }).distinct('_id');
        const myAssignments = await Assignment.find({ course: { $in: courseIds } }).select('_id');
        const ids = myAssignments.map((a) => a._id);
        const filter = { assignment: { $in: ids } };
        if (req.query.ungradedOnly === 'true') filter.status = 'submitted';
        const submissions = await AssignmentSubmission.find(filter)
            .populate('student', 'name email studentId')
            .populate('assignment', 'title maxPoints description attachments dueDate')
            .sort({ submittedAt: -1 });
        res.json({ success: true, submissions });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load submissions' });
    }
});

router.patch('/teacher/submissions/:id/grade', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { score, feedback, status = 'graded' } = req.body;
        const submission = await AssignmentSubmission.findById(req.params.id).populate('assignment');
        if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });
        const courseIds = await Course.find({ instructor: req.portalActorId }).distinct('_id');
        const courseIdStr = String(submission.assignment.course?._id || submission.assignment.course);
        if (!courseIds.some((id) => String(id) === courseIdStr)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }
        const maxPts = submission.assignment?.maxPoints;
        if (score == null || Number.isNaN(Number(score))) {
            return res.status(400).json({ success: false, error: 'Valid score is required' });
        }
        if (maxPts != null && Number(score) > Number(maxPts)) {
            return res.status(400).json({
                success: false,
                error: `Score cannot exceed maximum points (${maxPts})`,
            });
        }
        submission.score = Number(score);
        submission.feedback = feedback || '';
        submission.status = status;
        await submission.save();
        res.json({ success: true, submission });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to grade submission' });
    }
});

router.get('/teacher/quizzes', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const quizzes = await Quiz.find({ teacher: req.portalActorId }).populate('course', 'title').sort({ createdAt: -1 });
        const attemptCounts = await QuizAttempt.aggregate([
            { $match: { quiz: { $in: quizzes.map((q) => q._id) } } },
            { $group: { _id: '$quiz', count: { $sum: 1 } } },
        ]);
        const countByQuiz = Object.fromEntries(attemptCounts.map((r) => [String(r._id), r.count]));
        res.json({
            success: true,
            quizzes: quizzes.map((q) => ({
                ...q.toObject(),
                attemptCount: countByQuiz[String(q._id)] || 0,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quizzes' });
    }
});

router.get('/teacher/resources', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const courseIds = await Course.find({ instructor: req.portalActorId }).distinct('_id');
        const resources = await Resource.find({ course: { $in: courseIds } })
            .populate('course', 'title')
            .populate('uploadedBy', 'name role')
            .sort({ createdAt: -1 });
        res.json({ success: true, resources });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load resources' });
    }
});

router.get('/teacher/attendance/roster', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        const course = await Course.findOne({ _id: courseId, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Not your course' });
        const rosterStudents = await getCourseRosterStudents(courseId);
        const { dayStart, dayEnd } = dayRange(date);
        const existing = await AttendanceRecord.find({
            course: courseId,
            date: { $gte: dayStart, $lte: dayEnd },
        });
        const byStudent = {};
        existing.forEach((r) => {
            const sid = String(r.student);
            const prev = byStudent[sid];
            if (!prev || new Date(r.updatedAt || r.createdAt) > new Date(prev.updatedAt || prev.createdAt)) {
                byStudent[sid] = r;
            }
        });
        res.json({
            success: true,
            count: rosterStudents.length,
            students: rosterStudents.map((s) => ({
                _id: s._id,
                name: s.name,
                studentId: s.studentId,
                enrollmentStatus: s.enrollmentStatus,
                record: byStudent[String(s._id)] || null,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load roster' });
    }
});

router.get('/teacher/attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const filter = { teacher: req.portalActorId };
        if (req.query.courseId) filter.course = req.query.courseId;
        if (req.query.date) {
            const dayStart = new Date(req.query.date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);
            filter.date = { $gte: dayStart, $lte: dayEnd };
        }
        const records = await AttendanceRecord.find(filter)
            .populate('student', 'name studentId')
            .populate('course', 'title')
            .sort({ date: -1 })
            .limit(500);
        res.json({ success: true, records, count: records.length });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance' });
    }
});

router.post('/teacher/attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, studentId, status, notes, date, records } = req.body;
        let list = Array.isArray(records) ? records : [];
        if (!list.length && studentId) {
            list = [{ studentId, status, notes, date }];
        }
        if (!courseId || !list.length) {
            return res.status(400).json({ success: false, error: 'courseId and attendance records required' });
        }
        const course = await Course.findOne({ _id: courseId, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Not your course' });

        let upserted = 0;
        for (const r of list) {
            const { dayStart, dayEnd } = dayRange(r.date || date);
            await AttendanceRecord.findOneAndUpdate(
                {
                    course: courseId,
                    student: r.studentId,
                    date: { $gte: dayStart, $lte: dayEnd },
                },
                {
                    course: courseId,
                    teacher: req.portalActorId,
                    student: r.studentId,
                    status: r.status || 'present',
                    notes: r.notes != null ? String(r.notes) : '',
                    date: dayStart,
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            upserted += 1;
        }
        res.status(201).json({ success: true, createdCount: upserted });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark attendance' });
    }
});

router.patch('/teacher/attendance/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { status, notes, date } = req.body;
        const record = await AttendanceRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
        const course = await Course.findOne({ _id: record.course, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Forbidden' });
        if (status) record.status = status;
        if (notes !== undefined) record.notes = String(notes);
        if (date) {
            const { dayStart } = dayRange(date);
            record.date = dayStart;
        }
        await record.save();
        const populated = await AttendanceRecord.findById(record._id)
            .populate('student', 'name studentId')
            .populate('course', 'title');
        res.json({ success: true, record: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update attendance' });
    }
});

router.delete('/teacher/attendance/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const record = await AttendanceRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
        const course = await Course.findOne({ _id: record.course, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Forbidden' });
        await AttendanceRecord.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete attendance' });
    }
});

router.post('/teacher/attendance/bulk-delete', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const records = await AttendanceRecord.find({ _id: { $in: ids } });
        let deleted = 0;
        for (const record of records) {
            const course = await Course.findOne({ _id: record.course, instructor: req.portalActorId });
            if (course) {
                await AttendanceRecord.findByIdAndDelete(record._id);
                deleted += 1;
            }
        }
        res.json({ success: true, deletedCount: deleted });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete records' });
    }
});

router.post('/teacher/assignments', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, title, description, dueDate, maxPoints, status, attachments } = req.body;
        if (!courseId || !title || !dueDate) {
            return res.status(400).json({ success: false, error: 'courseId, title, and dueDate are required' });
        }
        const course = await Course.findOne({ _id: courseId, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Not your course' });
        const assignment = await Assignment.create({
            title: String(title).trim(),
            description: description || '',
            course: courseId,
            teacher: req.portalActorId,
            dueDate: new Date(dueDate),
            maxPoints: maxPoints != null && maxPoints !== '' ? Number(maxPoints) : null,
            attachments: Array.isArray(attachments) ? attachments : [],
            status: status || 'published',
        });
        const populated = await Assignment.findById(assignment._id).populate('course', 'title');
        res.status(201).json({ success: true, assignment: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create assignment' });
    }
});

router.post('/teacher/quizzes', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, title, questions, totalMarks, dueDate, status, resourceLink, resourceFileUrl } =
            req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, error: 'courseId and title are required' });
        }
        const normalized = normalizeQuizQuestions(questions);
        if (!normalized.length) {
            return res.status(400).json({ success: false, error: 'Add at least one question with 3 options' });
        }
        const course = await Course.findOne({ _id: courseId, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Not your course' });
        const quiz = await Quiz.create({
            title: String(title).trim(),
            course: courseId,
            teacher: req.portalActorId,
            questions: normalized,
            totalMarks: totalMarks != null && totalMarks !== '' ? Number(totalMarks) : null,
            dueDate: dueDate ? new Date(dueDate) : null,
            resourceLink: resourceLink ? String(resourceLink).trim() : '',
            resourceFileUrl: resourceFileUrl ? String(resourceFileUrl).trim() : '',
            status: status || 'published',
        });
        res.status(201).json({ success: true, quiz });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create quiz' });
    }
});

router.post('/teacher/resources', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, title, description, fileUrl, type } = req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, error: 'courseId and title are required' });
        }
        const course = await Course.findOne({ _id: courseId, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Not your course' });
        const resource = await Resource.create({
            title: String(title).trim(),
            description: description || '',
            fileUrl: fileUrl || '',
            type: type || 'file',
            course: courseId,
            uploadedBy: req.portalActorId,
        });
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('uploadedBy', 'name');
        res.status(201).json({ success: true, resource: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create resource' });
    }
});

router.patch('/teacher/assignments/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.params.id || req.params.id === 'undefined') {
            return res.status(400).json({ success: false, error: 'Assignment id is required' });
        }
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        await assertTeacherOwnsCourse(req.portalActorId, assignment.course);
        const { title, description, dueDate, maxPoints, status, attachments } = req.body;
        if (title !== undefined) assignment.title = String(title).trim();
        if (description !== undefined) assignment.description = description || '';
        if (dueDate) assignment.dueDate = new Date(dueDate);
        if (maxPoints !== undefined) {
            assignment.maxPoints = maxPoints != null && maxPoints !== '' ? Number(maxPoints) : null;
        }
        if (status !== undefined) assignment.status = status;
        if (attachments !== undefined) assignment.attachments = Array.isArray(attachments) ? attachments : [];
        await assignment.save();
        const populated = await Assignment.findById(assignment._id)
            .populate('course', 'title')
            .populate('teacher', 'name');
        res.json({ success: true, assignment: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update assignment' });
    }
});

router.delete('/teacher/assignments/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        await assertTeacherOwnsCourse(req.portalActorId, assignment.course);
        await AssignmentSubmission.deleteMany({ assignment: assignment._id });
        await Assignment.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to delete assignment' });
    }
});

router.patch('/teacher/resources/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        await assertTeacherOwnsCourse(req.portalActorId, resource.course);
        const { title, description, fileUrl, type, courseId } = req.body;
        if (courseId) await assertTeacherOwnsCourse(req.portalActorId, courseId);
        if (courseId) resource.course = courseId;
        if (title !== undefined) resource.title = String(title).trim();
        if (description !== undefined) resource.description = description || '';
        if (fileUrl !== undefined) resource.fileUrl = fileUrl || '';
        if (type !== undefined) resource.type = type || 'file';
        await resource.save();
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('uploadedBy', 'name role');
        res.json({ success: true, resource: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update resource' });
    }
});

router.delete('/teacher/resources/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        await assertTeacherOwnsCourse(req.portalActorId, resource.course);
        await Resource.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to delete resource' });
    }
});

router.patch('/teacher/quizzes/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.params.id || req.params.id === 'undefined') {
            return res.status(400).json({ success: false, error: 'Quiz id is required' });
        }
        const quiz = await Quiz.findOne({ _id: req.params.id, teacher: req.portalActorId });
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const attemptCount = await QuizAttempt.countDocuments({ quiz: quiz._id });
        const { courseId, title, questions, totalMarks, dueDate, status, resourceLink, resourceFileUrl } =
            req.body;
        if (courseId) {
            await assertTeacherOwnsCourse(req.portalActorId, courseId);
            quiz.course = courseId;
        }
        if (title !== undefined) quiz.title = String(title).trim();
        if (questions !== undefined) {
            if (attemptCount > 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Students have already taken this quiz. You can edit title, due date, and total marks only — not questions.',
                });
            }
            const normalized = normalizeQuizQuestions(questions);
            if (!normalized.length) {
                return res.status(400).json({ success: false, error: 'Add at least one valid question' });
            }
            quiz.questions = normalized;
        }
        if (totalMarks !== undefined) {
            quiz.totalMarks = totalMarks != null && totalMarks !== '' ? Number(totalMarks) : null;
        }
        if (dueDate !== undefined) quiz.dueDate = dueDate ? new Date(dueDate) : null;
        if (resourceLink !== undefined) quiz.resourceLink = resourceLink ? String(resourceLink).trim() : '';
        if (resourceFileUrl !== undefined) {
            quiz.resourceFileUrl = resourceFileUrl ? String(resourceFileUrl).trim() : '';
        }
        if (status !== undefined) quiz.status = status;
        await quiz.save();
        res.json({ success: true, quiz });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update quiz' });
    }
});

router.delete('/teacher/quizzes/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const quiz = await Quiz.findOne({ _id: req.params.id, teacher: req.portalActorId });
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        await QuizAttempt.deleteMany({ quiz: quiz._id });
        await Quiz.findByIdAndDelete(quiz._id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete quiz' });
    }
});

router.get('/teacher/quizzes/:quizId/attempts', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.params.quizId || req.params.quizId === 'undefined') {
            return res.status(400).json({ success: false, error: 'Quiz id is required' });
        }
        const quiz = await Quiz.findOne({ _id: req.params.quizId, teacher: req.portalActorId });
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const attempts = await QuizAttempt.find({ quiz: quiz._id })
            .populate('student', 'name email studentId')
            .sort({ createdAt: -1 });
        res.json({
            success: true,
            quiz: {
                _id: quiz._id,
                title: quiz.title,
                totalMarks: quiz.totalMarks,
                questions: quiz.questions,
            },
            attempts: attempts.map((a) => {
                const o = a.toObject();
                o.scoreDisplay = formatScoreDisplay(o.score, quiz.totalMarks);
                o.review = buildQuizReviewPayload(quiz, o.answers || []);
                return o;
            }),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quiz attempts' });
    }
});

router.get('/teacher/schedule', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const schedules = await ClassSchedule.find({ teacher: req.portalActorId })
            .populate('course', 'title')
            .sort({ dayOfWeek: 1, startTime: 1 });
        res.json({ success: true, schedules, dayLabels: DAY_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedule' });
    }
});

router.post('/teacher/schedule', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, dayOfWeek, startTime, endTime, timezone, roomOrLink } = req.body;
        const course = await Course.findOne({ _id: courseId, instructor: req.portalActorId });
        if (!course) return res.status(403).json({ success: false, error: 'Not your course' });
        const schedule = await ClassSchedule.create({
            course: courseId,
            teacher: req.portalActorId,
            dayOfWeek,
            startTime,
            endTime,
            timezone: timezone || 'UTC',
            roomOrLink: roomOrLink || '',
        });
        res.status(201).json({ success: true, schedule });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save schedule' });
    }
});

router.patch('/teacher/schedule/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const schedule = await ClassSchedule.findOne({ _id: req.params.id, teacher: req.portalActorId });
        if (!schedule) return res.status(404).json({ success: false, error: 'Schedule not found' });
        const { courseId, dayOfWeek, startTime, endTime, timezone, roomOrLink } = req.body;
        if (courseId) {
            await assertTeacherOwnsCourse(req.portalActorId, courseId);
            schedule.course = courseId;
        }
        if (dayOfWeek !== undefined) schedule.dayOfWeek = dayOfWeek;
        if (startTime) schedule.startTime = startTime;
        if (endTime) schedule.endTime = endTime;
        if (timezone !== undefined) schedule.timezone = timezone || 'UTC';
        if (roomOrLink !== undefined) schedule.roomOrLink = roomOrLink || '';
        await schedule.save();
        const populated = await ClassSchedule.findById(schedule._id).populate('course', 'title');
        res.json({ success: true, schedule: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update schedule' });
    }
});

router.delete('/teacher/schedule/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const schedule = await ClassSchedule.findOneAndDelete({
            _id: req.params.id,
            teacher: req.portalActorId,
        });
        if (!schedule) return res.status(404).json({ success: false, error: 'Schedule not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete schedule' });
    }
});

async function buildTeacherMonthlyRecords(days, requests) {
    const monthKeys = new Set();
    for (const doc of days) {
        const d = new Date(doc.date);
        monthKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const calendarByMonth = new Map();
    for (const mk of [...monthKeys]) {
        calendarByMonth.set(mk, await buildMonthCalendar(mk));
    }
    const monthlyAgg = aggregateMonthlyWithCalendar(days, calendarByMonth);
    return monthlyAgg.map((m) => {
        const cal = calendarByMonth.get(m.monthKey);
        const reqRow = requests.find((r) => r.monthKey === m.monthKey);
        return {
            ...m,
            expectedWorkingDays: m.expectedWorkingDays ?? cal?.expectedWorkingDays ?? 0,
            approvalStatus: reqRow?.status || 'pending',
            reviewedAt: reqRow?.reviewedAt || null,
        };
    });
}

async function syncMonthlyRequestFromDaily(teacherId, dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    const monthKey = normalizeMonthKey(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    );
    const { start, end } = monthBounds(monthKey);
    const days = await TeacherSelfAttendanceDay.find({
        teacher: teacherId,
        date: { $gte: start, $lte: end },
    });
    const calendar = await buildMonthCalendar(monthKey);
    const agg = aggregateWorkingDaysOnly(days, calendar.days);
    await TeacherAttendanceRequest.findOneAndUpdate(
        { teacher: teacherId, monthKey },
        {
            presentDays: agg.presentDays ?? 0,
            leaveDays: agg.leaveDays ?? 0,
            absentDays: agg.absentDays ?? 0,
            lateDays: agg.lateDays ?? 0,
            holidayDays: agg.holidayDays ?? 0,
            weekendDays: agg.weekendDays ?? 0,
            reportAbsentDays: agg.reportAbsentDays ?? 0,
            daysMarked: agg.daysMarked ?? 0,
            expectedWorkingDays: agg.expectedWorkingDays ?? calendar.expectedWorkingDays,
            status: 'pending',
            reviewedBy: null,
            reviewedAt: null,
            submittedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

router.get('/teacher/my-attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.portalActorId) {
            return res.json({ success: true, monthlyRecords: [], todayRecord: null });
        }
        const days = await TeacherSelfAttendanceDay.find({ teacher: req.portalActorId }).sort({ date: -1 });
        const requests = await TeacherAttendanceRequest.find({ teacher: req.portalActorId });
        const monthlyRecords = await buildTeacherMonthlyRecords(days, requests);

        const now = new Date();
        const viewMonth =
            req.query.month ||
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthCalendar = await buildMonthCalendar(normalizeMonthKey(viewMonth));
        const { start, end } = monthBounds(monthCalendar.monthKey);
        const monthDays = await TeacherSelfAttendanceDay.find({
            teacher: req.portalActorId,
            date: { $gte: start, $lte: end },
        });
        const marksByDate = {};
        monthDays.forEach((d) => {
            marksByDate[isoDateKey(d.date)] = { status: d.status, notes: d.notes || '' };
        });
        const calendarDays = monthCalendar.days.map((d) => ({
            ...d,
            mark: marksByDate[d.date] || null,
        }));

        const { dayStart } = dayRange(new Date());
        const todayRecord = await TeacherSelfAttendanceDay.findOne({
            teacher: req.portalActorId,
            date: dayStart,
        });
        let selectedDayRecord = null;
        let selectedDayMeta = null;
        if (req.query.date) {
            const { dayStart: selStart } = dayRange(req.query.date);
            selectedDayRecord = await TeacherSelfAttendanceDay.findOne({
                teacher: req.portalActorId,
                date: selStart,
            });
            selectedDayMeta = monthCalendar.days.find((d) => d.date === isoDateKey(selStart)) || null;
        }
        res.json({
            success: true,
            monthlyRecords,
            todayRecord,
            selectedDayRecord,
            selectedDayMeta,
            monthCalendar: { ...monthCalendar, days: calendarDays },
            viewMonth: monthCalendar.monthKey,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance' });
    }
});

router.post('/teacher/my-attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.portalActorId) {
            return res.status(400).json({ success: false, error: 'Preview mode: submit not available' });
        }
        const { date, status, notes } = req.body;
        if (!isValidAttendanceStatus(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        const { dayStart } = dayRange(date || new Date());
        const monthKey = normalizeMonthKey(
            `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}`
        );
        const record = await TeacherSelfAttendanceDay.findOneAndUpdate(
            { teacher: req.portalActorId, date: dayStart },
            { status, notes: String(notes || '') },
            { upsert: true, new: true }
        );
        await syncMonthlyRequestFromDaily(req.portalActorId, dayStart);
        const days = await TeacherSelfAttendanceDay.find({ teacher: req.portalActorId });
        const requests = await TeacherAttendanceRequest.find({ teacher: req.portalActorId });
        const monthlyRecords = await buildTeacherMonthlyRecords(days, requests);
        res.json({
            success: true,
            record,
            monthlyRecords,
            monthKey,
            message: `Daily attendance saved. Monthly summary for ${monthKey} sent to admin for approval.`,
        });
    } catch (error) {
        req.log?.error?.('Teacher my-attendance submit failed', { err: error });
        res.status(500).json({ success: false, error: 'Failed to submit attendance' });
    }
});

// ————————————————— PARENT —————————————————

router.get('/parent/dashboard', allowPortalRoles('parent'), async (req, res) => {
    try {
        const parentId = getPortalActorId(req);
        if (!parentId) return res.json(previewDashboardPayload('parent'));
        const links = await ParentStudentLink.find({ parent: parentId }).populate('student', 'name email studentId');
        const studentIds = links.map((l) => l.student?._id).filter(Boolean);

        const enrollments = await Enrollment.find({ student: { $in: studentIds } }).populate('course', 'title');
        const attendance = await AttendanceRecord.find({ student: { $in: studentIds } });
        const quizAttempts = await QuizAttempt.find({ student: { $in: studentIds } });
        const emailByStudentId = {};
        for (const link of links) {
            if (link.student?._id) {
                emailByStudentId[String(link.student._id)] = link.student.email;
            }
        }
        const pendingFees = await countPendingFeesForStudents(studentIds, emailByStudentId);

        res.json({
            success: true,
            children: links,
            summary: {
                childrenCount: links.length,
                enrollmentsCount: enrollments.length,
                attendanceRecords: attendance.length,
                quizAttempts: quizAttempts.length,
                pendingFees,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load parent dashboard' });
    }
});

router.get('/parent/children', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return emptyList(res, { children: [] });
        const links = await ParentStudentLink.find({ parent: req.portalActorId }).populate(
            'student',
            'name email studentId status'
        );
        res.json({ success: true, children: links });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load children' });
    }
});

router.get('/parent/children/:studentId', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return emptyList(res, { enrollments: [], attendance: [], submissions: [], quizAttempts: [], payments: [] });
        await assertParentChild(req.portalActorId, req.params.studentId);
        const studentId = req.params.studentId;

        const student = await User.findById(studentId).select('email');
        const enrollmentsRaw = await Enrollment.find({ student: studentId }).populate('course', 'title price');
        const enrollments = await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            student?.email
        );
        const attendance = await AttendanceRecord.find({ student: studentId })
            .populate('course', 'title')
            .sort({ date: -1 })
            .limit(50);
        const submissions = await AssignmentSubmission.find({ student: studentId })
            .populate('assignment', 'title maxPoints')
            .sort({ submittedAt: -1 })
            .limit(30);
        const quizAttempts = await QuizAttempt.find({ student: studentId })
            .populate('quiz', 'title totalMarks')
            .sort({ createdAt: -1 })
            .limit(30);
        const submissionsOut = submissions.map((s) => {
            const o = s.toObject();
            const maxPts = o.assignment?.maxPoints;
            o.scoreDisplay = formatScoreDisplay(o.score, maxPts);
            return o;
        });
        const quizAttemptsOut = quizAttempts.map((a) => {
            const o = a.toObject();
            o.scoreDisplay = formatScoreDisplay(o.score, o.quiz?.totalMarks);
            return o;
        });
        const payments = await Payment.find({ user: studentId }).populate('course', 'title').sort({ createdAt: -1 });

        res.json({
            success: true,
            enrollments,
            attendance,
            submissions: submissionsOut,
            quizAttempts: quizAttemptsOut,
            payments,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load child data' });
    }
});

// ————————————————— ACCOUNTANT (read-focused portal APIs) —————————————————

router.get('/accountant/dashboard', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payments = await Payment.find().sort({ createdAt: -1 }).limit(500);
        res.json({
            success: true,
            summary: {
                payments: payments.length,
                completed: payments.filter((p) => p.status === 'completed').length,
                pending: payments.filter((p) => p.status === 'pending').length,
                refunded: payments.filter((p) => p.status === 'refunded').length,
                failed: payments.filter((p) => p.status === 'failed').length,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load accountant dashboard' });
    }
});

router.get('/accountant/payments', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payments = await Payment.find()
            .populate('user', 'name email')
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        res.json({ success: true, payments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payments' });
    }
});

// ————————————————— ACCOUNTANT PAYROLL (portal; uses approved attendance) —————————————————

router.get('/accountant/payroll/teachers', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' }).select('_id name email');
        res.json({ success: true, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teachers' });
    }
});

router.get('/accountant/payroll/preview', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey } = req.query;
        if (!teacherId || !monthKey) {
            return res.status(400).json({ success: false, error: 'teacherId and monthKey required' });
        }
        const built = await buildPayrollRun(teacherId, monthKey, req.portalActorId || req.user?.userId);
        res.json({
            success: true,
            preview: { ...built.amounts, attendanceSource: built.attendance.source, monthKey: built.monthKey },
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Preview failed' });
    }
});

router.post('/accountant/payroll/salary-profile', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthlySalary, workingDays, currency } = req.body;
        const profile = await TeacherSalaryProfile.findOneAndUpdate(
            { teacher: teacherId },
            { monthlySalary, workingDays, currency: currency || 'USD' },
            { upsert: true, new: true }
        );
        res.json({ success: true, profile });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save salary profile' });
    }
});

router.post('/accountant/payroll/attendance', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey, presentDays, leaveDays, notes } = req.body;
        const key = normalizeMonthKey(monthKey);
        const attendance = await TeacherAttendance.findOneAndUpdate(
            { teacher: teacherId, monthKey: key },
            { presentDays, leaveDays, notes: notes || '' },
            { upsert: true, new: true }
        );
        res.json({ success: true, attendance });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save attendance' });
    }
});

router.post('/accountant/payroll/run', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey } = req.body;
        const built = await buildPayrollRun(teacherId, monthKey, req.portalActorId || req.user?.userId);
        const { amounts, attendance, monthKey: key } = built;
        const payroll = await PayrollRun.findOneAndUpdate(
            { teacher: teacherId, monthKey: key },
            {
                monthlySalary: amounts.monthlySalary,
                workingDays: amounts.workingDays,
                leaveDays: amounts.leaveDays,
                presentDays: amounts.presentDays,
                deduction: amounts.deduction,
                finalSalary: amounts.finalSalary,
                generatedBy: req.portalActorId || req.user?.userId,
            },
            { upsert: true, new: true }
        ).populate('teacher', 'name email');
        res.json({
            success: true,
            payroll,
            calculation: { ...amounts, attendanceSource: attendance.source },
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to generate payroll' });
    }
});

router.get('/accountant/payroll/runs', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const runs = await PayrollRun.find()
            .populate('teacher', 'name email')
            .sort({ createdAt: -1 })
            .limit(200);
        res.json({ success: true, runs });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payroll runs' });
    }
});

// Legacy admin link endpoint (portal path)
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
