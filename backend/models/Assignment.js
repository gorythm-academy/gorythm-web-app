const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        dueDate: { type: Date, required: true },
        maxPoints: { type: Number, default: 100 },
        attachments: [{ type: String }],
        status: { type: String, enum: ['draft', 'published'], default: 'published' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Assignment', assignmentSchema);
