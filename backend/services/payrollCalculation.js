const TeacherAttendance = require('../models/TeacherAttendance');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const { buildMonthCalendar } = require('./teacherAttendanceCalendar');

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
        return {
            presentDays: manual.presentDays ?? 0,
            leaveDays: manual.leaveDays ?? 0,
            notes: manual.notes || '',
            source: 'manual',
        };
    }

    return { presentDays: 0, leaveDays: 0, notes: '', source: 'none' };
}

/**
 * Salary = monthlySalary − (deductible days × per-day rate).
 * Deductible = leave + absent only (holiday/weekend are report-only, no deduction).
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
    const deductionDays = leave + absent;
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

module.exports = {
    normalizeMonthKey,
    getTeacherAttendanceForPayroll,
    calculatePayrollAmounts,
    buildPayrollRun,
};
