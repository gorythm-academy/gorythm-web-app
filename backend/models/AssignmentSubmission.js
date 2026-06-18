const mongoose = require('mongoose');

const assignmentSubmissionSchema = new mongoose.Schema(
    {
        assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, default: '' },
        attachments: [{ type: String }],
        status: { type: String, enum: ['submitted'], default: 'submitted' },
        submittedAt: { type: Date, default: Date.now },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('AssignmentSubmission', assignmentSubmissionSchema);
