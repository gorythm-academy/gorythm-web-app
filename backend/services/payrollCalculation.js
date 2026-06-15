const TeacherAttendance = require('../models/TeacherAttendance');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const PayrollRun = require('../models/PayrollRun');
const { buildMonthCalendar } = require('./teacherAttendanceCalendar');

/** True when today is after the last calendar day of monthKey (local time). */
function isMonthEnded(monthKey) {
    const key = normalizeMonthKey(monthKey);
    const [y, m] = String(key).split('-').map(Number);
    if (!y || !m) return false;
    const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
    return new Date() > endOfMonth;
}

function assertMonthEndedForApproval(monthKey) {
    if (!isMonthEnded(monthKey)) {
        const err = new Error(
            'Monthly attendance can only be approved after the calendar month has ended. Approve daily submissions during the month, then approve the month from the 1st of the following month.'
        );
        err.status = 400;
        throw err;
    }
}

/** Normalize `<input type="month">` or manual entry to YYYY-MM */
function normalizeMonthKey(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{1}$/.test(s)) {
        const [y, m] = s.split('-');
        return `${y}-${m.padStart(2, '0')}`;
    }
    return s;
}

async function getTeacherAttendanceForPayroll(teacherId, monthKey) {
    const key = normalizeMonthKey(monthKey);
    const approved = await TeacherAttendanceRequest.findOne({
        teacher: teacherId,
        monthKey: key,
        status: 'approved',
    });
    if (approved) {
        let workingDays = approved.expectedWorkingDays;
        if (!workingDays) {
            const cal = await buildMonthCalendar(key);
            workingDays = cal.expectedWorkingDays;
        }
        return {
            presentDays: approved.presentDays ?? 0,
            lateDays: approved.lateDays ?? 0,
            leaveDays: approved.leaveDays ?? 0,
            absentDays: approved.absentDays ?? 0,
            holidayDays: approved.holidayDays ?? 0,
            weekendDays: approved.weekendDays ?? 0,
            reportAbsentDays: approved.reportAbsentDays ?? 0,
            notes: approved.notes || '',
            workingDays: workingDays || 0,
            source: 'approved_request',
        };
    }

    const manual = await TeacherAttendance.findOne({ teacher: teacherId, monthKey: key });
    if (manual) {
        let workingDays = manual.expectedWorkingDays;
        if (!workingDays) {
            const cal = await buildMonthCalendar(key);
            workingDays = cal.expectedWorkingDays;
        }
        return {
            presentDays: manual.presentDays ?? 0,
            leaveDays: manual.leaveDays ?? 0,
            absentDays: manual.absentDays ?? 0,
            lateDays: manual.lateDays ?? 0,
            holidayDays: manual.holidayDays ?? 0,
            weekendDays: manual.weekendDays ?? 0,
            reportAbsentDays: manual.reportAbsentDays ?? 0,
            notes: manual.notes || '',
            workingDays: workingDays || 0,
            source: 'manual',
        };
    }

    return { presentDays: 0, leaveDays: 0, absentDays: 0, notes: '', source: 'none' };
}

/**
 * Salary = monthlySalary − (absent days × per-day rate).
 * Leave, holiday, and weekend are report-only — no salary deduction.
 */
function calculatePayrollAmounts({
    monthlySalary,
    workingDays,
    presentDays,
    leaveDays,
    absentDays = 0,
    holidayDays = 0,
    weekendDays = 0,
    reportAbsentDays,
}) {
    const wd = Math.max(1, Number(workingDays) || 26);
    const salary = Math.max(0, Number(monthlySalary) || 0);
    const present = Math.max(0, Number(presentDays) || 0);
    const leave = Math.max(0, Number(leaveDays) || 0);
    const absent = Math.max(0, Number(absentDays) || 0);
    const holiday = Math.max(0, Number(holidayDays) || 0);
    const weekend = Math.max(0, Number(weekendDays) || 0);
    const reportAbsent =
        reportAbsentDays != null ? Math.max(0, Number(reportAbsentDays)) : absent + holiday + weekend;
    const deductionDays = absent;
    const perDay = salary / wd;
    const deduction = Math.round(deductionDays * perDay * 100) / 100;
    const finalSalary = Math.round(Math.max(0, salary - deduction) * 100) / 100;

    return {
        workingDays: wd,
        monthlySalary: salary,
        presentDays: present,
        leaveDays: leave,
        absentDays: absent,
        holidayDays: holiday,
        weekendDays: weekend,
        reportAbsentDays: reportAbsent,
        perDay: Math.round(perDay * 100) / 100,
        deductionDays,
        deduction,
        finalSalary,
    };
}

async function buildPayrollRun(teacherId, monthKey, generatedBy) {
    const key = normalizeMonthKey(monthKey);
    const profile = await TeacherSalaryProfile.findOne({ teacher: teacherId });
    if (!profile) {
        const err = new Error('Teacher salary profile not found');
        err.status = 400;
        throw err;
    }

    const attendance = await getTeacherAttendanceForPayroll(teacherId, key);
    if (attendance.source === 'none') {
        const err = new Error(
            'No approved monthly attendance for this teacher and month. Approve teacher attendance in LMS admin before generating payroll, or enter manual attendance.'
        );
        err.status = 400;
        throw err;
    }
    let workingDays = attendance.workingDays;
    if (!workingDays) {
        const cal = await buildMonthCalendar(key);
        workingDays = cal.expectedWorkingDays;
    }
    if (!workingDays) workingDays = profile.workingDays;

    const amounts = calculatePayrollAmounts({
        monthlySalary: profile.monthlySalary,
        workingDays,
        presentDays: attendance.presentDays,
        leaveDays: attendance.leaveDays,
        absentDays: attendance.absentDays,
        holidayDays: attendance.holidayDays,
        weekendDays: attendance.weekendDays,
        reportAbsentDays: attendance.reportAbsentDays,
    });

    return {
        monthKey: key,
        profile,
        attendance,
        amounts,
        generatedBy,
    };
}

async function persistPayrollRun(teacherId, monthKey, generatedBy, options = {}) {
    const built = await buildPayrollRun(teacherId, monthKey, generatedBy);
    const { amounts, attendance, monthKey: key } = built;
    const payroll = await PayrollRun.findOneAndUpdate(
        { teacher: teacherId, monthKey: key },
        {
            monthlySalary: amounts.monthlySalary,
            workingDays: amounts.workingDays,
            presentDays: amounts.presentDays,
            lateDays: attendance.lateDays ?? 0,
            leaveDays: amounts.leaveDays,
            absentDays: amounts.absentDays,
            deductionDays: amounts.deductionDays,
            deduction: amounts.deduction,
            finalSalary: amounts.finalSalary,
            attendanceSource: attendance.source,
            generatedBy,
            status: options.status || 'pending_review',
            autoGenerated: options.autoGenerated ?? false,
            staleReason: null,
            paidAt: null,
            paidBy: null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )
        .populate('teacher', 'name email')
        .populate('generatedBy', 'name email');

    await TeacherAttendanceRequest.updateOne(
        { teacher: teacherId, monthKey: key },
        { $set: { payrollMissingReason: null } }
    );

    return { payroll, calculation: { ...amounts, attendanceSource: attendance.source } };
}

async function autoGeneratePayrollForApprovedMonth(teacherId, monthKey, generatedBy) {
    return persistPayrollRun(teacherId, monthKey, generatedBy, {
        status: 'pending_review',
        autoGenerated: true,
    });
}

async function markPayrollStale(teacherId, monthKey, reason) {
    const key = normalizeMonthKey(monthKey);
    await PayrollRun.updateOne(
        {
            teacher: teacherId,
            monthKey: key,
            status: { $in: ['pending_review', 'stale'] },
        },
        {
            $set: {
                status: 'stale',
                staleReason:
                    reason ||
                    'Attendance changed after payroll was generated. Admin must re-approve the month.',
            },
        }
    );
}

module.exports = {
    normalizeMonthKey,
    isMonthEnded,
    assertMonthEndedForApproval,
    getTeacherAttendanceForPayroll,
    calculatePayrollAmounts,
    buildPayrollRun,
    persistPayrollRun,
    autoGeneratePayrollForApprovedMonth,
    markPayrollStale,
};
