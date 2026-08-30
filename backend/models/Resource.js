const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        /** Slot teacher this resource targets (teacher scope). */
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        /** teacher = slot students only; course = all enrolled students */
        scope: { type: String, enum: ['teacher', 'course'], default: 'teacher' },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        createdByRole: { type: String, enum: ['admin', 'teacher'], default: 'teacher' },
        createdByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        lockedForTeacher: { type: Boolean, default: false },
        publishGroupId: { type: String, default: null },
        fileUrl: { type: String, default: '' },
        attachments: { type: [String], default: [] },
        type: { type: String, enum: ['note', 'file', 'link'], default: 'note' },
        description: { type: String, default: '' },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Resource', resourceSchema);
