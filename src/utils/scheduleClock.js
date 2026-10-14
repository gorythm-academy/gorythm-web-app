import { canonicalizeScheduleTimezone, DEFAULT_ACADEMY_TIMEZONE } from './scheduleTimezone';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function readViewerTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_ACADEMY_TIMEZONE;
    } catch {
        return DEFAULT_ACADEMY_TIMEZONE;
    }
}

export function officialZoneShort(timeZone) {
    const tz = canonicalizeScheduleTimezone(timeZone || DEFAULT_ACADEMY_TIMEZONE);
    if (tz === 'Asia/Karachi') return 'PKT';
    if (tz === 'UTC') return 'UTC';
    return tz.split('/').pop()?.replace(/_/g, ' ') || tz;
}

function zoneCity(timeZone) {
    const tz = canonicalizeScheduleTimezone(timeZone || DEFAULT_ACADEMY_TIMEZONE);
    if (tz === 'Asia/Karachi') return 'Pakistan';
    if (tz === 'UTC') return 'UTC';
    return tz.split('/').pop()?.replace(/_/g, ' ') || tz;
}

function academyTag(timeZone) {
    const tz = canonicalizeScheduleTimezone(timeZone || DEFAULT_ACADEMY_TIMEZONE);
    if (tz === 'Asia/Karachi') return 'Pakistan time';
    return `${zoneCity(tz)} time`;
}

function zoneParts(instant, timeZone) {
    const tz = canonicalizeScheduleTimezone(timeZone);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(instant);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    let hour = Number(get('hour'));
    if (hour === 24) hour = 0;
    return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        hour,
        minute: Number(get('minute')),
        second: Number(get('second')),
        dayIndex: WEEKDAY_TO_INDEX[get('weekday')] ?? 0,
    };
}

function zoneOffsetMs(instant, timeZone) {
    const parts = zoneParts(instant, timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - instant.getTime();
}

function wallTimeInZoneToDate(year, month, day, hour, minute, timeZone) {
    let utc = Date.UTC(year, month - 1, day, hour, minute);
    for (let i = 0; i < 3; i += 1) {
        utc = Date.UTC(year, month - 1, day, hour, minute) - zoneOffsetMs(new Date(utc), timeZone);
    }
    return new Date(utc);
}

function parseHm(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
}

function addDaysYmd(year, month, day, delta) {
    const shifted = new Date(Date.UTC(year, month - 1, day + delta));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}

function upcomingWallDate(dayOfWeek, startMin, endMin, timeZone, now) {
    const today = zoneParts(now, timeZone);
    const target = Number(dayOfWeek);
    const nowMin = today.hour * 60 + today.minute;
    const crossesMidnight = endMin <= startMin;

    if (crossesMidnight) {
        const endDay = (target + 1) % 7;
        if (today.dayIndex === endDay && nowMin < endMin) {
            return addDaysYmd(today.year, today.month, today.day, -1);
        }
    }

    let delta = (target - today.dayIndex + 7) % 7;
    const ends = crossesMidnight ? endMin + 24 * 60 : endMin;
    if (delta === 0 && nowMin >= ends) delta = 7;
    return addDaysYmd(today.year, today.month, today.day, delta);
}

function formatHm(hour, minute) {
    const period = hour >= 12 ? 'PM' : 'AM';
    let hours = hour % 12;
    if (hours === 0) hours = 12;
    return {
        text: `${hours}:${String(minute).padStart(2, '0')} ${period}`,
        period,
    };
}

function formatRange(startAt, endAt, timeZone) {
    const start = zoneParts(startAt, timeZone);
    const end = zoneParts(endAt, timeZone);
    const startClock = formatHm(start.hour, start.minute);
    const endClock = formatHm(end.hour, end.minute);
    const time = startClock.period === endClock.period
        ? `${startClock.text.replace(` ${startClock.period}`, '')} – ${endClock.text}`
        : `${startClock.text} – ${endClock.text}`;
    return {
        dayIndex: start.dayIndex,
        day: DAY_NAMES[start.dayIndex],
        dayShort: DAY_SHORT[start.dayIndex],
        time,
    };
}

/**
 * Weekly class clock for display.
 * Students see their own timezone first. Staff see Pakistan (academy) time first.
 * `secondary` is null when the viewer is already in the class timezone.
 */
export function describeScheduleClock(slot, options = {}) {
    if (!slot || slot.dayOfWeek == null || slot.dayOfWeek === '') return null;
    const start = parseHm(slot.startTime);
    const end = parseHm(slot.endTime);
    if (!start || !end) return null;

    try {
        const sourceZone = canonicalizeScheduleTimezone(slot.timezone || DEFAULT_ACADEMY_TIMEZONE);
        const viewerZone = canonicalizeScheduleTimezone(options.viewerTimeZone || readViewerTimeZone());
        const now = options.now instanceof Date ? options.now : new Date();
        const audience = options.audience === 'staff' ? 'staff' : 'student';
        const startMin = start.hour * 60 + start.minute;
        const endMin = end.hour * 60 + end.minute;
        const date = upcomingWallDate(Number(slot.dayOfWeek), startMin, endMin, sourceZone, now);
        const startAt = wallTimeInZoneToDate(date.year, date.month, date.day, start.hour, start.minute, sourceZone);
        const endDate = endMin <= startMin ? addDaysYmd(date.year, date.month, date.day, 1) : date;
        const endAt = wallTimeInZoneToDate(endDate.year, endDate.month, endDate.day, end.hour, end.minute, sourceZone);

        const academy = formatRange(startAt, endAt, sourceZone);
        const local = formatRange(startAt, endAt, viewerZone);
        const sameZone = sourceZone === viewerZone;
        const tag = academyTag(sourceZone);
        const city = zoneCity(viewerZone);
        const dayShifted = academy.dayIndex !== local.dayIndex;

        if (audience === 'staff' || sameZone) {
            return {
                sameZone,
                dayNote: null,
                primary: {
                    day: academy.day,
                    dayShort: academy.dayShort,
                    time: academy.time,
                    tag,
                },
                secondary: sameZone
                    ? null
                    : dayShifted
                      ? `Your time: ${local.day}, ${local.time} (${city})`
                      : `Your time: ${local.time} (${city})`,
            };
        }

        const sourceCity = tag === 'Pakistan time' ? 'Pakistan' : zoneCity(sourceZone);
        return {
            sameZone: false,
            dayNote: dayShifted ? `${sourceCity}: ${academy.dayShort}` : null,
            primary: {
                day: local.day,
                dayShort: local.dayShort,
                time: local.time,
                tag: `Your time (${city})`,
            },
            secondary: dayShifted ? `${tag}: ${academy.day}, ${academy.time}` : `${tag}: ${academy.time}`,
        };
    } catch {
        return null;
    }
}
