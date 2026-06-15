export function formatWeekdayName(dateStr) {
  const d = parseLocalDate(String(dateStr || '').slice(0, 10));
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'long' });
}

/** Academy working week: Monday through Saturday (Sunday excluded). */

/** Academy weekend: Sunday only — no attendance marking. */
export function isAcademyWeekendDate(dateStr) {
  const d = parseLocalDate(dateStr);
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getDay() === 0;
}

export function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(dateStr) {
  const match = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Monday and Saturday (YYYY-MM-DD) for the academy week containing anchorDate. */
export function getAcademyWeekBounds(anchorDate) {
  const anchor =
    typeof anchorDate === 'string' ? parseLocalDate(anchorDate) : new Date(anchorDate);
  if (!anchor || Number.isNaN(anchor.getTime())) {
    const today = new Date();
    return getAcademyWeekBounds(toLocalDateStr(today));
  }
  const dow = anchor.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - daysFromMonday);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  return { monday: toLocalDateStr(monday), saturday: toLocalDateStr(saturday) };
}

export function shiftAcademyWeek(anchorDate, deltaWeeks) {
  const anchor = parseLocalDate(anchorDate) || new Date();
  anchor.setDate(anchor.getDate() + deltaWeeks * 7);
  return getAcademyWeekBounds(anchor).monday;
}

export function formatAcademyWeekLabel(monday, saturday) {
  const mon = parseLocalDate(monday);
  const sat = parseLocalDate(saturday);
  if (!mon || !sat) return '';
  const fmt = (d, withYear = false) =>
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(mon)} – ${fmt(sat, true)}`;
}

export function currentAcademyWeekMonday() {
  return getAcademyWeekBounds(toLocalDateStr(new Date())).monday;
}

export function todayLocalDateStr() {
  return toLocalDateStr(new Date());
}

export function isFutureLocalDate(dateStr) {
  const key = String(dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return key > todayLocalDateStr();
}

function academyDateRange(pastMonths = 18, futureMonths = 3) {
  const today = new Date();
  return {
    start: new Date(today.getFullYear(), today.getMonth() - pastMonths, 1),
    end: new Date(today.getFullYear(), today.getMonth() + futureMonths, 1),
  };
}

/** Years available in the attendance week picker. */
export function getAcademyYearOptions(pastMonths = 18, futureMonths = 3) {
  const { start, end } = academyDateRange(pastMonths, futureMonths);
  const options = [];
  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
    options.push({ value: String(year), label: String(year) });
  }
  return options;
}

/** Months (YYYY-MM) within a year that fall in the allowed attendance range. */
export function getAcademyMonthsInYear(year, pastMonths = 18, futureMonths = 3) {
  const yearNum = Number(year);
  if (!yearNum) return [];
  const { start, end } = academyDateRange(pastMonths, futureMonths);
  const options = [];
  for (let month = 1; month <= 12; month += 1) {
    const date = new Date(yearNum, month - 1, 1);
    if (date < start || date > end) continue;
    options.push({
      value: `${yearNum}-${String(month).padStart(2, '0')}`,
      label: date.toLocaleDateString(undefined, { month: 'long' }),
    });
  }
  return options;
}

/** Academy weeks whose Monday falls in the given month (Mon–Sat). */
export function getAcademyWeeksInMonth(monthKey) {
  const match = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const weeks = [];
  const cursor = new Date(firstDay);
  while (cursor.getDay() !== 1 && cursor <= lastDay) {
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cursor <= lastDay) {
    const { monday, saturday } = getAcademyWeekBounds(toLocalDateStr(cursor));
    weeks.push({
      monday,
      saturday,
      label: formatAcademyWeekLabel(monday, saturday),
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}
