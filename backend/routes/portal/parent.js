const express = require('express');
const router = express.Router();

const { allowPortalRoles } = require('../../middleware/portalAccess');
const ParentStudentLink = require('../../models/ParentStudentLink');
const Enrollment = require('../../models/Enrollment');
const AttendanceRecord = require('../../models/AttendanceRecord');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const QuizAttempt = require('../../models/QuizAttempt');
const Course = require('../../models/Course');
const Payment = require('../../models/Payment');
const ClassSchedule = require('../../models/ClassSchedule');
const User = require('../../models/User');
const {
    enrichEnrollmentsWithPaymentStatus,
    countPendingFeesForStudents,
} = require('../../services/enrollmentPaymentStatus');
const { activeEnrollmentFilter } = require('../../utils/enrollmentQuery');
const { isCourseTrashed } = require('../../utils/courseQuery');
const { isUserTrashed } = require('../../utils/userQuery');
const { activeLmsFilter } = require('../../utils/lmsTrashQuery');
const { studentPaymentsFilter } = require('../../utils/paymentQuery');
const { serializePayments } = require('../../utils/serializePayment');
const { formatScoreDisplay } = require('../../utils/quizReview');
const {
    DAY_LABELS,
    withActiveEnrollments,
    dropTrashedCourses,
    unauthorized,
    getStudentCourseIds,
    assertParentChild,
    loadStudentAttendancePeriodView,
} = require('./helpers');

// ————————————————— PARENT —————————————————

router.get('/parent/dashboard', allowPortalRoles('parent'), async (req, res) => {
    try {
        const parentId = req.portalActorId;
        if (!parentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const links = await ParentStudentLink.find({ parent: parentId }).populate(
            'student',
            'name email studentId deletedAt'
        );
        const activeLinks = links.filter((l) => l.student && !isUserTrashed(l.student));
        const studentIds = activeLinks.map((l) => l.student?._id).filter(Boolean);

        const enrollments = dropTrashedCourses(
            await Enrollment.find({
                student: { $in: studentIds },
                ...activeEnrollmentFilter(),
            }).populate('course', 'title deletedAt')
        );
        const enrolledCourseIds = [
            ...new Set(
                enrollments
                    .map((e) => e.course?._id || e.course)
                    .filter(Boolean)
                    .map((id) => String(id))
            ),
        ];
        const attendance =
            enrolledCourseIds.length > 0
                ? await AttendanceRecord.find({
                      student: { $in: studentIds },
                      course: { $in: enrolledCourseIds },
                  })
                : [];
        const quizAttempts = await QuizAttempt.find({ student: { $in: studentIds }, ...activeLmsFilter() });
        const emailByStudentId = {};
        for (const link of activeLinks) {
            if (link.student?._id) {
                emailByStudentId[String(link.student._id)] = link.student.email;
            }
        }
        const pendingFees = await countPendingFeesForStudents(studentIds, emailByStudentId);

        res.json({
            success: true,
            children: activeLinks,
            summary: {
                childrenCount: activeLinks.length,
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
        if (!req.portalActorId) return unauthorized(res);
        const links = await ParentStudentLink.find({ parent: req.portalActorId }).populate(
            'student',
            'name email studentId status deletedAt'
        );
        const children = links.filter((l) => l.student && !isUserTrashed(l.student));
        res.json({ success: true, children });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load children' });
    }
});

router.get('/parent/children/:studentId/attendance/courses', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        await assertParentChild(req.portalActorId, req.params.studentId);
        const studentId = req.params.studentId;
        const courseIds = await getStudentCourseIds(studentId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title').sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load courses' });
    }
});

router.get('/parent/children/:studentId/attendance/view', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        await assertParentChild(req.portalActorId, req.params.studentId);
        const { courseId, period = 'daily', date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        const payload = await loadStudentAttendancePeriodView(req.params.studentId, courseId, period, date);
        res.json({ success: true, ...payload });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load attendance' });
    }
});

router.get('/parent/children/:studentId/schedule', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        await assertParentChild(req.portalActorId, req.params.studentId);
        const studentId = req.params.studentId;

        const enrollments = await Enrollment.find({
            ...withActiveEnrollments(studentId),
            status: 'active',
            course: { $ne: null },
            assignedSchedule: { $ne: null },
        }).select('assignedSchedule');

        const scheduleIds = enrollments.map((e) => e.assignedSchedule).filter(Boolean);
        if (!scheduleIds.length) {
            return res.json({ success: true, schedules: [], dayLabels: DAY_LABELS });
        }

        const schedules = await ClassSchedule.find({ _id: { $in: scheduleIds } })
            .populate('course', 'title deletedAt')
            .populate('teacher', 'name deletedAt')
            .sort({ dayOfWeek: 1, startTime: 1 });
        const activeSchedules = schedules.filter(
            (s) => s.course && !isCourseTrashed(s.course) && s.teacher && !isUserTrashed(s.teacher)
        );
        res.json({ success: true, schedules: activeSchedules, dayLabels: DAY_LABELS });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load schedule' });
    }
});

router.get('/parent/children/:studentId', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        await assertParentChild(req.portalActorId, req.params.studentId);
        const studentId = req.params.studentId;

        const student = await User.findById(studentId).select('email deletedAt');
        if (!student || isUserTrashed(student)) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title price deletedAt');
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            student?.email
        ));
        const enrolledCourseIds = enrollments
            .map((e) => e.course?._id || e.course)
            .filter(Boolean);
        const attendance = enrolledCourseIds.length
            ? await AttendanceRecord.find({
                  student: studentId,
                  course: { $in: enrolledCourseIds },
              })
                  .populate('course', 'title')
                  .sort({ date: -1 })
                  .limit(50)
            : [];
        const submissions = await AssignmentSubmission.find({ student: studentId, ...activeLmsFilter() })
            .populate('assignment', 'title')
            .sort({ submittedAt: -1 })
            .limit(30);
        const quizAttempts = await QuizAttempt.find({ student: studentId, ...activeLmsFilter() })
            .populate('quiz', 'title totalMarks')
            .sort({ createdAt: -1 })
            .limit(30);
        const quizAttemptsOut = quizAttempts.map((a) => {
            const o = a.toObject();
            o.scoreDisplay = formatScoreDisplay(o.score, o.quiz?.totalMarks);
            return o;
        });
        const payments = await Payment.find(studentPaymentsFilter(studentId, student?.email))
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        const paymentsOut = serializePayments(payments);

        res.json({
            success: true,
            enrollments,
            attendance,
            submissions,
            quizAttempts: quizAttemptsOut,
            payments: paymentsOut,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load child data' });
    }
});

module.exports = router;
