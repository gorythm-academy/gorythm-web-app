const WEEKDAY_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const DEFAULT_ACADEMY_TIMEZONE = 'Asia/Karachi';

/** Common abbreviations → IANA (Intl handles DST where applicable). Keep in sync with src/utils/scheduleTimezone.js */
const TIMEZONE_ALIASES = {
    utc: 'UTC',
    gmt: 'UTC',
    z: 'UTC',
    pkt: 'Asia/Karachi',
    pkr: 'Asia/Karachi',
    pkst: 'Asia/Karachi',
    gst: 'Asia/Dubai',
    uae: 'Asia/Dubai',
    cet: 'Europe/Amsterdam',
    cest: 'Europe/Amsterdam',
    eet: 'Europe/Helsinki',
    wet: 'Europe/Lisbon',
    bst: 'Europe/London',
    est: 'America/New_York',
    edt: 'America/New_York',
    cst: 'America/Chicago',
    cdt: 'America/Chicago',
    mst: 'America/Denver',
    mdt: 'America/Denver',
    pst: 'America/Los_Angeles',
    pdt: 'America/Los_Angeles',
    akst: 'America/Anchorage',
    hst: 'Pacific/Honolulu',
    aest: 'Australia/Sydney',
    aedt: 'Australia/Sydney',
    jst: 'Asia/Tokyo',
    kst: 'Asia/Seoul',
    sgt: 'Asia/Singapore',
    hkt: 'Asia/Hong_Kong',
};

function offsetFromParts(signChar, hours, minutes) {
    const sign = signChar === '+' ? 1 : -1;
    const h = Number(hours);
    const m = Number(minutes || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h > 14 || m >= 60) return null;
    return sign * (h * 60 + m);
}

function parseUtcOffsetMinutes(timeZone) {
    const raw = String(timeZone || '').trim();
    if (!raw) return null;

    const upper = raw.toUpperCase().replace(/\s+/g, '');
    if (upper === 'UTC' || upper === 'GMT' || upper === 'Z') return 0;

    let m = raw.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::(\d{2}))?$/i);
    if (m) return offsetFromParts(m[1], m[2], m[3]);

    m = raw.match(/^([+-])\s*(\d{1,2})(?::(\d{2}))?$/);
    if (m) return offsetFromParts(m[1], m[2], m[3]);

    m = raw.match(/^([+-])(\d{2})(\d{2})$/);
    if (m) return offsetFromParts(m[1], m[2], m[3]);

    return null;
}

function lookupTimezoneAlias(timeZone) {
    const key = String(timeZone || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
    return TIMEZONE_ALIASES[key] || null;
}

function isValidIanaTimeZone(timeZone) {
    try {
        Intl.DateTimeFormat(undefined, { timeZone });
        return true;
    } catch {
        return false;
    }
}

function resolveTimeZone(timeZone) {
    const raw = String(timeZone || '').trim();
    if (!raw) return DEFAULT_ACADEMY_TIMEZONE;

    const alias = lookupTimezoneAlias(raw);
    if (alias) return alias;

    if (parseUtcOffsetMinutes(raw) !== null) return raw;

    if (isValidIanaTimeZone(raw)) return raw;

    return DEFAULT_ACADEMY_TIMEZONE;
}

/** Stable storage/API form: IANA name or `UTC±HH:MM`. Never returns bare garbage. */
function canonicalizeScheduleTimezone(timeZone, fallback = DEFAULT_ACADEMY_TIMEZONE) {
    const resolved = resolveTimeZone(timeZone || fallback);
    const offsetMin = parseUtcOffsetMinutes(resolved);
    if (offsetMin !== null) {
        const sign = offsetMin >= 0 ? '+' : '-';
        const abs = Math.abs(offsetMin);
        const hh = String(Math.floor(abs / 60)).padStart(2, '0');
        const mm = String(abs % 60).padStart(2, '0');
        return `UTC${sign}${hh}:${mm}`;
    }
    return resolved;
}

function withNormalizedTimezone(schedule, fallback = DEFAULT_ACADEMY_TIMEZONE) {
    const tz = canonicalizeScheduleTimezone(schedule?.timezone, fallback);
    return { ...schedule, timezone: tz };
}

function scheduleTimeToMinutes(timeStr) {
    const parts = String(timeStr || '').split(':');
    if (parts.length < 2) return NaN;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
}

function getZonedClock(now = new Date(), timeZone = DEFAULT_ACADEMY_TIMEZONE) {
    const tz = canonicalizeScheduleTimezone(timeZone);
    const offsetMinutes = parseUtcOffsetMinutes(tz);
    if (offsetMinutes !== null) {
        const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
        const local = new Date(utcMs + offsetMinutes * 60000);
        return {
            dayOfWeek: local.getUTCDay(),
            currentMinutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
        };
    }

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);
    const pick = (type) => parts.find((p) => p.type === type)?.value || '';
    let hour = Number(pick('hour'));
    const minute = Number(pick('minute'));
    if (hour === 24) hour = 0;
    return {
        dayOfWeek: WEEKDAY_TO_INDEX[pick('weekday')] ?? 0,
        currentMinutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
    };
}

function minutesUntilNextStart(schedule, now = new Date()) {
    const { dayOfWeek, currentMinutes } = getZonedClock(now, schedule.timezone);
    const startMin = scheduleTimeToMinutes(schedule.startTime);
    const endMin = scheduleTimeToMinutes(schedule.endTime);
    if (Number.isNaN(startMin)) return Number.MAX_SAFE_INTEGER;

    let daysAhead = (schedule.dayOfWeek - dayOfWeek + 7) % 7;
    if (daysAhead === 0 && !Number.isNaN(endMin) && currentMinutes >= endMin) {
        daysAhead = 7;
    }
    if (daysAhead === 0) {
        return Math.max(0, startMin - currentMinutes);
    }
    return daysAhead * 24 * 60 + (startMin - currentMinutes);
}

function nextScheduleOccurrenceMs(schedule, now = new Date()) {
    const mins = minutesUntilNextStart(schedule, now);
    return now.getTime() + mins * 60000;
}

function scheduleStatus(schedule, now = new Date()) {
    const { dayOfWeek, currentMinutes } = getZonedClock(now, schedule.timezone);
    const startMin = scheduleTimeToMinutes(schedule.startTime);
    const endMin = scheduleTimeToMinutes(schedule.endTime);

    if (schedule.dayOfWeek === dayOfWeek && !Number.isNaN(startMin) && !Number.isNaN(endMin)) {
        if (currentMinutes >= startMin && currentMinutes < endMin) return 'live';
    }
    return 'upcoming';
}

module.exports = {
    DEFAULT_ACADEMY_TIMEZONE,
    TIMEZONE_ALIASES,
    resolveTimeZone,
    canonicalizeScheduleTimezone,
    withNormalizedTimezone,
    parseUtcOffsetMinutes,
    scheduleTimeToMinutes,
    getZonedClock,
    minutesUntilNextStart,
    nextScheduleOccurrenceMs,
    scheduleStatus,
};
