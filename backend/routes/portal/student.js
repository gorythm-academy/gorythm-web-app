const express = require('express');
const router = express.Router();

const { allowPortalRoles, getPortalActorId } = require('../../middleware/portalAccess');
const Enrollment = require('../../models/Enrollment');
const AttendanceRecord = require('../../models/AttendanceRecord');
const Assignment = require('../../models/Assignment');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const Quiz = require('../../models/Quiz');
const QuizAttempt = require('../../models/QuizAttempt');
const Resource = require('../../models/Resource');
const Course = require('../../models/Course');
const Payment = require('../../models/Payment');
const { enrichEnrollmentsWithPaymentStatus } = require('../../services/enrollmentPaymentStatus');
const { activeLmsFilter, trashedLmsFilter, mergeMongoFilters } = require('../../utils/lmsTrashQuery');
const { studentPaymentsFilter } = require('../../utils/paymentQuery');
const {
    studentAssignmentMongoFilter,
    filterResourcesForStudent,
    assignmentPastDue,
    getStudentSlotIssues,
    assertStudentCanAccessAssignment,
    mapSubmissionForPortal,
} = require('../../utils/lmsContentRules');
const { buildQuizReviewPayload } = require('../../utils/quizReview');
const {
    DAY_LABELS,
    withActiveEnrollments,
    dropTrashedCourses,
    unauthorized,
    mapAssignmentForPortal,
    loadStudentDisplayEnrollments,
    buildStudentWeeklyTimetable,
    getStudentCourseIds,
    attendancePresentRate,
    loadStudentAttendancePeriodView,
} = require('./helpers');

// ————————————————— STUDENT —————————————————

router.get('/student/dashboard', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title category price deletedAt');
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        ));
        const courseIds = enrollments
            .filter((e) => e.status === 'active' && e.course?._id)
            .map((e) => e.course._id);

        const attendance = await AttendanceRecord.find({
            student: studentId,
            ...(courseIds.length ? { course: { $in: courseIds } } : { course: { $in: [] } }),
        });
        const attendanceRate = attendancePresentRate(attendance);

        const now = new Date();
        const assignmentVisibility = await studentAssignmentMongoFilter(studentId);
        const assignments = await Assignment.find(
            mergeMongoFilters(assignmentVisibility, { status: 'published' }, activeLmsFilter())
        )
            .populate('course', 'title')
            .sort({ dueDate: 1 })
            .limit(50);
        const submissions = await AssignmentSubmission.find({ student: studentId, ...activeLmsFilter() });
        const submittedIds = new Set(submissions.map((s) => String(s.assignment)));
        const dueAssignments = assignments.filter(
            (a) => !submittedIds.has(String(a._id)) && a.dueDate && new Date(a.dueDate) >= now
        );

        const quizzes = await Quiz.find({
            course: { $in: courseIds },
            status: 'published',
            ...activeLmsFilter(),
        }).limit(20);

        const pendingFees = enrollments.filter((e) => e.paymentStatus === 'pending' && e.course).length;

        res.json({
            success: true,
            summary: {
                enrolledCourses: enrollments.filter((e) => e.course && e.status === 'active').length,
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
        if (!studentId) return unauthorized(res);
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title category description price duration level instructorName deletedAt')
            .sort({ enrollmentDate: -1 });
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        ));
        res.json({ success: true, enrollments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load courses' });
    }
});

router.get('/student/fees', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title price deletedAt')
            .sort({ updatedAt: -1 });
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        ));
        const payments = await Payment.find(studentPaymentsFilter(studentId, req.user.email))
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
        if (!studentId) return unauthorized(res);

        const enrollments = await loadStudentDisplayEnrollments(studentId, req.user.email);
        const timetable = buildStudentWeeklyTimetable(enrollments);

        res.json({
            success: true,
            timetable,
            dayLabels: DAY_LABELS,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedule' });
    }
});

router.get('/student/assignments', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const visibility = await studentAssignmentMongoFilter(studentId);
        const slotIssues = await getStudentSlotIssues(studentId);
        const assignments = await Assignment.find(
            mergeMongoFilters(visibility, { status: 'published' }, activeLmsFilter())
        )
            .populate('course', 'title')
            .populate('teacher', 'name')
            .sort({ dueDate: 1 });
        const submissions = await AssignmentSubmission.find({ student: studentId, ...activeLmsFilter() });
        const removedSubmissions = await AssignmentSubmission.find({ student: studentId, ...trashedLmsFilter() })
            .select('assignment deletedAt')
            .sort({ deletedAt: -1 })
            .lean();
        const removedByAssignment = Object.create(null);
        for (const row of removedSubmissions) {
            const aid = String(row.assignment);
            if (!removedByAssignment[aid]) removedByAssignment[aid] = row.deletedAt;
        }
        const byAssignment = Object.fromEntries(submissions.map((s) => [String(s.assignment), s]));
        res.json({
            success: true,
            assignments: assignments.map((a) => {
                const aid = String(a._id);
                const activeSubmission = byAssignment[aid] || null;
                const submissionRemovedAt =
                    !activeSubmission && removedByAssignment[aid] ? removedByAssignment[aid] : null;
                return mapAssignmentForPortal(a, {
                    viewerRole: 'student',
                    submission: activeSubmission,
                    submissionRemovedAt,
                });
            }),
            slotIssues,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.get('/student/quizzes/:quizId', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const quiz = await Quiz.findOne({ _id: req.params.quizId, ...activeLmsFilter() }).populate('course', 'title');
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(quiz.course._id || quiz.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const attempt = await QuizAttempt.findOne({
            quiz: quiz._id,
            student: studentId,
            ...activeLmsFilter(),
        });
        if (quiz.status !== 'published' && !attempt) {
            return res.status(403).json({ success: false, error: 'Quiz is not available' });
        }
        const obj = quiz.toObject();
        obj.questions = (obj.questions || []).map((q) => {
            const { correctAnswer, ...rest } = q;
            return rest;
        });
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
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const attempts = await QuizAttempt.find({ student: studentId, ...activeLmsFilter() });
        const attemptQuizIds = attempts.map((a) => a.quiz).filter(Boolean);
        const quizzes = await Quiz.find({
            $or: [
                { course: { $in: courseIds }, status: 'published' },
                ...(attemptQuizIds.length
                    ? [{ _id: { $in: attemptQuizIds }, course: { $in: courseIds } }]
                    : []),
            ],
            ...activeLmsFilter(),
        })
            .populate('course', 'title')
            .select('-questions.correctAnswer');
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
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title');
        const allResources = await Resource.find({ course: { $in: courseIds }, ...activeLmsFilter() })
            .populate('course', 'title')
            .populate('teacher', 'name')
            .sort({ createdAt: -1 })
            .lean();
        const resources = await filterResourcesForStudent(allResources, studentId);
        res.json({
            success: true,
            courses,
            resources,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load content' });
    }
});

router.get('/student/attendance', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const records = await AttendanceRecord.find({
            student: studentId,
            ...(courseIds.length ? { course: { $in: courseIds } } : { course: { $in: [] } }),
        })
            .populate('course', 'title')
            .sort({ date: -1 })
            .limit(100);
        res.json({ success: true, records });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance' });
    }
});

router.get('/student/attendance/courses', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title').sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load courses' });
    }
});

router.get('/student/attendance/view', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const { courseId, period = 'daily', date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        const payload = await loadStudentAttendancePeriodView(studentId, courseId, period, date);
        res.json({ success: true, ...payload });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load attendance' });
    }
});

router.post('/student/submissions/precheck', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { assignmentId } = req.body || {};
        if (!assignmentId) {
            return res.status(400).json({ success: false, error: 'assignmentId is required' });
        }
        const assignment = await Assignment.findOne({ _id: assignmentId, ...activeLmsFilter() });
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        if (assignment.status !== 'published') {
            return res.status(403).json({ success: false, error: 'Assignment is not available' });
        }
        await assertStudentCanAccessAssignment(studentId, assignment);
        if (assignmentPastDue(assignment)) {
            return res.status(400).json({ success: false, error: 'The due date for this assignment has passed' });
        }
        res.json({ success: true, ok: true });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({
            success: false,
            error: error.message || 'Cannot submit to this assignment',
        });
    }
});

router.post('/student/submissions', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { assignmentId, text, attachments = [] } = req.body;
        const hasText = String(text || '').trim().length > 0;
        const hasFiles = Array.isArray(attachments) && attachments.length > 0;
        if (!hasText && !hasFiles) {
            return res.status(400).json({ success: false, error: 'Add a written answer or attach a file' });
        }
        const { validateStudentSubmissionAttachments } = require('../../utils/validateStudentAttachments');
        const attachmentCheck = validateStudentSubmissionAttachments(attachments);
        if (!attachmentCheck.ok) {
            return res.status(400).json({ success: false, error: attachmentCheck.error });
        }
        const safeAttachments = attachmentCheck.attachments;
        const assignment = await Assignment.findOne({ _id: assignmentId, ...activeLmsFilter() });
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        if (assignment.status !== 'published') {
            return res.status(403).json({ success: false, error: 'Assignment is not available' });
        }
        await assertStudentCanAccessAssignment(studentId, assignment);
        if (assignmentPastDue(assignment)) {
            return res.status(400).json({ success: false, error: 'The due date for this assignment has passed' });
        }
        const existing = await AssignmentSubmission.findOne({ assignment: assignmentId, student: studentId });
        let submission;
        if (existing) {
            existing.text = text || '';
            existing.attachments = safeAttachments;
            existing.submittedAt = new Date();
            existing.status = 'submitted';
            existing.deletedAt = null;
            existing.revisionCount = Number(existing.revisionCount || 0) + 1;
            await existing.save();
            submission = existing;
        } else {
            submission = await AssignmentSubmission.create({
                assignment: assignmentId,
                student: studentId,
                text: text || '',
                attachments: safeAttachments,
            });
        }
        res.status(201).json({ success: true, submission: mapSubmissionForPortal(submission) });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({
            success: false,
            error: error.message || 'Failed to submit assignment',
        });
    }
});

router.post('/student/quiz-attempts', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { quizId, answers = [] } = req.body;
        const quiz = await Quiz.findOne({ _id: quizId, ...activeLmsFilter() });
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        if (quiz.status !== 'published') {
            return res.status(403).json({ success: false, error: 'Quiz is not available' });
        }
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(quiz.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const priorActive = await QuizAttempt.findOne({
            quiz: quizId,
            student: studentId,
            ...activeLmsFilter(),
        });
        if (priorActive) {
            return res.status(400).json({ success: false, error: 'You have already attempted this quiz' });
        }
        const review = buildQuizReviewPayload(quiz, answers);
        const trashedAttempt = await QuizAttempt.findOne({
            quiz: quizId,
            student: studentId,
            ...trashedLmsFilter(),
        });
        let attempt;
        if (trashedAttempt) {
            trashedAttempt.answers = answers;
            trashedAttempt.score = review.score;
            trashedAttempt.deletedAt = null;
            await trashedAttempt.save();
            attempt = trashedAttempt;
        } else {
            attempt = await QuizAttempt.create({
                quiz: quizId,
                student: studentId,
                answers,
                score: review.score,
            });
        }
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

module.exports = router;
