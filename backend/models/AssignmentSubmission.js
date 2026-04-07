const mongoose = require('mongoose');

const assignmentSubmissionSchema = new mongoose.Schema(
    {
        assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, default: '' },
        attachments: [{ type: String }],
        status: { type: String, enum: ['submitted', 'graded'], default: 'submitted' },
        score: { type: Number, default: null },
        feedback: { type: String, default: '' },
        submittedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model('AssignmentSubmission', assignmentSubmissionSchema);
