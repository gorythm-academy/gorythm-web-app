const mongoose = require('mongoose');

const parentStudentLinkSchema = new mongoose.Schema(
    {
        parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        relation: { type: String, enum: ['father', 'mother', 'guardian', 'other'], default: 'guardian' },
    },
    { timestamps: true }
);

/** One parent per student; a parent may still have many students. */
parentStudentLinkSchema.index({ student: 1 }, { unique: true });
parentStudentLinkSchema.index({ parent: 1 });

module.exports = mongoose.model('ParentStudentLink', parentStudentLinkSchema);
