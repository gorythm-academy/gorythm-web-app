const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            default: 'academy-settings',
        },
        general: {
            academyName: { type: String, default: '' },
            contactEmail: { type: String, default: '' },
            supportPhone: { type: String, default: '' },
            websiteUrl: { type: String, default: '' },
            timezone: { type: String, default: 'UTC+05:00' },
            language: { type: String, default: 'English' },
            dateFormat: { type: String, default: 'MM/DD/YYYY' },
        },
        payment: {
            currency: { type: String, default: 'USD' },
            stripePublicKey: { type: String, default: '' },
            stripeSecretKey: { type: String, default: '' },
            paypalClientId: { type: String, default: '' },
            taxRate: { type: Number, default: 0 },
            invoicePrefix: { type: String, default: 'GORYTHM' },
        },
        email: {
            smtpHost: { type: String, default: 'smtp.gmail.com' },
            smtpPort: { type: String, default: '587' },
            smtpUser: { type: String, default: '' },
            smtpPassword: { type: String, default: '' },
            fromEmail: { type: String, default: 'noreply@gorythm.com' },
            fromName: { type: String, default: 'Gorythm Academy' },
        },
        security: {
            requireEmailVerification: { type: Boolean, default: true },
            requireAdminApproval: { type: Boolean, default: false },
            maxLoginAttempts: { type: Number, default: 5 },
            sessionTimeout: { type: Number, default: 24 },
            twoFactorAuth: { type: Boolean, default: false },
            passwordMinLength: { type: Number, default: 8 },
        },
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('AdminSettings', adminSettingsSchema);
