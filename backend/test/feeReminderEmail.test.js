const test = require('node:test');
const assert = require('node:assert/strict');
const { recipientEmails, reminderCopy } = require('../services/feeReminderEmail');

test('skips placeholder portal addresses', () => {
    const emails = recipientEmails(
        { personalEmail: '', email: 'pending.student1@gorythmacademy.com' },
        { personalEmail: 'parent@example.com', email: 'pending.parent1@gorythmacademy.com' }
    );
    assert.deepEqual(emails, ['parent@example.com']);
});

test('tells auto-pay families the card will be charged', () => {
    const copy = reminderCopy(
        'due',
        { autoPayEnabled: true, course: { title: 'Nazrah' }, feeDueDate: new Date('2026-09-25T12:00:00+05:00') },
        'Amina'
    );
    assert.match(copy.text, /will charge your saved card/i);
    assert.match(copy.text, /25\/09\/2026/);
    assert.equal(/pay from Fees by card/i.test(copy.text), false);
});
