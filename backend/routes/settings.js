const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowPermission } = require('../middleware/authorize');
const { getOrCreateSettings, applySettingsUpdateForRole } = require('../services/settingsService');

// Get all settings
router.get('/', authMiddleware, allowPermission('settings.general.read'), async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        res.json({
            success: true,
            general: settings.general,
            payment: settings.payment,
            email: settings.email,
            security: settings.security,
            updatedAt: settings.updatedAt,
        });
    } catch (error) {
        req.log.error('Error fetching settings', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch settings',
        });
    }
});

// Save all settings
router.post('/', authMiddleware, allowPermission('settings.general.write'), async (req, res) => {
    try {
        const role = req.user.role;
        const userId = req.user?.userId || req.user?.id || null;
        const { updatedSections } = await applySettingsUpdateForRole({
            body: req.body,
            role,
            userId,
        });
        
        req.log.info('Settings saved', { updatedSections });

        res.json({
            success: true,
            message: updatedSections.length
                ? 'Settings saved successfully'
                : 'No allowed settings changes were provided',
            updatedSections,
        });
    } catch (error) {
        req.log.error('Error saving settings', { err: error });
        res.status(500).json({
            success: false,
            error: 'Failed to save settings'
        });
    }
});

module.exports = router;