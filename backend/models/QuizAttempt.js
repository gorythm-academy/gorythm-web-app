const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema(
    {
        quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        answers: [{ type: Number }],
        score: { type: Number, default: 0 },
        submittedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
