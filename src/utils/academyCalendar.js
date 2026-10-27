/** Same school day the server uses: Asia/Karachi. */
export const ACADEMY_TIME_ZONE = 'Asia/Karachi';

export function academyCalendarDay(value) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ACADEMY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatAcademyDate(value) {
  const day = academyCalendarDay(value);
  if (!day) return '';
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

/** The server flag wins. If it is missing, compare Pakistan calendar days. */
export function isAcademyDuePast(dueDate, pastDueFlag) {
  if (typeof pastDueFlag === 'boolean') return pastDueFlag;
  if (!dueDate) return false;
  const due = academyCalendarDay(dueDate);
  const today = academyCalendarDay(new Date());
  return Boolean(due && today && due < today);
}
