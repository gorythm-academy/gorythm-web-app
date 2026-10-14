const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWhatsAppNumber } = require('../utils/phoneE164');

test('stores a valid mobile number in E.164 form', () => {
    const result = normalizeWhatsAppNumber('+92 301 2345678', { required: true });
    assert.deepEqual(result, { ok: true, e164: '+923012345678' });
});

test('accepts a 00 prefix and spacing', () => {
    const result = normalizeWhatsAppNumber('00 31 6 1234 5678');
    assert.equal(result.ok, true);
    assert.equal(result.e164, '+31612345678');
});

test('allows an empty optional number and rejects an empty required one', () => {
    assert.deepEqual(normalizeWhatsAppNumber('  '), { ok: true, e164: '' });
    const required = normalizeWhatsAppNumber('', { required: true });
    assert.equal(required.ok, false);
    assert.match(required.error, /WhatsApp number/);
});

test('rejects local numbers, landlines, and junk', () => {
    assert.equal(normalizeWhatsAppNumber('03012345678', { required: true }).ok, false);
    assert.equal(normalizeWhatsAppNumber('+31201234567', { required: true }).ok, false);
    assert.equal(normalizeWhatsAppNumber('+123', { required: true }).ok, false);
    assert.equal(normalizeWhatsAppNumber('not-a-phone').ok, false);
    assert.equal(normalizeWhatsAppNumber('+923012345678 extra').ok, false);
});
