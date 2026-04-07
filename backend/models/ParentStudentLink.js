const mongoose = require('mongoose');

const parentStudentLinkSchema = new mongoose.Schema(
    {
        parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        relation: { type: String, enum: ['father', 'mother', 'guardian', 'other'], default: 'guardian' },
    },
    { timestamps: true }
);

parentStudentLinkSchema.index({ parent: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('ParentStudentLink', parentStudentLinkSchema);
