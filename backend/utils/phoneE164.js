const { parsePhoneNumberFromString } = require('libphonenumber-js/mobile');

const MESSAGES = {
    required: 'Please enter your WhatsApp number.',
    invalid: 'Enter a valid WhatsApp number for the selected country.',
    optionalInvalid: 'Enter a valid WhatsApp number for the selected country, or leave the field empty.',
};

function toInternational(raw) {
    const text = String(raw).trim().replace(/^tel:/i, '').trim();
    if (!text || /[a-z]/i.test(text)) return '';
    const compact = text.replace(/[\s().-]/g, '');
    if (!/^(\+|00)?\d+$/.test(compact)) return '';
    if (compact.startsWith('+')) return compact;
    if (compact.startsWith('00')) return `+${compact.slice(2)}`;
    return '';
}

/**
 * Accept only a real mobile number in international form.
 * Local numbers without a country code are rejected so a caller cannot skip the country selector.
 */
function normalizeWhatsAppNumber(input, { required = false } = {}) {
    const raw = String(input ?? '').trim();
    if (!raw) {
        if (required) return { ok: false, error: MESSAGES.required };
        return { ok: true, e164: '' };
    }

    const candidate = toInternational(raw);
    if (!/^\+[1-9]\d{6,14}$/.test(candidate)) {
        return { ok: false, error: required ? MESSAGES.invalid : MESSAGES.optionalInvalid };
    }

    const parsed = parsePhoneNumberFromString(candidate);
    if (!parsed?.isValid()) {
        return { ok: false, error: required ? MESSAGES.invalid : MESSAGES.optionalInvalid };
    }

    const type = parsed.getType();
    if (type && type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') {
        return { ok: false, error: required ? MESSAGES.invalid : MESSAGES.optionalInvalid };
    }

    return { ok: true, e164: parsed.number };
}

module.exports = {
    WHATSAPP_PHONE_MESSAGES: MESSAGES,
    normalizeWhatsAppNumber,
};
