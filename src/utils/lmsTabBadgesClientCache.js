import { createTtlCache } from './adminListCache';

export const lmsTabBadgesClientCache = createTtlCache(45_000);

export function badgesFromLmsTabBadgesResponse(res) {
    const attendance = Number(res.attendanceCount) || 0;
    const payroll = Number(res.payrollCount) || 0;
    return {
        lmsAttendance: attendance + payroll,
        lmsAttendanceBreakdown: { attendance, payroll },
    };
}
