const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowPermission } = require('../middleware/authorize');

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
router.get('/', authMiddleware, allowPermission('settings.general.read'), (req, res) => {
    res.json({
        success: true,
        ...settings
    });
});

// Save all settings
router.post('/', authMiddleware, (req, res) => {
    try {
        const next = { ...settings };
        const role = req.user.role;

        if (req.body.general && ['super-admin', 'admin'].includes(role)) {
            next.general = { ...next.general, ...req.body.general };
        }
        if (req.body.security && ['super-admin', 'admin'].includes(role)) {
            next.security = { ...next.security, ...req.body.security };
        }
        if (req.body.email && ['super-admin', 'admin'].includes(role)) {
            next.email = { ...next.email, ...req.body.email };
        }
        if (req.body.payment && ['super-admin', 'admin', 'accountant'].includes(role)) {
            next.payment = { ...next.payment, ...req.body.payment };
        }

        settings = next;
        
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