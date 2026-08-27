const AdminSettings = require('../models/AdminSettings');
const { canonicalizeScheduleTimezone, DEFAULT_ACADEMY_TIMEZONE } = require('../utils/scheduleTimezone');

const SETTINGS_KEY = 'academy-settings';

const SECTION_CONFIG = {
    general: {
        roles: ['super-admin', 'manager'],
        fields: ['academyName', 'contactEmail', 'supportPhone', 'websiteUrl', 'timezone', 'language', 'dateFormat'],
    },
    security: {
        roles: ['super-admin', 'manager'],
        fields: ['requireEmailVerification', 'requireAdminApproval', 'maxLoginAttempts', 'sessionTimeout', 'twoFactorAuth', 'passwordMinLength'],
    },
    email: {
        roles: ['super-admin', 'manager'],
        fields: ['smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'fromEmail', 'fromName'],
    },
    payment: {
        roles: ['super-admin', 'manager', 'accountant'],
        fields: [
            'currency',
            'stripePublicKey',
            'stripeSecretKey',
            'paypalClientId',
            'taxRate',
            'invoicePrefix',
            'bankAccountName',
            'bankName',
            'bankAccountNumber',
            'bankIban',
            'bankSwift',
            'bankExtraNote',
        ],
    },
    marketing: {
        roles: ['super-admin', 'manager'],
        fields: [
            'subscribePopupEnabled',
            'subscribePopupDelaySeconds',
            'subscribePopupHeadline',
            'subscribePopupButtonText',
            'subscribePopupImagePath',
        ],
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

        if (section === 'general' && sanitized.timezone !== undefined) {
            sanitized.timezone = canonicalizeScheduleTimezone(
                sanitized.timezone,
                DEFAULT_ACADEMY_TIMEZONE
            );
        }

        if (section === 'marketing' && sanitized.subscribePopupDelaySeconds !== undefined) {
            const n = parseInt(sanitized.subscribePopupDelaySeconds, 10);
            sanitized.subscribePopupDelaySeconds = Number.isFinite(n)
                ? Math.min(300, Math.max(0, n))
                : 10;
        }

        settings[section] = { ...(settings[section]?.toObject?.() || settings[section] || {}), ...sanitized };
        if (typeof settings.markModified === 'function') {
            settings.markModified(section);
        }
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
