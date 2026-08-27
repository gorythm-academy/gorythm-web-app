const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { 
        type: String, 
        enum: ['Quranic Arabic', 'Tajweed', 'Islamic Studies', 'STEM', 'Memorization (Hifz)', 'Fiqh', 'Hadith', 'Seerah', 'Aqeedah', 'Other'],
        required: true 
    },
    price: { type: Number, default: 0 },
    duration: { 
        type: String, 
        default: '8 weeks'
    },
    level: { 
        type: String, 
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner'
    },
    /** Legacy mirror of first assigned teacher (optional). Prefer `instructors`. */
    instructor: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null,
        required: false,
    },
    instructorName: { type: String, default: '' },
    /** Assigned teachers for this course (shared by Courses + Teachers tabs). */
    instructors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    imageUrl: { type: String, default: '' },
    homepageImage: { type: String, default: '' },
    displayOrder: { type: Number, default: 9999 },
    masonryColumn: { type: Number, enum: [1, 2, 3, null], default: null },
    slug: { type: String },
    isPublished: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

courseSchema.index(
    { slug: 1 },
    { unique: true, partialFilterExpression: { slug: { $exists: true, $type: 'string' } } }
);
courseSchema.index({ deletedAt: 1, createdAt: -1 });
courseSchema.index({ isPublished: 1, deletedAt: 1 });

module.exports = mongoose.model('Course', courseSchema);
