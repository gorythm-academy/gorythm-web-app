const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true
    },
    password: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['super-admin', 'admin', 'teacher', 'accountant', 'student', 'parent'], 
        default: 'student' 
    },
    phone: { type: String, default: '' },
    avatar: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    canLogin: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    isSystemAccount: { type: Boolean, default: false },
    enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    this.updatedAt = Date.now();
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get user without password
userSchema.methods.toJSON = function() {
    const user = this.toObject();
    delete user.password;
    return user;
};

module.exports = mongoose.model('User', userSchema);