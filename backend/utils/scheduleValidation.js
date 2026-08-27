const User = require('../models/User');
const ClassSchedule = require('../models/ClassSchedule');
const { getTeachersForCourse } = require('../services/courseTeachers');
const { activeUserFilter } = require('./userQuery');

function timeToMinutes(timeStr) {
    const parts = String(timeStr || '').trim().split(':');
    if (parts.length < 2) return NaN;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
}

function validateScheduleTimes(startTime, endTime) {
    if (!startTime || !endTime) {
        return 'Start and end time are required';
    }
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return 'Invalid time format';
    }
    if (end <= start) {
        return 'End time must be after start time';
    }
    return null;
}

async function resolveScheduleTeacher(courseId, teacherId) {
    if (teacherId) {
        const teacher = await User.findOne({
            _id: teacherId,
            role: 'teacher',
            ...activeUserFilter(),
        });
        if (!teacher) {
            return { error: 'Teacher not found or inactive' };
        }
        const allowed = await getTeachersForCourse(courseId);
        const allowedIds = new Set(allowed.map((t) => String(t._id)));
        if (!allowedIds.has(String(teacherId))) {
            return { error: 'Teacher is not assigned to this course.' };
        }
        return { teacherId: teacher._id };
    }

    const allowed = await getTeachersForCourse(courseId);
    if (!allowed.length) {
        return {
            error:
                'Assign at least one teacher to this course before saving a schedule, or pick a teacher.',
        };
    }
    return { teacherId: allowed[0]._id };
}

async function findDuplicateSchedule({ courseId, dayOfWeek, startTime, excludeId }) {
    if (!courseId || dayOfWeek === undefined || !startTime) return null;
    const filter = { course: courseId, dayOfWeek, startTime };
    if (excludeId) filter._id = { $ne: excludeId };
    return ClassSchedule.findOne(filter).select('_id');
}

/**
 * Same teacher cannot have overlapping time ranges on the same weekday
 * (any course). Different teachers at the same clock time are allowed.
 */
async function findTeacherScheduleConflict({
    teacherId,
    dayOfWeek,
    startTime,
    endTime,
    excludeId,
}) {
    if (!teacherId || dayOfWeek === undefined || !startTime || !endTime) return null;
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

    const filter = { teacher: teacherId, dayOfWeek };
    if (excludeId) filter._id = { $ne: excludeId };

    const existing = await ClassSchedule.find(filter)
        .populate('course', 'title')
        .select('startTime endTime course');

    for (const slot of existing) {
        const slotStart = timeToMinutes(slot.startTime);
        const slotEnd = timeToMinutes(slot.endTime);
        if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) continue;
        if (start < slotEnd && slotStart < end) {
            return slot;
        }
    }
    return null;
}

function teacherScheduleConflictMessage(conflictSlot) {
    const title = conflictSlot?.course?.title || 'another course';
    return `This teacher already has "${title}" at this time.`;
}

module.exports = {
    validateScheduleTimes,
    resolveScheduleTeacher,
    findDuplicateSchedule,
    findTeacherScheduleConflict,
    teacherScheduleConflictMessage,
};
