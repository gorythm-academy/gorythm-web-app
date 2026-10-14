const test = require('node:test');
const assert = require('node:assert/strict');
const {
    hashToken,
    deliveryAddress,
    canReceiveReset,
    canApplyPasswordReset,
    resetUrl,
} = require('../services/passwordReset');
const { subscribeAction } = require('../services/subscriberResubscribe');
const { adminNoticeRecipients, paymentSummary } = require('../services/sendPaymentReceiptEmail');
const { buildLoginCardText } = require('../services/loginCardEmail');
const { deliverableInbox } = require('../utils/studentPortalEmail');

test('reset link goes to personal email and names the portal username separately', () => {
    const user = {
        email: 'pending.abc@gorythmacademy.com',
        personalEmail: 'Family@Gmail.com',
        canLogin: true,
        isActive: true,
    };
    assert.equal(deliveryAddress(user), 'family@gmail.com');
    assert.equal(canReceiveReset(user), true);
});

test('a portal login is not used when no personal email is saved', () => {
    const user = {
        email: 'ali@gorythmacademy.com',
        personalEmail: '',
        canLogin: true,
        isActive: true,
    };
    assert.equal(deliveryAddress(user), '');
    assert.equal(canReceiveReset(user), false);
});

test('an external login address can still receive a reset', () => {
    const user = {
        email: 'family@gmail.com',
        personalEmail: '',
        canLogin: true,
        isActive: true,
    };
    assert.equal(deliveryAddress(user), 'family@gmail.com');
});

test('locked or placeholder-only accounts do not receive a reset', () => {
    assert.equal(canReceiveReset({
        email: 'pending.abc@gorythmacademy.com',
        personalEmail: '',
        canLogin: true,
        isActive: true,
    }), false);
    assert.equal(canReceiveReset({
        email: 'ali@gorythmacademy.com',
        canLogin: false,
        isActive: true,
    }), false);
    assert.equal(canReceiveReset({
        email: 'ali@gorythmacademy.com',
        isActive: false,
        deletedAt: null,
    }), false);
});

test('an inactive teacher or parent can still use a set-password link', () => {
    assert.equal(canApplyPasswordReset({
        email: 'teacher@gorythmacademy.com',
        role: 'teacher',
        canLogin: false,
        isActive: false,
        deletedAt: null,
    }), true);
    assert.equal(canApplyPasswordReset({ deletedAt: new Date() }), false);
});

test('reset tokens are stored as a hash and the link stays on the site', () => {
    const hash = hashToken('abc');
    assert.equal(hash, hashToken('abc'));
    assert.notEqual(hash, 'abc');
    assert.match(resetUrl('abc'), /\/reset-password\?token=abc$/);
});

test('an unsubscribed address must confirm before updates resume', () => {
    assert.equal(subscribeAction(null), 'create');
    assert.equal(subscribeAction({ email: 'a@b.com' }), 'refresh');
    assert.equal(subscribeAction({ unsubscribedAt: new Date() }), 'confirm');
});

test('login card names the portal login and leaves out a password', () => {
    assert.equal(deliverableInbox('ali@gorythmacademy.com'), '');
    assert.equal(deliverableInbox('family@gmail.com'), 'family@gmail.com');
    const text = buildLoginCardText({
        user: { name: 'Ali', email: 'ali@gorythmacademy.com', role: 'student', studentId: 'GRT-2026-001' },
        setPasswordUrl: 'https://gorythmacademy.com/reset-password?token=abc',
        courses: ['Quran — Fatima, Sunday 16:00–17:00'],
        children: [],
    });
    assert.match(text, /Portal Login: ali@gorythmacademy.com/);
    assert.match(text, /GRT-2026-001/);
    assert.match(text, /Quran — Fatima/);
    assert.equal(text.includes('password is'), false);
    assert.equal(/stripe|card/i.test(text), false);
});

test('payment notice lists the payer and not card data', () => {
    const previous = process.env.PAYMENT_NOTIFY_EMAIL;
    process.env.PAYMENT_NOTIFY_EMAIL = 'office@gorythmacademy.com, office@gorythmacademy.com';
    assert.deepEqual(adminNoticeRecipients(), ['office@gorythmacademy.com']);
    const summary = paymentSummary({
        studentName: 'Ali',
        courseName: 'Quran',
        cardLast4: '4242',
        lines: [{ studentName: 'Ali', courseName: 'Quran' }],
    });
    assert.match(summary, /Ali — Quran/);
    assert.equal(summary.includes('4242'), false);
    if (previous === undefined) delete process.env.PAYMENT_NOTIFY_EMAIL;
    else process.env.PAYMENT_NOTIFY_EMAIL = previous;
});
