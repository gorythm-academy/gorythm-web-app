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
        // REMOVED enum to allow any duration like "12 weeks", "16 weeks"
    },
    level: { 
        type: String, 
        enum: ['beginner', 'intermediate', 'advanced'],
        default: 'beginner'
    },
    instructor: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    instructorName: { type: String, default: '' },
    modules: [{
        title: String,
        videos: [{
            title: String,
            url: String,
            duration: Number, // in minutes
            description: String
        }],
        documents: [{
            title: String,
            fileUrl: String
        }],
        quizzes: [{
            title: String,
            questions: [{
                question: String,
                options: [String],
                correctAnswer: Number
            }]
        }]
    }],
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    imageUrl: { type: String, default: '' },
    homepageImage: { type: String, default: '' },
    slug: { type: String, default: '' },
    isPublished: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', courseSchema);