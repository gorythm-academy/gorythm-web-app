const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        default: null
    },
    enrollmentDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'inactive'],
        default: 'inactive'
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    lastAccessed: {
        type: Date,
        default: Date.now
    },
    completionDate: {
        type: Date
    },
    grade: {
        type: String,
        default: null
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    /** Class schedule row this student attends (day/time/teacher). */
    assignedSchedule: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassSchedule',
        default: null,
    },
    deletedAt: { type: Date, default: null },
}, { timestamps: true });

enrollmentSchema.index({ student: 1, deletedAt: 1 });
enrollmentSchema.index({ deletedAt: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);