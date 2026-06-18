const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const { normalizeMonthKey, markPayrollStale, isMonthEnded } = require('./payrollCalculation');
const {
    monthBounds,
    buildMonthCalendar,
    aggregateWorkingDaysOnly,
    isoDateKey,
} = require('./teacherAttendanceCalendar');

function workingDayDocs(dailyDocs, calendarDays) {
    return dailyDocs.filter((doc) => {
        const key = isoDateKey(doc.date);
        const calDay = calendarDays.find((d) => d.date === key);
        return calDay?.dayType !== 'weekend';
    });
}

function monthKeyFromDate(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    return normalizeMonthKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
}

/** Roll up counts from daily rows that admin has approved only. */
function aggregateFromApprovedDays(dailyDocs, calendarDays) {
    const approved = workingDayDocs(dailyDocs, calendarDays).filter(
        (doc) => doc.approvalStatus === 'approved'
    );
    return aggregateWorkingDaysOnly(approved, calendarDays);
}

/** True when any submitted working day is still pending or rejected. */
function monthNeedsReapproval(dailyDocs, calendarDays) {
    return workingDayDocs(dailyDocs, calendarDays).some(
        (doc) =>
            doc.submittedAt &&
            ['pending', 'rejected'].includes(doc.approvalStatus || 'pending')
    );
}

/** Working days (excludes Sunday/weekend & holidays) with no teacher submission. */
function getUnmarkedWorkingDays(dailyDocs, calendarDays) {
    const submittedDates = new Set(
        dailyDocs.filter((doc) => doc.submittedAt).map((doc) => isoDateKey(doc.date))
    );
    return calendarDays
        .filter((d) => d.dayType === 'working')
        .filter((d) => !submittedDates.has(d.date))
        .map((d) => d.date);
}

function formatUnmarkedWorkingDaysError(unmarkedDates) {
    if (!unmarkedDates?.length) return '';
    const preview = unmarkedDates.slice(0, 5).join(', ');
    const suffix = unmarkedDates.length > 5 ? ` (+${unmarkedDates.length - 5} more)` : '';
    return `Teacher has not marked ${unmarkedDates.length} working day(s). Missing: ${preview}${suffix}. Sundays and official holidays are excluded.`;
}

/** Why a pending monthly rollup cannot be approved yet (null = ready). */
async function computeMonthlyApprovalBlock(teacherId, monthKey) {
    const tid = teacherId?._id || teacherId;
    if (!tid || !monthKey) return null;

    if (!isMonthEnded(monthKey)) {
        return {
            reason:
                'Monthly attendance can only be approved after the calendar month has ended. Approve daily submissions during the month, then approve the month from the 1st of the following month.',
            unmarkedDates: [],
        };
    }

    const { start, end } = monthBounds(monthKey);
    const monthDays = await TeacherSelfAttendanceDay.find({
        teacher: tid,
        date: { $gte: start, $lte: end },
    });
    const calendar = await buildMonthCalendar(monthKey);

    const unmarked = getUnmarkedWorkingDays(monthDays, calendar.days);
    if (unmarked.length > 0) {
        return {
            reason: `Cannot approve month: ${formatUnmarkedWorkingDaysError(unmarked)}`,
            unmarkedDates: unmarked,
        };
    }

    const submitted = workingDayDocs(monthDays, calendar.days).filter((d) => d.submittedAt);
    if (!submitted.length) {
        return {
            reason: 'Cannot approve month: no daily attendance submissions for this month.',
            unmarkedDates: [],
        };
    }
    if (monthNeedsReapproval(monthDays, calendar.days)) {
        return {
            reason: 'Cannot approve month: one or more submitted days are still pending or rejected.',
            unmarkedDates: [],
        };
    }

    return null;
}

/**
 * Keep monthly request in sync with approved daily submissions.
 * Does not reset an already-approved month unless unapproved days exist.
 */
async function syncMonthlyRequestFromDaily(teacherId, dateInput) {
    const monthKey = monthKeyFromDate(dateInput);
    const { start, end } = monthBounds(monthKey);
    const days = await TeacherSelfAttendanceDay.find({
        teacher: teacherId,
        date: { $gte: start, $lte: end },
    });
    const calendar = await buildMonthCalendar(monthKey);
    const agg = aggregateFromApprovedDays(days, calendar.days);
    const existing = await TeacherAttendanceRequest.findOne({ teacher: teacherId, monthKey });

    const counts = {
        presentDays: agg.presentDays ?? 0,
        leaveDays: agg.leaveDays ?? 0,
        absentDays: agg.absentDays ?? 0,
        lateDays: agg.lateDays ?? 0,
        holidayDays: agg.holidayDays ?? 0,
        weekendDays: agg.weekendDays ?? 0,
        reportAbsentDays: agg.reportAbsentDays ?? 0,
        daysMarked: agg.daysMarked ?? 0,
        expectedWorkingDays: agg.expectedWorkingDays ?? calendar.expectedWorkingDays,
    };

    const update = { ...counts };

    if (existing?.status === 'approved') {
        if (monthNeedsReapproval(days, calendar.days)) {
            update.status = 'pending';
            update.reviewedBy = null;
            update.reviewedAt = null;
            update.submittedAt = new Date();
            await markPayrollStale(teacherId, monthKey);
        } else {
            update.status = 'approved';
        }
    } else {
        update.status = 'pending';
        update.reviewedBy = null;
        update.reviewedAt = null;
        update.submittedAt = existing?.submittedAt || new Date();
    }

    return TeacherAttendanceRequest.findOneAndUpdate(
        { teacher: teacherId, monthKey },
        update,
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

module.exports = {
    aggregateFromApprovedDays,
    monthNeedsReapproval,
    getUnmarkedWorkingDays,
    formatUnmarkedWorkingDaysError,
    computeMonthlyApprovalBlock,
    syncMonthlyRequestFromDaily,
};
