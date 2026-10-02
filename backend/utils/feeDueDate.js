const ACADEMY_FEE_TZ = 'Asia/Karachi';

function pad2(value) {
    return String(value).padStart(2, '0');
}

function pktYmd(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!value || Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ACADEMY_FEE_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
    const y = pick('year');
    const m = pick('month');
    const d = pick('day');
    if (!y || !m || !d) return null;
    return { y, m, d };
}

function parseDueDateInput(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        const [year, month, day] = value.trim().split('-').map(Number);
        const local = new Date(`${year}-${pad2(month)}-${pad2(day)}T12:00:00+05:00`);
        if (Number.isNaN(local.getTime())) {
            const err = new Error('A valid due date is required');
            err.status = 400;
            throw err;
        }
        return local;
    }
    const ymd = pktYmd(value);
    if (!ymd) {
        const err = new Error('A valid due date is required');
        err.status = 400;
        throw err;
    }
    return new Date(`${ymd.y}-${pad2(ymd.m)}-${pad2(ymd.d)}T12:00:00+05:00`);
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function academyDayFromDate(value) {
    const ymd = pktYmd(value);
    return ymd ? ymd.d : null;
}

function dateFromAcademyDay(year, month, academyDay) {
    const day = Math.min(Math.max(1, Number(academyDay) || 1), daysInMonth(year, month));
    return parseDueDateInput(`${year}-${pad2(month)}-${pad2(day)}`);
}

function addMonthsKeepingDay(fromDate, academyDay) {
    const ymd = pktYmd(fromDate);
    if (!ymd) return null;
    let year = ymd.y;
    let month = ymd.m + 1;
    if (month > 12) {
        year += 1;
        month = 1;
    }
    return dateFromAcademyDay(year, month, academyDay || ymd.d);
}

function firstDueDateFromJoin(joinDate, academyDay) {
    const ymd = pktYmd(joinDate || new Date());
    if (!ymd) return null;
    const day = Math.max(1, Math.min(31, Number(academyDay) || ymd.d));
    if (ymd.d > day) {
        return addMonthsKeepingDay(dateFromAcademyDay(ymd.y, ymd.m, day), day);
    }
    return dateFromAcademyDay(ymd.y, ymd.m, day);
}

function nextDueDateAfterPay(fromDate, academyDay) {
    return addMonthsKeepingDay(fromDate || new Date(), academyDay || academyDayFromDate(fromDate) || 1);
}

function defaultFeeDueDate(from = new Date()) {
    const ymd = pktYmd(from) || pktYmd(new Date());
    return dateFromAcademyDay(ymd.y, ymd.m, ymd.d);
}

function comparePktYmd(a, b) {
    if (!a || !b) return 0;
    if (a.y !== b.y) return a.y - b.y;
    if (a.m !== b.m) return a.m - b.m;
    return a.d - b.d;
}

function isFeeDueDatePast(dueDate, now = new Date()) {
    const due = pktYmd(dueDate);
    const today = pktYmd(now);
    if (!due || !today) return false;
    return comparePktYmd(today, due) > 0;
}

function isFeeDueDateInFuture(dueDate, now = new Date()) {
    const due = pktYmd(dueDate);
    const today = pktYmd(now);
    if (!due || !today) return false;
    return comparePktYmd(due, today) > 0;
}

function parsedTotalFeeCount(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.floor(n);
}

function enrollmentHasFeeCount(enrollment) {
    return parsedTotalFeeCount(enrollment?.totalFeeCount) != null;
}

function enrollmentFeePlanTotal(enrollment) {
    return parsedTotalFeeCount(enrollment?.totalFeeCount)
        ?? parsedTotalFeeCount(enrollment?.course?.totalFeeCount);
}

function enrollmentAllFeesPaid(enrollment) {
    const total = enrollmentFeePlanTotal(enrollment);
    if (total == null) {
        return String(enrollment?.status || '').toLowerCase() === 'completed';
    }
    return Number(enrollment?.paidInstallmentCount || 0) >= total;
}

const EMPTY_PLAN_MAX_MONTHS = 4;

function maxPayableMonths(enrollment) {
    if (enrollmentAllFeesPaid(enrollment) || enrollmentFeeIsFree(enrollment)) return 0;
    const total = enrollmentFeePlanTotal(enrollment);
    const paid = Number(enrollment?.paidInstallmentCount || 0);
    if (total == null) return EMPTY_PLAN_MAX_MONTHS;
    return Math.max(0, total - paid);
}

function parseInstallmentMonths(value, maxAllowed) {
    const max = Math.max(0, Math.floor(Number(maxAllowed)));
    if (max < 1) return 0;
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, max);
}

function dueDateAfterPayingMonths(fromDate, academyDay, months) {
    let next = fromDate || new Date();
    const count = Math.max(1, Math.floor(Number(months) || 1));
    const day = academyDay || academyDayFromDate(next) || 1;
    for (let i = 0; i < count; i += 1) {
        next = nextDueDateAfterPay(next, day);
    }
    return next;
}

function enrollmentFeeIsFree(enrollment) {
    const amount = enrollment?.course?.price ?? enrollment?.feeAmount ?? enrollment?.amount;
    if (amount == null || amount === '') return false;
    const n = Number(amount);
    return Number.isFinite(n) && n <= 0;
}

function isDueDateLocked(enrollment) {
    const status = String(enrollment?.paymentStatus || '');
    return status === 'cancelled' || status === 'refunded';
}

function assertLaterDueDate(previousDueDate, nextDueDate) {
    const prev = pktYmd(previousDueDate);
    const next = pktYmd(nextDueDate);
    if (!next) {
        const err = new Error('A valid due date is required');
        err.status = 400;
        throw err;
    }
    if (prev && comparePktYmd(next, prev) <= 0) {
        const err = new Error('Extended due date must be after the current due date');
        err.status = 400;
        throw err;
    }
    return parseDueDateInput(nextDueDate);
}

function pushDueDateExtension(doc, nextDueDate, actorId, note = '') {
    if (!doc) return;
    if (!Array.isArray(doc.dueDateExtensions)) doc.dueDateExtensions = [];
    const previous = doc.feeDueDate || doc.dueDate || null;
    doc.dueDateExtensions.push({
        previousDueDate: previous,
        newDueDate: nextDueDate,
        by: actorId || null,
        at: new Date(),
        note: String(note || '').trim(),
    });
}

function applyEnrollmentDueDateInput(enrollment, dueDateInput, actorId, { forceExtend = false } = {}) {
    if (!enrollment) {
        const err = new Error('Enrollment not found');
        err.status = 404;
        throw err;
    }
    if (isDueDateLocked(enrollment)) {
        const err = new Error('Due date cannot be changed on cancelled or refunded enrollments');
        err.status = 400;
        throw err;
    }
    if (dueDateInput === null || dueDateInput === undefined || dueDateInput === '') {
        return { changed: false, extended: false };
    }
    const next = parseDueDateInput(dueDateInput);
    const prev = pktYmd(enrollment.feeDueDate);
    const nextYmd = pktYmd(next);
    if (prev && nextYmd && comparePktYmd(prev, nextYmd) === 0) {
        return { changed: false, extended: false };
    }
    if (forceExtend) {
        assertLaterDueDate(enrollment.feeDueDate, next);
        pushDueDateExtension(enrollment, next, actorId, 'Extended from payment');
    }
    enrollment.feeDueDate = next;
    enrollment.feeDueDay = academyDayFromDate(next);
    enrollment.feeDueDateManuallySet = true;
    return { changed: true, extended: Boolean(forceExtend) };
}

module.exports = {
    ACADEMY_FEE_TZ,
    pktYmd,
    parseDueDateInput,
    academyDayFromDate,
    dateFromAcademyDay,
    addMonthsKeepingDay,
    firstDueDateFromJoin,
    nextDueDateAfterPay,
    defaultFeeDueDate,
    isFeeDueDatePast,
    isFeeDueDateInFuture,
    parsedTotalFeeCount,
    enrollmentHasFeeCount,
    enrollmentFeePlanTotal,
    enrollmentAllFeesPaid,
    EMPTY_PLAN_MAX_MONTHS,
    maxPayableMonths,
    parseInstallmentMonths,
    dueDateAfterPayingMonths,
    enrollmentFeeIsFree,
    isDueDateLocked,
    assertLaterDueDate,
    pushDueDateExtension,
    applyEnrollmentDueDateInput,
};
