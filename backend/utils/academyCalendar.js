/** Due dates are school days in Pakistan, not a clock time on each computer. */
const ACADEMY_TIME_ZONE = 'Asia/Karachi';
const ACADEMY_OFFSET = '+05:00';

function asDate(value) {
    if (value instanceof Date) return value;
    const date = new Date(value);
    return date;
}

/** YYYY-MM-DD for this instant in Asia/Karachi. */
function calendarDay(value) {
    if (value == null || value === '') return '';
    const date = asDate(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: ACADEMY_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

/** 00:00 in Pakistan on the academy day of this instant. Used for date-range queries. */
function startOfAcademyDay(value = new Date()) {
    const day = calendarDay(value);
    if (!day) return null;
    return new Date(`${day}T00:00:00${ACADEMY_OFFSET}`);
}

function isRealCalendarDay(year, month, day) {
    const instant = new Date(Date.UTC(year, month - 1, day, 12));
    return (
        instant.getUTCFullYear() === year
        && instant.getUTCMonth() === month - 1
        && instant.getUTCDate() === day
    );
}

/**
 * Store a due date at noon UTC on the academy day.
 * Noon UTC is still that same calendar day from UTC-12 through UTC+12, including Pakistan.
 */
function dueDateInstant(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
        const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            if (!isRealCalendarDay(year, month, day)) return null;
            return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
        }
    }
    const day = calendarDay(value);
    if (!day) return null;
    return new Date(`${day}T12:00:00.000Z`);
}

function parseAcademyDueDate(value) {
    if (value == null || value === '') return null;
    const instant = dueDateInstant(value);
    if (!instant) {
        const err = new Error('Invalid due date');
        err.status = 400;
        throw err;
    }
    return instant;
}

function isCalendarDayPast(dueDate, now = new Date()) {
    if (!dueDate) return false;
    const due = calendarDay(dueDate);
    const today = calendarDay(now);
    if (!due || !today) return false;
    return due < today;
}

function formatAcademyDate(value) {
    const day = calendarDay(value);
    if (!day) return '';
    const [year, month, date] = day.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, date)));
}

module.exports = {
    ACADEMY_TIME_ZONE,
    calendarDay,
    startOfAcademyDay,
    dueDateInstant,
    parseAcademyDueDate,
    isCalendarDayPast,
    formatAcademyDate,
};
