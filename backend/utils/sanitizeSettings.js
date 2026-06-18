const SECRET_FIELDS = new Set(['smtpPassword', 'stripeSecretKey']);

function maskSecret(value) {
    const s = String(value || '');
    if (!s) return '';
    if (s.length <= 4) return '••••';
    return `${'•'.repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}

function sanitizeSection(section = {}) {
    const out = { ...section };
    for (const key of Object.keys(out)) {
        if (SECRET_FIELDS.has(key) && out[key]) {
            out[key] = maskSecret(out[key]);
            out[`${key}Set`] = true;
        }
    }
    return out;
}

function sanitizeSettingsForApi(settings) {
    if (!settings) return null;
    const o = settings.toObject ? settings.toObject() : settings;
    return {
        general: o.general || {},
        payment: sanitizeSection(o.payment || {}),
        email: sanitizeSection(o.email || {}),
        security: o.security || {},
        updatedAt: o.updatedAt,
    };
}

module.exports = { sanitizeSettingsForApi, maskSecret };
