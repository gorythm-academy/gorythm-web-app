const AssignmentSubmission = require('../models/AssignmentSubmission');
const { activeLmsFilter } = require('./lmsTrashQuery');
const { studentAssignmentMongoFilter } = require('./lmsContentRules');

const MS_EDIT_GRACE = 60_000;

function parsePortalSince(raw, fallbackDays = 7) {
    if (!raw) return new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000);
    const d = new Date(raw);
    return Number.isNaN(d.getTime())
        ? new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000)
        : d;
}

/** Matches client assignmentUpdatedSince for existing (non-new) assignments. */
function assignmentEditMongoClause(since) {
    const sinceDate = since instanceof Date ? since : new Date(since);
    return {
        $or: [
            { 'dueDateExtensions.extendedAt': { $gt: sinceDate } },
            {
                $and: [
                    { updatedAt: { $gt: sinceDate } },
                    { createdAt: { $lte: sinceDate } },
                    { $expr: { $gt: [{ $subtract: ['$updatedAt', '$createdAt'] }, MS_EDIT_GRACE] } },
                ],
            },
        ],
    };
}

/** Any submit / resubmit activity since cutoff (teacher submission badges). */
function submissionActivityMongoClause(since) {
    const sinceDate = since instanceof Date ? since : new Date(since);
    return {
        $or: [
            { submittedAt: { $gt: sinceDate } },
            { updatedAt: { $gt: sinceDate } },
            { createdAt: { $gt: sinceDate } },
        ],
    };
}

const adminPublishedClause = {
    $or: [{ lockedForTeacher: true }, { createdByRole: 'admin' }],
};

async function mergeStudentAssignmentVisibility(studentId) {
    const visibility = await studentAssignmentMongoFilter(studentId);
    const submissionAssignmentIds = await AssignmentSubmission.find({
        student: studentId,
        ...activeLmsFilter(),
    }).distinct('assignment');
    if (!submissionAssignmentIds.length) return visibility;
    const submissionClause = { _id: { $in: submissionAssignmentIds } };
    if (visibility.$or) {
        return { $or: [...visibility.$or, submissionClause] };
    }
    if (visibility._id?.$in?.length === 0) {
        return submissionClause;
    }
    return { $or: [visibility, submissionClause] };
}

/** Matches client quiz update notices for existing (non-new) quizzes. */
function quizEditMongoClause(since) {
    const sinceDate = since instanceof Date ? since : new Date(since);
    return {
        $and: [
            { updatedAt: { $gt: sinceDate } },
            { createdAt: { $lte: sinceDate } },
            { $expr: { $gt: [{ $subtract: ['$updatedAt', '$createdAt'] }, MS_EDIT_GRACE] } },
        ],
    };
}

function quizUpdatedAfterAttempt(quiz, attempt) {
    if (!quiz || !attempt) return false;
    const updatedAt = quiz.updatedAt ? new Date(quiz.updatedAt).getTime() : 0;
    const createdAt = quiz.createdAt ? new Date(quiz.createdAt).getTime() : 0;
    const attemptedAt = new Date(attempt.submittedAt || attempt.createdAt || 0).getTime();
    if (!updatedAt || !attemptedAt) return false;
    return updatedAt > attemptedAt && updatedAt > createdAt + MS_EDIT_GRACE;
}

module.exports = {
    MS_EDIT_GRACE,
    parsePortalSince,
    assignmentEditMongoClause,
    quizEditMongoClause,
    quizUpdatedAfterAttempt,
    submissionActivityMongoClause,
    adminPublishedClause,
    mergeStudentAssignmentVisibility,
};
