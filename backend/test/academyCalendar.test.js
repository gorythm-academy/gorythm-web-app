const test = require('node:test');
const assert = require('node:assert/strict');
const {
    calendarDay,
    dueDateInstant,
    parseAcademyDueDate,
    isCalendarDayPast,
    startOfAcademyDay,
    formatAcademyDate,
} = require('../utils/academyCalendar');

test('a date-only due date is stored at noon UTC on that day', () => {
    const stored = dueDateInstant('2026-10-26');
    assert.equal(stored.toISOString(), '2026-10-26T12:00:00.000Z');
    assert.equal(calendarDay(stored), '2026-10-26');
});

test('an old UTC-midnight quiz stays on the same Pakistan day', () => {
    const stored = new Date('2026-10-26T00:00:00.000Z');
    assert.equal(calendarDay(stored), '2026-10-26');
    assert.equal(isCalendarDayPast(stored, new Date('2026-10-26T18:00:00.000Z')), false);
    assert.equal(isCalendarDayPast(stored, new Date('2026-10-26T21:00:00.000Z')), true);
});

test('Pakistan midnight is the start of the school day', () => {
    const start = startOfAcademyDay(new Date('2026-10-26T21:00:00.000Z'));
    assert.equal(start.toISOString(), '2026-10-26T19:00:00.000Z');
    assert.equal(formatAcademyDate(new Date('2026-10-26T00:00:00.000Z')), '26 Oct 2026');
});

test('an impossible calendar day is rejected', () => {
    assert.equal(dueDateInstant('2026-02-31'), null);
    assert.throws(
        () => parseAcademyDueDate('2026-02-31'),
        (err) => err.status === 400 && err.message === 'Invalid due date'
    );
});
