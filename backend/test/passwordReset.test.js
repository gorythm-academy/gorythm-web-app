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
const { adminNoticeRecipients, paymentSummary, parentReceiptText, studentReceiptText } = require('../services/sendPaymentReceiptEmail');
const { buildLoginCardText, loginReadyLines } = require('../services/loginCardEmail');
const { deliverableInbox, peopleLoginEmailError, distinctParentEmail } = require('../utils/studentPortalEmail');

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

test('a student login must be a real inbox, and a matching parent email is not a second account', () => {
    assert.equal(peopleLoginEmailError('ali@gorythmacademy.com') !== '', true);
    assert.equal(peopleLoginEmailError('ali@gmail.com'), '');
    assert.equal(distinctParentEmail('ali@gmail.com', 'ali@gmail.com'), '');
    assert.equal(distinctParentEmail('ali@gmail.com', 'parent@gmail.com'), 'parent@gmail.com');
    assert.equal(distinctParentEmail('ali@gmail.com', 'parent@gorythmacademy.com'), '');
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
    assert.match(text, /Login: ali@gorythmacademy.com/);
    assert.match(text, /GRT-2026-001/);
    assert.match(text, /Quran — Fatima/);
    assert.equal(text.includes('password is'), false);
    assert.equal(/stripe|card/i.test(text), false);
});

test('parent fee email has no name, and the student fee email keeps the student name and the invoice', () => {
    const login = loginReadyLines({
        user: { name: 'Parent of Farhan', email: 'parent@gmail.com', role: 'parent' },
        setPasswordUrl: 'https://gorythmacademy.com/reset-password?token=abc',
        courses: [],
        children: ['Farhan'],
        includeChildren: false,
    }).join('\n');
    const parent = parentReceiptText({
        course: 'Quran Recitation With Tajweed',
        amount: 'EUR 25.00',
        invoiceNo: 'GA-2026-000035',
        loginText: login,
    });
    assert.match(parent, /^Asalam-o-Alikum,/);
    assert.equal(parent.includes('Assalamu alaikum'), false);
    assert.equal(parent.includes('Thank you for studying'), false);
    assert.equal(parent.includes('Farhan'), false);
    assert.equal(parent.includes('Linked Students'), false);
    assert.match(parent, /We have recorded your fee for Quran Recitation With Tajweed\.[\s\S]*Amount: EUR 25\.00[\s\S]*Reference: GA-2026-000035[\s\S]*Your Gorythm Academy login is ready\.[\s\S]*Login: parent@gmail\.com[\s\S]*A PDF copy of this confirmation is attached/);

    const studentLogin = loginReadyLines({
        user: { name: 'Farhan', email: 'farhan@gmail.com', role: 'student', studentId: 'GRT-2026-008' },
        setPasswordUrl: 'https://gorythmacademy.com/reset-password?token=abc',
        courses: ['Quran Recitation With Tajweed'],
        children: [],
    }).join('\n');
    const student = studentReceiptText({
        studentName: 'Farhan',
        course: 'Quran Recitation With Tajweed',
        amount: 'EUR 25.00',
        invoiceNo: 'GA-2026-000035',
        loginText: studentLogin,
    });
    assert.match(student, /^Assalamu alaikum Farhan,/);
    assert.match(student, /Roll Number: GRT-2026-008/);
    assert.match(student, /We have recorded your fee for Quran Recitation With Tajweed/);
    assert.match(student, /A PDF copy of this confirmation is attached/);

    const multiParent = parentReceiptText({
        fees: [
            { course: 'Tajweed', amount: 'EUR 25.00', invoiceNo: 'GA-1' },
            { course: 'Arabic', amount: 'EUR 30.00', invoiceNo: 'GA-2' },
        ],
        loginText: login,
        attachmentCount: 2,
    });
    assert.match(multiParent, /^Asalam-o-Alikum,/);
    assert.match(multiParent, /We have recorded your fee for Tajweed/);
    assert.match(multiParent, /We have recorded your fee for Arabic/);
    assert.match(multiParent, /Your Gorythm Academy login is ready/);
    assert.match(multiParent, /PDF copies of these confirmations are attached/);
    assert.equal(multiParent.includes('Assalamu alaikum'), false);
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
