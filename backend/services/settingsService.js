const AdminSettings = require('../models/AdminSettings');

const SETTINGS_KEY = 'academy-settings';

const SECTION_CONFIG = {
    general: {
        roles: ['super-admin', 'admin'],
        fields: ['academyName', 'contactEmail', 'supportPhone', 'websiteUrl', 'timezone', 'language', 'dateFormat'],
    },
    security: {
        roles: ['super-admin', 'admin'],
        fields: ['requireEmailVerification', 'requireAdminApproval', 'maxLoginAttempts', 'sessionTimeout', 'twoFactorAuth', 'passwordMinLength'],
    },
    email: {
        roles: ['super-admin', 'admin'],
        fields: ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'fromEmail', 'fromName'],
    },
    payment: {
        roles: ['super-admin', 'admin', 'accountant'],
        fields: ['currency', 'stripePublicKey', 'stripeSecretKey', 'paypalClientId', 'taxRate', 'invoicePrefix'],
    },
};

const sanitizeSection = (payload, allowedFields) => {
    const out = {};
    for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
            out[field] = payload[field];
        }
    }
    return out;
};

const getOrCreateSettings = async () => {
    let settings = await AdminSettings.findOne({ key: SETTINGS_KEY });
    if (!settings) {
        settings = await AdminSettings.create({ key: SETTINGS_KEY });
    }
    return settings;
};

const applySettingsUpdateForRole = async ({ body, role, userId }) => {
    const settings = await getOrCreateSettings();
    const updatedSections = [];

    for (const [section, cfg] of Object.entries(SECTION_CONFIG)) {
        if (!body?.[section]) continue;
        if (!cfg.roles.includes(role)) continue;
        if (typeof body[section] !== 'object' || body[section] === null || Array.isArray(body[section])) continue;

        const sanitized = sanitizeSection(body[section], cfg.fields);
        if (Object.keys(sanitized).length === 0) continue;

        settings[section] = { ...settings[section], ...sanitized };
        updatedSections.push(section);
    }

    if (updatedSections.length > 0) {
        settings.lastUpdatedBy = userId || null;
        await settings.save();
    }

    return { settings, updatedSections };
};

module.exports = {
    getOrCreateSettings,
    applySettingsUpdateForRole,
    SECTION_CONFIG,
};
