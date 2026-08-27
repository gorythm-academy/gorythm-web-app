const { getOrCreateSettings, applySettingsUpdateForRole } = require('./settingsService');

const DEFAULT_HEADLINE = 'Stay updated with our latest courses.';
const DEFAULT_BUTTON = 'Subscribe';

function normalizeMarketingPayload(body = {}) {
    const delayRaw = parseInt(body.subscribePopupDelaySeconds, 10);
    const headline = String(body.subscribePopupHeadline || '').trim();
    const buttonText = String(body.subscribePopupButtonText || '').trim();
    return {
        subscribePopupEnabled:
            body.subscribePopupEnabled === true ||
            body.subscribePopupEnabled === 'true' ||
            body.subscribePopupEnabled === 1 ||
            body.subscribePopupEnabled === '1',
        subscribePopupDelaySeconds: Number.isFinite(delayRaw)
            ? Math.min(300, Math.max(0, delayRaw))
            : 10,
        subscribePopupHeadline: headline || DEFAULT_HEADLINE,
        subscribePopupButtonText: buttonText || DEFAULT_BUTTON,
        subscribePopupImagePath: String(body.subscribePopupImagePath || '').trim(),
    };
}

function serializeSubscribePopup(marketing = {}) {
    const normalized = normalizeMarketingPayload(marketing);
    return {
        enabled: normalized.subscribePopupEnabled,
        delaySeconds: normalized.subscribePopupDelaySeconds,
        headline: normalized.subscribePopupHeadline,
        buttonText: normalized.subscribePopupButtonText,
        imagePath: normalized.subscribePopupImagePath,
    };
}

function marketingToAdminForm(marketing = {}) {
    const normalized = normalizeMarketingPayload(marketing);
    return {
        subscribePopupEnabled: normalized.subscribePopupEnabled,
        subscribePopupDelaySeconds: normalized.subscribePopupDelaySeconds,
        subscribePopupHeadline: normalized.subscribePopupHeadline,
        subscribePopupButtonText: normalized.subscribePopupButtonText,
        subscribePopupImagePath: normalized.subscribePopupImagePath,
    };
}

async function loadSubscribePopupSettings() {
    const settings = await getOrCreateSettings();
    return marketingToAdminForm(settings.marketing || {});
}

async function saveSubscribePopupSettings(body, { role, userId }) {
    const marketing = normalizeMarketingPayload(body);
    const { settings, updatedSections } = await applySettingsUpdateForRole({
        body: { marketing },
        role,
        userId,
    });
    if (!updatedSections.includes('marketing')) {
        const error = new Error('Popup settings could not be saved for your account role.');
        error.statusCode = 400;
        throw error;
    }
    return marketingToAdminForm(settings.marketing || {});
}

module.exports = {
    normalizeMarketingPayload,
    serializeSubscribePopup,
    marketingToAdminForm,
    loadSubscribePopupSettings,
    saveSubscribePopupSettings,
};
