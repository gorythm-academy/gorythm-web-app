/**
 * Remove legacy assignment grading fields from MongoDB (score, feedback, graded status, maxPoints).
 *
 * Usage: node scripts/stripAssignmentGradingFields.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not set');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const assignments = await Assignment.updateMany(
        {},
        { $unset: { maxPoints: '' } }
    );

    const submissionsUnset = await AssignmentSubmission.updateMany(
        {},
        { $unset: { score: '', feedback: '' } }
    );

    const submissionsStatus = await AssignmentSubmission.updateMany(
        { status: 'graded' },
        { $set: { status: 'submitted' } }
    );

    console.log(
        JSON.stringify(
            {
                assignmentsMaxPointsUnset: assignments.modifiedCount,
                submissionsScoreFeedbackUnset: submissionsUnset.modifiedCount,
                submissionsGradedToSubmitted: submissionsStatus.modifiedCount,
            },
            null,
            2
        )
    );

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
