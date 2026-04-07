const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true },
        options: [{ type: String }],
        correctAnswer: { type: Number, default: 0 },
    },
    { _id: false }
);

const quizSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        questions: [quizQuestionSchema],
        totalMarks: { type: Number, default: 100 },
        status: { type: String, enum: ['draft', 'published'], default: 'published' },
        dueDate: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Quiz', quizSchema);
