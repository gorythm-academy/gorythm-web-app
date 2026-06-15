const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const {
    buildMonthCalendar,
    monthBounds,
    isoDateKey,
} = require('./teacherAttendanceCalendar');
const { normalizeMonthKey } = require('./payrollCalculation');

async function getTeacherPayrollAttendanceDetail(teacherId, monthKey) {
    const key = normalizeMonthKey(monthKey);
    const { start, end } = monthBounds(key);
    const calendar = await buildMonthCalendar(key);
    const days = await TeacherSelfAttendanceDay.find({
        teacher: teacherId,
        date: { $gte: start, $lte: end },
    }).sort({ date: 1 });
    const monthlyRequest = await TeacherAttendanceRequest.findOne({
        teacher: teacherId,
        monthKey: key,
    });
    const salaryProfile = await TeacherSalaryProfile.findOne({ teacher: teacherId });

    const marksByDate = {};
    days.forEach((d) => {
        marksByDate[isoDateKey(d.date)] = {
            _id: d._id,
            date: isoDateKey(d.date),
            status: d.status,
            notes: d.notes || '',
            approvalStatus: d.approvalStatus || 'pending',
            submittedAt: d.submittedAt,
        };
    });

    const dailyRows = calendar.days
        .filter((d) => d.dayType !== 'weekend')
        .map((d) => ({
            date: d.date,
            dayType: d.dayType,
            label: d.label,
            mark: marksByDate[d.date] || null,
        }));

    return {
        monthKey: key,
        calendar: {
            expectedWorkingDays: calendar.expectedWorkingDays,
            weekendDays: calendar.days.filter((d) => d.dayType === 'weekend').length,
        },
        monthlyRequest: monthlyRequest
            ? {
                  status: monthlyRequest.status,
                  presentDays: monthlyRequest.presentDays ?? 0,
                  lateDays: monthlyRequest.lateDays ?? 0,
                  leaveDays: monthlyRequest.leaveDays ?? 0,
                  absentDays: monthlyRequest.absentDays ?? 0,
                  holidayDays: monthlyRequest.holidayDays ?? 0,
                  weekendDays: monthlyRequest.weekendDays ?? 0,
                  reviewedAt: monthlyRequest.reviewedAt,
              }
            : null,
        dailyRows,
        salaryProfile: salaryProfile
            ? {
                  monthlySalary: salaryProfile.monthlySalary,
                  workingDays: salaryProfile.workingDays,
              }
            : null,
    };
}

module.exports = { getTeacherPayrollAttendanceDetail };
