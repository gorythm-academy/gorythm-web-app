const Enrollment = require('../models/Enrollment');
const ClassSchedule = require('../models/ClassSchedule');
const { activeEnrollmentFilter } = require('./enrollmentQuery');
const { timeToMinutes } = require('./scheduleValidation');

/**
 * Detect whether a student already uses this timeslot (exact same slot doc)
 * or has another enrollment overlapping on the same weekday.
 */
async function findStudentScheduleConflict(studentId, scheduleId, { exceptEnrollmentId = null } = {}) {
    if (!studentId || !scheduleId) return null;

    const target = await ClassSchedule.findById(scheduleId)
        .populate('course', 'title')
        .select('dayOfWeek startTime endTime course');
    if (!target) return null;

    const targetStart = timeToMinutes(target.startTime);
    const targetEnd = timeToMinutes(target.endTime);
    if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd)) return null;

    const filter = {
        student: studentId,
        assignedSchedule: { $ne: null },
        ...activeEnrollmentFilter(),
    };
    if (exceptEnrollmentId) filter._id = { $ne: exceptEnrollmentId };

    const others = await Enrollment.find(filter)
        .populate({ path: 'assignedSchedule', select: 'dayOfWeek startTime endTime' })
        .populate('course', 'title')
        .lean();

    for (const enr of others) {
        const slot = enr.assignedSchedule;
        if (!slot) continue;

        if (String(slot._id || slot) === String(scheduleId)) {
            return { type: 'exact', enrollment: enr, schedule: target };
        }

        if (slot.dayOfWeek !== target.dayOfWeek) continue;
        const slotStart = timeToMinutes(slot.startTime);
        const slotEnd = timeToMinutes(slot.endTime);
        if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) continue;
        if (targetStart < slotEnd && slotStart < targetEnd) {
            return { type: 'overlap', enrollment: enr, schedule: target, conflictingSlot: slot };
        }
    }
    return null;
}

function studentScheduleConflictMessage(conflict) {
    if (!conflict) return 'Schedule conflict';
    const courseTitle = conflict.enrollment?.course?.title || 'another course';
    if (conflict.type === 'exact') {
        return `This student is already assigned to this timeslot for "${courseTitle}". Choose a different slot.`;
    }
    return `This student already has "${courseTitle}" at this time. Choose a non-overlapping timeslot.`;
}

async function assertStudentScheduleAvailable(studentId, scheduleId, options = {}) {
    if (!scheduleId) return;
    const conflict = await findStudentScheduleConflict(studentId, scheduleId, options);
    if (!conflict) return;
    const err = new Error(studentScheduleConflictMessage(conflict));
    err.status = 400;
    throw err;
}

module.exports = {
    findStudentScheduleConflict,
    studentScheduleConflictMessage,
    assertStudentScheduleAvailable,
};
