const mongoose = require('mongoose');
const { reportIndexErrors } = require('../utils/duplicateKey');

const quizAttemptSchema = new mongoose.Schema(
    {
        quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        answers: [{ type: Number }],
        attachments: [{ type: String }],
        score: { type: Number, default: 0 },
        submittedAt: { type: Date, default: Date.now },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// One live attempt per student and quiz. A re-attempt first moves the old one to trash.
quizAttemptSchema.index(
    { quiz: 1, student: 1 },
    {
        unique: true,
        name: 'uniq_active_quiz_student',
        partialFilterExpression: { deletedAt: { $type: 'null' } },
    }
);

const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);
reportIndexErrors(QuizAttempt);

module.exports = QuizAttempt;
