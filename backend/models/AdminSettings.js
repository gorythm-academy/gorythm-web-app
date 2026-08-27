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
            timezone: { type: String, default: 'Asia/Karachi' },
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
            bankAccountName: { type: String, default: '' },
            bankName: { type: String, default: '' },
            bankAccountNumber: { type: String, default: '' },
            bankIban: { type: String, default: '' },
            bankSwift: { type: String, default: '' },
            bankExtraNote: { type: String, default: '' },
        },
        email: {
            smtpHost: { type: String, default: 'smtp.gmail.com' },
            smtpPort: { type: String, default: '587' },
            smtpUser: { type: String, default: '' },
            smtpPassword: { type: String, default: '' },
            fromEmail: { type: String, default: 'noreply@gorythmacademy.com' },
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
        marketing: {
            subscribePopupEnabled: { type: Boolean, default: false },
            subscribePopupDelaySeconds: { type: Number, default: 10, min: 0, max: 300 },
            subscribePopupHeadline: {
                type: String,
                default: 'Stay updated with our latest courses.',
                trim: true,
            },
            subscribePopupButtonText: { type: String, default: 'Subscribe', trim: true },
            subscribePopupImagePath: { type: String, default: '', trim: true },
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
