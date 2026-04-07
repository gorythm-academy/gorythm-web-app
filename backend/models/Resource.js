const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        fileUrl: { type: String, default: '' },
        type: { type: String, enum: ['note', 'file', 'link'], default: 'note' },
        description: { type: String, default: '' },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Resource', resourceSchema);
