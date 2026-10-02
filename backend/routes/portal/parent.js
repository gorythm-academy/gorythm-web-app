const express = require('express');
const router = express.Router();

const { allowPortalRoles } = require('../../middleware/portalAccess');
const ParentStudentLink = require('../../models/ParentStudentLink');
const Enrollment = require('../../models/Enrollment');
const AttendanceRecord = require('../../models/AttendanceRecord');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const QuizAttempt = require('../../models/QuizAttempt');
const Resource = require('../../models/Resource');
const Course = require('../../models/Course');
const Payment = require('../../models/Payment');
const User = require('../../models/User');
const {
    enrichEnrollmentsWithPaymentStatus,
    countPendingFeesForStudents,
} = require('../../services/enrollmentPaymentStatus');
const { activeEnrollmentFilter } = require('../../utils/enrollmentQuery');
const { isUserTrashed } = require('../../utils/userQuery');
const { activeLmsFilter, mergeMongoFilters } = require('../../utils/lmsTrashQuery');
const { studentPaymentsFilter } = require('../../utils/paymentQuery');
const { buildQuizReviewPayload, formatScoreDisplay } = require('../../utils/quizReview');
const Assignment = require('../../models/Assignment');
const { studentResourceMongoFilter, studentAssignmentMongoFilter } = require('../../utils/lmsContentRules');
const {
    DAY_LABELS,
    withActiveEnrollments,
    dropTrashedCourses,
    unauthorized,
    getStudentCourseIds,
    assertParentChild,
    loadStudentAttendancePeriodView,
    loadStudentDisplayEnrollments,
    mapAssignmentForPortal,
    buildStudentWeeklyTimetable,
} = require('./helpers');
const { serializePayments } = require('../../utils/serializePayment');

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
        const attendanceCount =
            enrolledCourseIds.length > 0
                ? await AttendanceRecord.countDocuments({
                      student: { $in: studentIds },
                      course: { $in: enrolledCourseIds },
                  })
                : 0;
        const quizCount = await QuizAttempt.countDocuments({ student: { $in: studentIds }, ...activeLmsFilter() });
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
                attendanceRecords: attendanceCount,
                quizAttempts: quizCount,
                pendingFees,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load parent dashboard' });
    }
});

const {
    loadParentBilling,
    startPortalStripeCheckout,
    submitPortalBankPayment,
    setPortalAutoPay,
    deleteSavedCard,
    findAccessiblePayment,
    findAccessibleEnrollment,
    sendPortalInvoicePdf,
    sendEnrollmentPdf,
    sendPortalStatementPdf,
    isPaidStatus,
} = require('./billingHandlers');
const { createProofUpload, proofPublicPath } = require('../../utils/paymentProofStorage');
const { deleteProofFile } = require('../../services/trashCleanup');
const parentProofUpload = createProofUpload();

router.get('/parent/billing', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        const payload = await loadParentBilling(req.portalActorId);
        res.json({ success: true, ...payload });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load billing' });
    }
});

router.get('/parent/billing/statement', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        return await sendPortalStatementPdf(res, {
            userId: req.portalActorId,
            role: 'parent',
            email: req.user?.email,
            name: req.user?.name,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to download invoice' });
    }
});

router.post('/parent/billing/checkout', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        const result = await startPortalStripeCheckout({
            actor: {
                userId: req.portalActorId,
                role: 'parent',
                email: req.user?.email,
                name: req.user?.name,
            },
            enrollmentIds: req.body?.enrollmentIds || req.body?.items,
            invoiceMode: req.body?.invoiceMode,
            months: req.body?.months,
            autoPay: Boolean(req.body?.autoPay),
        });
        res.json({ success: true, ...result });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to start checkout' });
    }
});

router.post('/parent/billing/autopay', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        const result = await setPortalAutoPay({
            actor: {
                userId: req.portalActorId,
                role: 'parent',
                email: req.user?.email,
                name: req.user?.name,
            },
            enrollmentIds: req.body?.enrollmentIds || req.body?.items,
            enabled: req.body?.enabled !== false && req.body?.enabled !== 'false',
        });
        res.json({ success: true, ...result });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update auto-pay' });
    }
});

router.post('/parent/billing/cards/delete', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        const result = await deleteSavedCard({
            actor: { userId: req.portalActorId, role: 'parent' },
            studentId: req.body?.studentId,
            paymentMethodId: req.body?.paymentMethodId || req.body?.cardId,
        });
        res.json({ success: true, ...result });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to remove card' });
    }
});

router.post('/parent/billing/bank', allowPortalRoles('parent'), (req, res) => {
    if (!parentProofUpload) {
        return res.status(503).json({ success: false, error: 'File upload is not available on the server.' });
    }
    parentProofUpload.single('file')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                error: err.code === 'LIMIT_FILE_SIZE'
                    ? 'Payment proof must be 1 MB or smaller.'
                    : err.message || 'Upload failed',
            });
        }
        let savedProofPath = null;
        try {
            if (!req.portalActorId) return unauthorized(res);
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'Payment proof screenshot or PDF is required' });
            }
            savedProofPath = proofPublicPath(req.file.filename);
            let enrollmentIds = req.body?.enrollmentIds;
            if (typeof enrollmentIds === 'string') {
                try {
                    enrollmentIds = JSON.parse(enrollmentIds);
                } catch {
                    enrollmentIds = String(enrollmentIds).split(',').map((id) => id.trim()).filter(Boolean);
                }
            }
            const phone = String(req.body?.phone || '').replace(/\D/g, '');
            const payments = await submitPortalBankPayment({
                actor: {
                    userId: req.portalActorId,
                    role: 'parent',
                    email: req.user?.email,
                    name: req.user?.name,
                },
                enrollmentIds,
                invoiceMode: req.body?.invoiceMode,
                months: req.body?.months,
                proofUrl: savedProofPath,
                phone,
                payerName: req.body?.payerName || req.user?.name,
            });
            savedProofPath = null;
            res.status(201).json({
                success: true,
                message: 'Payment proof received. Our accountant will verify your transfer.',
                createdCount: payments.length,
                payment: payments[0],
            });
        } catch (error) {
            if (savedProofPath) deleteProofFile(savedProofPath);
            const code = error.status || 500;
            res.status(code).json({ success: false, error: error.message || 'Failed to submit bank payment' });
        }
    });
});

router.get('/parent/payments/:id/invoice', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        const payment = await findAccessiblePayment({
            paymentId: req.params.id,
            actor: { userId: req.portalActorId, role: 'parent', email: req.user?.email },
        });
        if (!isPaidStatus(payment.status)) {
            return res.status(400).json({ success: false, error: 'Invoice is available after the fee is received' });
        }
        return await sendPortalInvoicePdf(res, payment, req.query);
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to download invoice' });
    }
});

router.get('/parent/enrollments/:id/invoice', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        const enrollment = await findAccessibleEnrollment({
            enrollmentId: req.params.id,
            actor: { userId: req.portalActorId, role: 'parent', email: req.user?.email },
        });
        if (enrollment.paymentStatus !== 'paid') {
            return res.status(400).json({ success: false, error: 'Invoice is available after the fee is received' });
        }
        return await sendEnrollmentPdf(res, enrollment, 'invoice');
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to download invoice' });
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
        const student = await User.findById(studentId).select('email deletedAt');
        if (!student || isUserTrashed(student)) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        const enrollments = await loadStudentDisplayEnrollments(studentId, student.email);
        const timetable = buildStudentWeeklyTimetable(enrollments);
        res.json({ success: true, timetable, dayLabels: DAY_LABELS });
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

        const [enrollmentsBase, visibility, assignmentVisibility] = await Promise.all([
            loadStudentDisplayEnrollments(studentId, student?.email),
            studentResourceMongoFilter(studentId),
            studentAssignmentMongoFilter(studentId),
        ]);
        const enrolledCourseIds = enrollmentsBase
            .map((e) => e.course?._id || e.course)
            .filter(Boolean);

        const [submissions, quizAttempts, payments, resources, assignments] = await Promise.all([
            AssignmentSubmission.find({ student: studentId, ...activeLmsFilter() })
                .populate({
                    path: 'assignment',
                    select: 'title dueDate attachments course',
                    populate: { path: 'course', select: 'title category' },
                })
                .sort({ submittedAt: -1 })
                .limit(100),
            QuizAttempt.find({ student: studentId, ...activeLmsFilter() })
                .populate({
                    path: 'quiz',
                    select: 'title totalMarks quizType resourceLink resourceFileUrl attachments questions dueDate course',
                    populate: { path: 'course', select: 'title' },
                })
                .sort({ createdAt: -1 })
                .limit(30),
            Payment.find(studentPaymentsFilter(studentId, student?.email))
                .populate('course', 'title')
                .sort({ createdAt: -1 }),
            enrolledCourseIds.length
                ? Resource.find(mergeMongoFilters(visibility, activeLmsFilter()))
                      .populate('course', 'title')
                      .populate('teacher', 'name')
                      .sort({ createdAt: -1 })
                      .lean()
                : Promise.resolve([]),
            Assignment.find(
                mergeMongoFilters(assignmentVisibility, { status: 'published' }, activeLmsFilter())
            )
                .populate('course', 'title category')
                .sort({ dueDate: 1 })
                .limit(100),
        ]);

        const latestPaymentByCourse = new Map();
        for (const payment of payments) {
            const courseId = String(payment.course?._id || payment.course || '');
            if (courseId && !latestPaymentByCourse.has(courseId)) {
                latestPaymentByCourse.set(courseId, payment);
            }
        }
        const enrollments = enrollmentsBase.map((row) => {
            const courseId = String(row.course?._id || row.course || '');
            const latestPayment = latestPaymentByCourse.get(courseId);
            return {
                ...row,
                feeDueDate: row.feeDueDate || row.course?.feeDueDate || null,
                feeAmount:
                    latestPayment?.amount != null
                        ? latestPayment.amount
                        : row.course?.price != null
                          ? row.course.price
                          : null,
                feeDate: latestPayment?.createdAt || row.updatedAt || row.createdAt || null,
            };
        });

        const quizAttemptsOut = quizAttempts.map((a) => {
            const o = a.toObject();
            o.scoreDisplay = formatScoreDisplay(o.score, o.quiz?.totalMarks);
            o.review = o.quiz ? buildQuizReviewPayload(o.quiz, o.answers || []) : null;
            if (o.quiz) {
                delete o.quiz.createdByRole;
                delete o.quiz.lockedForTeacher;
                o.quiz.questions = (o.quiz.questions || []).map(({ correctAnswer, ...rest }) => rest);
            }
            return o;
        });
        const submissionsByAssignment = Object.fromEntries(
            submissions.map((row) => [String(row.assignment?._id || row.assignment), row])
        );
        const assignmentsOut = assignments.map((assignment) =>
            mapAssignmentForPortal(assignment, {
                viewerRole: 'parent',
                submission: submissionsByAssignment[String(assignment._id)] || null,
            })
        );
        const listedAssignmentIds = new Set(assignmentsOut.map((row) => String(row._id)));
        for (const submission of submissions) {
            const assignment = submission.assignment;
            const assignmentId = String(assignment?._id || assignment || '');
            if (!assignmentId || listedAssignmentIds.has(assignmentId)) continue;
            listedAssignmentIds.add(assignmentId);
            assignmentsOut.push(
                mapAssignmentForPortal(assignment || { _id: assignmentId, title: 'Submitted assignment' }, {
                    viewerRole: 'parent',
                    submission,
                })
            );
        }
        assignmentsOut.sort((a, b) => {
            const aSubmitted = a.submission?.submittedAt ? 1 : 0;
            const bSubmitted = b.submission?.submittedAt ? 1 : 0;
            if (aSubmitted !== bSubmitted) return aSubmitted - bSubmitted;
            const aDue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
            const bDue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
            return aDue - bDue;
        });

        res.json({
            success: true,
            enrollments,
            submissions,
            assignments: assignmentsOut,
            quizAttempts: quizAttemptsOut,
            resources,
            payments: serializePayments(payments),
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load child data' });
    }
});

module.exports = router;
