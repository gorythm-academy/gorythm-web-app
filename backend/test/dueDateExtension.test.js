const test = require('node:test');
const assert = require('node:assert/strict');
const { recordDueDateExtension, startOfDay } = require('../utils/lmsContentRules');

test('recordDueDateExtension rejects due dates on or before the current due date', () => {
    const assignment = { dueDate: new Date(2027, 0, 20), dueDateExtensions: [] };

    assert.throws(
        () => recordDueDateExtension(assignment, '2027-01-20', 'admin-user', 'admin'),
        (err) => err.message === 'Extended due date must be after the current due date'
    );

    assert.throws(
        () => recordDueDateExtension(assignment, '2027-01-15', 'admin-user', 'admin'),
        (err) => err.message === 'Extended due date must be after the current due date'
    );
});

test('recordDueDateExtension stores extension history when the new date is later', () => {
    const assignment = { dueDate: new Date(2027, 0, 20), dueDateExtensions: [] };
    const next = recordDueDateExtension(assignment, '2027-01-25', 'admin-user', 'admin');

    assert.equal(startOfDay(next).getTime(), startOfDay(new Date(2027, 0, 25)).getTime());
    assert.equal(assignment.dueDateExtensions.length, 1);
    assert.equal(assignment.dueDateExtensions[0].extendedByRole, 'admin');
});
