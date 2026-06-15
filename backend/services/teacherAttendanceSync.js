const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const { normalizeMonthKey, markPayrollStale } = require('./payrollCalculation');
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
    syncMonthlyRequestFromDaily,
};
