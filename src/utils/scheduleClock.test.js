import { describeScheduleClock } from './scheduleClock';

const mondayEvening = {
    dayOfWeek: 1,
    startTime: '18:00',
    endTime: '19:00',
    timezone: 'Asia/Karachi',
};

const winterMonday = new Date('2026-01-05T08:00:00Z');
const summerMonday = new Date('2026-07-06T08:00:00Z');

describe('describeScheduleClock', () => {
    test('students in Pakistan see only Pakistan time', () => {
        const clock = describeScheduleClock(mondayEvening, {
            audience: 'student',
            viewerTimeZone: 'Asia/Karachi',
            now: winterMonday,
        });
        expect(clock.primary).toMatchObject({
            day: 'Monday',
            time: '6:00 – 7:00 PM',
            tag: 'Pakistan time',
        });
        expect(clock.secondary).toBeNull();
        expect(clock.dayNote).toBeNull();
    });

    test('students outside Pakistan see their time first and Pakistan time under it', () => {
        const clock = describeScheduleClock(mondayEvening, {
            audience: 'student',
            viewerTimeZone: 'Asia/Riyadh',
            now: winterMonday,
        });
        expect(clock.primary).toMatchObject({
            day: 'Monday',
            time: '4:00 – 5:00 PM',
            tag: 'Your time (Riyadh)',
        });
        expect(clock.secondary).toBe('Pakistan time: 6:00 – 7:00 PM');
        expect(clock.dayNote).toBeNull();
    });

    test('a late Pakistan class can be the next day for the student', () => {
        const clock = describeScheduleClock(mondayEvening, {
            audience: 'student',
            viewerTimeZone: 'Australia/Sydney',
            now: winterMonday,
        });
        expect(clock.primary).toMatchObject({
            day: 'Tuesday',
            time: '12:00 – 1:00 AM',
            tag: 'Your time (Sydney)',
        });
        expect(clock.secondary).toBe('Pakistan time: Monday, 6:00 – 7:00 PM');
        expect(clock.dayNote).toBe('Pakistan: Mon');
    });

    test('UK local time follows daylight saving on the upcoming class', () => {
        const winter = describeScheduleClock(mondayEvening, {
            audience: 'student',
            viewerTimeZone: 'Europe/London',
            now: winterMonday,
        });
        const summer = describeScheduleClock(mondayEvening, {
            audience: 'student',
            viewerTimeZone: 'Europe/London',
            now: summerMonday,
        });
        expect(winter.primary.time).toBe('1:00 – 2:00 PM');
        expect(summer.primary.time).toBe('2:00 – 3:00 PM');
    });

    test('US East local time follows daylight saving on the upcoming class', () => {
        const winter = describeScheduleClock(mondayEvening, {
            audience: 'student',
            viewerTimeZone: 'America/New_York',
            now: winterMonday,
        });
        const summer = describeScheduleClock(mondayEvening, {
            audience: 'student',
            viewerTimeZone: 'America/New_York',
            now: summerMonday,
        });
        expect(winter.primary.time).toBe('8:00 – 9:00 AM');
        expect(summer.primary.time).toBe('9:00 – 10:00 AM');
    });

    test('admins outside Pakistan keep Pakistan time as the main time', () => {
        const clock = describeScheduleClock(mondayEvening, {
            audience: 'staff',
            viewerTimeZone: 'Asia/Riyadh',
            now: winterMonday,
        });
        expect(clock.primary).toMatchObject({
            day: 'Monday',
            time: '6:00 – 7:00 PM',
            tag: 'Pakistan time',
        });
        expect(clock.secondary).toBe('Your time: 4:00 – 5:00 PM (Riyadh)');
    });

    test('admins in Pakistan do not get a second line', () => {
        const clock = describeScheduleClock(mondayEvening, {
            audience: 'staff',
            viewerTimeZone: 'Asia/Karachi',
            now: winterMonday,
        });
        expect(clock.secondary).toBeNull();
        expect(clock.primary.tag).toBe('Pakistan time');
    });

    test('admins far ahead see their weekday on the second line', () => {
        const clock = describeScheduleClock(mondayEvening, {
            audience: 'staff',
            viewerTimeZone: 'Australia/Sydney',
            now: winterMonday,
        });
        expect(clock.primary.day).toBe('Monday');
        expect(clock.secondary).toBe('Your time: Tuesday, 12:00 – 1:00 AM (Sydney)');
    });
});
