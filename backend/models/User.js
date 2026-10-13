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
        enum: ['super-admin', 'manager', 'teacher', 'accountant', 'student', 'parent'], 
        default: 'student' 
    },
    studentId: { type: String, unique: true, sparse: true },
    /** Optional Gmail/Hotmail/etc.; portal login uses `email`. */
    personalEmail: { type: String, default: '', trim: true, lowercase: false },
    phone: { type: String, default: '' },
    avatar: { type: String, default: '' },
    status: {
        type: String,
        enum: ['active', 'inactive', 'completed'],
        default: 'active'
    },
    isActive: { type: Boolean, default: true },
    canLogin: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    /** Bumped when the password changes so older login tokens stop working. */
    sessionVersion: { type: Number, default: 0 },
    /** Failed password attempts since last successful login (for lockout). */
    failedLoginAttempts: { type: Number, default: 0 },
    /** When set and in the future, login is rejected until this time. */
    loginLockedUntil: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: '', select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
    loginEmailSentAt: { type: Date, default: null },
    loginEmailSentTo: { type: [String], default: [] },
    loginEmailLastError: { type: String, default: '' },
    isSystemAccount: { type: Boolean, default: false },
    enrolledCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    lastLogin: { type: Date },
    stripeCustomerId: { type: String, default: '' },
    stripePaymentMethodId: { type: String, default: '' },
    stripeSavedCards: {
        type: [
            {
                id: { type: String, required: true },
                brand: { type: String, default: 'card' },
                last4: { type: String, default: '' },
                expMonth: { type: Number, default: null },
                expYear: { type: Number, default: null },
            },
        ],
        default: [],
    },
    /** Per-admin: hide dashboard activity feed items at or before this time. */
    adminActivitiesClearedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (this.role === 'student' && this.isModified('name') && this.name) {
        this.name = String(this.name)
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    if (!this.isModified('password')) return next();
    if (!this.isNew) {
        this.sessionVersion = Number(this.sessionVersion || 0) + 1;
        this.passwordResetTokenHash = '';
        this.passwordResetExpires = null;
    }
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
    delete user.passwordResetTokenHash;
    delete user.passwordResetExpires;
    delete user.sessionVersion;
    delete user.failedLoginAttempts;
    delete user.loginLockedUntil;
    delete user.stripeCustomerId;
    delete user.stripePaymentMethodId;
    delete user.stripeSavedCards;
    return user;
};

userSchema.index({ role: 1, deletedAt: 1 });
userSchema.index({ studentId: 1 });

module.exports = mongoose.model('User', userSchema);