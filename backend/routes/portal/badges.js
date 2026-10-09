const express = require('express');
const router = express.Router();

const { allowPortalRoles, getPortalActorId } = require('../../middleware/portalAccess');
const Assignment = require('../../models/Assignment');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const Quiz = require('../../models/Quiz');
const QuizAttempt = require('../../models/QuizAttempt');
const Resource = require('../../models/Resource');
const Payment = require('../../models/Payment');
const PayrollRun = require('../../models/PayrollRun');
const { getTeacherCourseIds } = require('../../services/teacherCourseAccess');
const { activeLmsFilter, mergeMongoFilters } = require('../../utils/lmsTrashQuery');
const { activePaymentListFilter } = require('../../utils/paymentQuery');
const {
    studentAssignmentMongoFilter,
    studentPublishedQuizMongoFilter,
    studentResourceMongoFilter,
    teacherAssignmentScopeFilter,
    teacherResourceMongoFilter,
} = require('../../utils/lmsContentRules');
const ParentStudentLink = require('../../models/ParentStudentLink');
const { isUserTrashed } = require('../../utils/userQuery');
const {
    parsePortalSince,
    assignmentEditMongoClause,
    quizEditMongoClause,
    submissionActivityMongoClause,
    adminPublishedClause,
    mergeStudentAssignmentVisibility,
} = require('../../utils/portalBadgeRules');
const { getStudentCourseIds, teacherQuizScopeFilter } = require('./helpers');

async function studentQuizMongoFilter(studentId) {
    const courseIds = await getStudentCourseIds(studentId);
    const published = await studentPublishedQuizMongoFilter(studentId);
    if (!courseIds.length) return published;
    const attemptQuizIds = await QuizAttempt.find({
        student: studentId,
        ...activeLmsFilter(),
    }).distinct('quiz');
    return {
        $or: [
            published,
            ...(attemptQuizIds.length
                ? [{ _id: { $in: attemptQuizIds }, course: { $in: courseIds } }]
                : []),
        ],
    };
}

router.get('/student/badges', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });

        const sinceAssignments = parsePortalSince(req.query.sinceAssignments);
        const sinceQuizzes = parsePortalSince(req.query.sinceQuizzes);
        const sinceContent = parsePortalSince(req.query.sinceContent);

        const assignmentVisibility = await mergeStudentAssignmentVisibility(studentId);
        const assignmentBase = mergeMongoFilters(assignmentVisibility, { status: 'published' }, activeLmsFilter());
        const quizBase = mergeMongoFilters(await studentQuizMongoFilter(studentId), activeLmsFilter());
        const resourceBase = mergeMongoFilters(await studentResourceMongoFilter(studentId), activeLmsFilter());

        const [assignments, assignmentsEdit, quizzes, quizzesEdit, content] = await Promise.all([
            Assignment.countDocuments({
                ...assignmentBase,
                createdAt: { $gt: sinceAssignments },
            }),
            Assignment.exists({
                ...assignmentBase,
                createdAt: { $lte: sinceAssignments },
                ...assignmentEditMongoClause(sinceAssignments),
            }),
            Quiz.countDocuments({
                ...quizBase,
                createdAt: { $gt: sinceQuizzes },
            }),
            Quiz.exists({
                ...quizBase,
                ...quizEditMongoClause(sinceQuizzes),
            }),
            Resource.countDocuments({
                ...resourceBase,
                createdAt: { $gt: sinceContent },
            }),
        ]);

        res.json({
            success: true,
            assignments,
            assignmentsEdit: Boolean(assignmentsEdit),
            quizzes,
            quizzesEdit: Boolean(quizzesEdit),
            content,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load student badges' });
    }
});

router.get('/teacher/badges', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const sinceSubmissions = parsePortalSince(req.query.sinceSubmissions);
        const sinceQuizAttempts = parsePortalSince(req.query.sinceQuizAttempts);
        const sinceAdminAssignments = parsePortalSince(req.query.sinceAdminAssignments);
        const sinceAdminResources = parsePortalSince(req.query.sinceAdminResources);

        const courseIds = await getTeacherCourseIds(teacherId);
        const assignmentScope = {
            ...teacherAssignmentScopeFilter(teacherId),
            ...activeLmsFilter(),
        };
        const myAssignmentIds = await Assignment.distinct('_id', assignmentScope);
        const submissionBase = {
            assignment: { $in: myAssignmentIds },
            ...activeLmsFilter(),
        };
        const adminAssignmentBase = {
            ...assignmentScope,
            ...adminPublishedClause,
        };
        const adminResourceBase = mergeMongoFilters(
            await teacherResourceMongoFilter(teacherId, courseIds),
            adminPublishedClause,
            activeLmsFilter()
        );
        const quizIds = await Quiz.find({
            ...teacherQuizScopeFilter(teacherId, courseIds),
            ...activeLmsFilter(),
        }).distinct('_id');

        const sinceSubmissionsDate = sinceSubmissions;
        const submissionNewClause = {
            $expr: {
                $gt: [{ $ifNull: ['$submittedAt', '$createdAt'] }, sinceSubmissionsDate],
            },
        };

        const [
            submissionCount,
            adminAssignmentCount,
            assignmentEdits,
            submissionEdits,
            adminResources,
            quizAttempts,
        ] = await Promise.all([
            AssignmentSubmission.countDocuments({
                ...submissionBase,
                ...submissionNewClause,
            }),
            Assignment.countDocuments({
                ...adminAssignmentBase,
                createdAt: { $gt: sinceAdminAssignments },
            }),
            Assignment.exists({
                ...assignmentScope,
                createdAt: { $lte: sinceAdminAssignments },
                ...assignmentEditMongoClause(sinceAdminAssignments),
            }),
            AssignmentSubmission.exists({
                ...submissionBase,
                ...submissionActivityMongoClause(sinceSubmissions),
            }),
            Resource.countDocuments({
                ...adminResourceBase,
                createdAt: { $gt: sinceAdminResources },
            }),
            QuizAttempt.countDocuments({
                quiz: { $in: quizIds },
                ...activeLmsFilter(),
                createdAt: { $gt: sinceQuizAttempts },
            }),
        ]);

        res.json({
            success: true,
            submissions: submissionCount + adminAssignmentCount,
            submissionsEdit: Boolean(assignmentEdits || submissionEdits),
            adminResources,
            quizAttempts,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teacher badges' });
    }
});

router.get('/parent/badges', allowPortalRoles('parent'), async (req, res) => {
    try {
        const parentId = getPortalActorId(req);
        if (!parentId) return res.status(401).json({ success: false, error: 'Unauthorized' });

        const sinceProgress = parsePortalSince(req.query.sinceProgress);

        const links = await ParentStudentLink.find({ parent: parentId }).populate('student', 'name deletedAt');
        const studentIds = links
            .filter((l) => l.student && !isUserTrashed(l.student))
            .map((l) => l.student._id);

        if (!studentIds.length) {
            return res.json({ success: true, progress: 0 });
        }

        let progress = 0;
        for (const studentId of studentIds) {
            const [assignmentVisibility, resourceVisibility] = await Promise.all([
                studentAssignmentMongoFilter(studentId),
                studentResourceMongoFilter(studentId),
            ]);
            const assignmentBase = mergeMongoFilters(assignmentVisibility, { status: 'published' }, activeLmsFilter());
            const resourceBase = mergeMongoFilters(resourceVisibility, activeLmsFilter());
            const [a, r] = await Promise.all([
                Assignment.countDocuments({ ...assignmentBase, createdAt: { $gt: sinceProgress } }),
                Resource.countDocuments({ ...resourceBase, createdAt: { $gt: sinceProgress } }),
            ]);
            progress += a + r;
        }

        res.json({ success: true, progress });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load parent badges' });
    }
});

router.get('/accountant/badges', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const [payments, payroll] = await Promise.all([
            Payment.countDocuments({
                ...activePaymentListFilter(),
                status: 'awaiting_review',
                paymentMethod: 'bank',
                proofUrl: { $nin: [null, ''] },
            }),
            PayrollRun.countDocuments({ status: 'pending_review' }),
        ]);
        res.json({ success: true, payments, payroll });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load accountant badges' });
    }
});

module.exports = router;
