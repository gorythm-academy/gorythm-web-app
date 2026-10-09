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
        /** Class timeslot — only students on this schedule see the quiz. */
        assignedSchedule: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ClassSchedule',
            default: null,
        },
        /** mcq = multiple-choice quiz with scored questions; file = reading/file quiz with no questions. */
        quizType: { type: String, enum: ['mcq', 'file'], default: 'mcq' },
        questions: [quizQuestionSchema],
        totalMarks: { type: Number, default: null },
        resourceLink: { type: String, default: '' },
        resourceFileUrl: { type: String, default: '' },
        attachments: [{ type: String }],
        createdByRole: { type: String, enum: ['admin', 'teacher'], default: 'teacher' },
        lockedForTeacher: { type: Boolean, default: false },
        status: { type: String, enum: ['draft', 'published'], default: 'published' },
        dueDate: { type: Date, default: null },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

quizSchema.index({ assignedSchedule: 1 });
quizSchema.index({ course: 1, teacher: 1, assignedSchedule: 1 });

module.exports = mongoose.model('Quiz', quizSchema);
