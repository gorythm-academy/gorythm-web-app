const express = require('express');
const router = express.Router();

// In-memory settings storage (replace with MongoDB in production)
let settings = {
    general: {
        academyName: '',
        contactEmail: '',
        supportPhone: '',
        websiteUrl: '',
        timezone: 'UTC+05:00',
        language: 'English',
        dateFormat: 'MM/DD/YYYY'
    },
    payment: {
        currency: 'USD',
        stripePublicKey: '',
        stripeSecretKey: '',
        paypalClientId: '',
        taxRate: 0,
        invoicePrefix: 'GORYTHM'
    },
    email: {
        smtpHost: 'smtp.gmail.com',
        smtpPort: '587',
        smtpUser: '',
        smtpPassword: '',
        fromEmail: 'noreply@gorythm.com',
        fromName: 'Gorythm Academy'
    },
    security: {
        requireEmailVerification: true,
        requireAdminApproval: false,
        maxLoginAttempts: 5,
        sessionTimeout: 24,
        twoFactorAuth: false,
        passwordMinLength: 8
    }
};

// Get all settings
router.get('/', (req, res) => {
    res.json({
        success: true,
        ...settings
    });
});

// Save all settings
router.post('/', (req, res) => {
    try {
        settings = {
            ...settings,
            ...req.body
        };
        
        console.log('Settings saved:', settings);
        
        res.json({
            success: true,
            message: 'Settings saved successfully'
        });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save settings'
        });
    }
});

module.exports = router;