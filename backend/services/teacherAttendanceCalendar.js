const InstituteHoliday = require('../models/InstituteHoliday');

/** JS getDay(): 0=Sun … 6=Sat. Default weekend: Saturday + Sunday. */
const DEFAULT_WEEKEND_DAYS = [0, 6];

function parseWeekendDays() {
    const raw = process.env.ACADEMY_WEEKEND_DAYS;
    if (!raw) return DEFAULT_WEEKEND_DAYS;
    return raw
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function monthBounds(monthKey) {
    const [y, m] = String(monthKey).split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end };
}

function isoDateKey(d) {
    const x = startOfDay(d);
    return x.toISOString().slice(0, 10);
}

/**
 * @returns {'working'|'weekend'|'holiday'}
 */
function classifyDay(date, holidaySet, weekendDays) {
    const key = isoDateKey(date);
    if (holidaySet.has(key)) return 'holiday';
    const dow = startOfDay(date).getDay();
    if (weekendDays.includes(dow)) return 'weekend';
    return 'working';
}

async function loadHolidaySetForRange(start, end) {
    const holidays = await InstituteHoliday.find({
        date: { $gte: startOfDay(start), $lte: end },
    });
    const set = new Set();
    holidays.forEach((h) => set.add(isoDateKey(h.date)));
    return set;
}

async function buildMonthCalendar(monthKey) {
    const { start, end } = monthBounds(monthKey);
    const holidaySet = await loadHolidaySetForRange(start, end);
    const weekendDays = parseWeekendDays();
    const days = [];
    const cursor = startOfDay(start);
    const endDay = startOfDay(end);
    while (cursor <= endDay) {
        const dayType = classifyDay(cursor, holidaySet, weekendDays);
        days.push({
            date: isoDateKey(cursor),
            dayType,
            isWorking: dayType === 'working',
            label: dayType === 'weekend' ? 'Weekend' : dayType === 'holiday' ? 'Official holiday' : 'Working day',
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    const expectedWorkingDays = days.filter((d) => d.isWorking).length;
    return { monthKey, days, expectedWorkingDays, weekendDays };
}

/**
 * Aggregate teacher daily marks. Holiday/weekend count for reports but not salary deduction.
 */
function aggregateWorkingDaysOnly(dailyDocs, calendarDays) {
    const expectedWorkingDays = calendarDays.filter((d) => d.isWorking).length;
    const stats = {
        presentDays: 0,
        leaveDays: 0,
        absentDays: 0,
        lateDays: 0,
        holidayDays: 0,
        weekendDays: 0,
        reportAbsentDays: 0,
        daysMarked: 0,
        expectedWorkingDays,
        markedOnNonWorking: 0,
    };
    for (const doc of dailyDocs) {
        stats.daysMarked += 1;
        const st = doc.status;
        if (st === 'present') stats.presentDays += 1;
        else if (st === 'late') {
            stats.lateDays += 1;
            stats.presentDays += 1;
        } else if (st === 'leave') stats.leaveDays += 1;
        else if (st === 'absent') {
            stats.absentDays += 1;
            stats.reportAbsentDays += 1;
        } else if (st === 'holiday') {
            stats.holidayDays += 1;
            stats.reportAbsentDays += 1;
        } else if (st === 'weekend') {
            stats.weekendDays += 1;
            stats.reportAbsentDays += 1;
        }
    }
    return stats;
}

function aggregateTeacherMonthlyFromDays(dailyDocs, calendarByMonth) {
    const map = new Map();
    for (const doc of dailyDocs) {
        const d = new Date(doc.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!map.has(monthKey)) map.set(monthKey, []);
        map.get(monthKey).push(doc);
    }
    const results = [];
    for (const [monthKey, docs] of map) {
        const cal = calendarByMonth.get(monthKey);
        if (cal) {
            results.push({ monthKey, ...aggregateWorkingDaysOnly(docs, cal.days) });
        } else {
            results.push({
                monthKey,
                ...aggregateWorkingDaysOnly(
                    docs,
                    docs.map((x) => ({
                        date: isoDateKey(x.date),
                        isWorking: true,
                        dayType: 'working',
                    }))
                ),
            });
        }
    }
    return results.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

module.exports = {
    startOfDay,
    isoDateKey,
    monthBounds,
    classifyDay,
    buildMonthCalendar,
    aggregateWorkingDaysOnly,
    aggregateTeacherMonthlyFromDays,
    loadHolidaySetForRange,
    parseWeekendDays,
};
