const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        dueDate: { type: Date, required: true },
        attachments: [{ type: String }],
        status: { type: String, enum: ['draft', 'published'], default: 'published' },
        /** admin | teacher — who created the record */
        createdByRole: { type: String, enum: ['admin', 'teacher'], default: 'teacher' },
        createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        /** When true, owning teacher may only extend due date (admin-created). */
        lockedForTeacher: { type: Boolean, default: false },
        /** Links bulk admin publishes created in one action. */
        publishGroupId: { type: String, default: null },
        dueDateExtensions: [
            {
                extendedAt: { type: Date, default: Date.now },
                extendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                extendedByRole: { type: String, default: null },
                previousDueDate: { type: Date, default: null },
                newDueDate: { type: Date, required: true },
            },
        ],
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Assignment', assignmentSchema);
