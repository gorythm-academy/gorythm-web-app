const express = require('express');
const router = express.Router();

const ClassSchedule = require('../../models/ClassSchedule');
const Enrollment = require('../../models/Enrollment');
const Course = require('../../models/Course');
const User = require('../../models/User');
const { canonicalizeScheduleTimezone } = require('../../utils/scheduleTimezone');
const { getAcademyTimezone } = require('../../services/academyTimezone');
const { getTeachersForCourse } = require('../../services/courseTeachers');
const { activeUserFilter } = require('../../utils/userQuery');
const { activeCourseFilter } = require('../../utils/courseQuery');
const {
    validateScheduleTimes,
    resolveScheduleTeacher,
    findDuplicateSchedule,
    findTeacherScheduleConflict,
    teacherScheduleConflictMessage,
} = require('../../utils/scheduleValidation');

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ——— Class schedules ———
router.get('/schedules', async (req, res) => {
    try {
        const filter = {};
        if (req.query.courseId) filter.course = req.query.courseId;
        if (req.query.teacherId) filter.teacher = req.query.teacherId;
        const schedules = await ClassSchedule.find(filter)
            .populate('course', 'title')
            .populate('teacher', 'name email')
            .sort({ dayOfWeek: 1, startTime: 1 });
        const academyTimezone = await getAcademyTimezone();
        const normalizedSchedules = schedules.map((doc) => {
            const plain = doc.toObject ? doc.toObject() : doc;
            return {
                ...plain,
                timezone: canonicalizeScheduleTimezone(plain.timezone, academyTimezone),
            };
        });
        let teachers;
        if (req.query.courseId) {
            teachers = await getTeachersForCourse(req.query.courseId);
        } else {
            teachers = await User.find({ role: 'teacher', ...activeUserFilter() })
                .select('name email')
                .sort({ name: 1 });
        }
        res.json({ success: true, schedules: normalizedSchedules, academyTimezone, dayLabels: DAY_LABELS, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedules' });
    }
});

router.post('/schedules', async (req, res) => {
    try {
        const { courseId, teacherId, dayOfWeek, startTime, endTime, timezone, roomOrLink } = req.body;
        if (!courseId) {
            return res.status(400).json({ success: false, error: 'Course is required' });
        }
        const timeError = validateScheduleTimes(startTime, endTime);
        if (timeError) {
            return res.status(400).json({ success: false, error: timeError });
        }
        const course = await Course.findOne({ _id: courseId, ...activeCourseFilter() });
        if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
        const resolved = await resolveScheduleTeacher(courseId, teacherId);
        if (resolved.error) {
            return res.status(400).json({ success: false, error: resolved.error });
        }
        const duplicate = await findDuplicateSchedule({ courseId, dayOfWeek, startTime });
        if (duplicate) {
            return res.status(409).json({
                success: false,
                error: 'A schedule already exists for this course, day, and start time.',
            });
        }
        const teacherConflict = await findTeacherScheduleConflict({
            teacherId: resolved.teacherId,
            dayOfWeek,
            startTime,
            endTime,
        });
        if (teacherConflict) {
            return res.status(409).json({
                success: false,
                error: teacherScheduleConflictMessage(teacherConflict),
            });
        }
        const academyTimezone = await getAcademyTimezone();
        const schedule = await ClassSchedule.create({
            course: courseId,
            teacher: resolved.teacherId,
            dayOfWeek,
            startTime,
            endTime,
            timezone: canonicalizeScheduleTimezone(timezone, academyTimezone),
            roomOrLink: roomOrLink || '',
        });
        const populated = await ClassSchedule.findById(schedule._id)
            .populate('course', 'title')
            .populate('teacher', 'name email');
        res.status(201).json({ success: true, schedule: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create schedule' });
    }
});

router.patch('/schedules/:id', async (req, res) => {
    try {
        const { courseId, teacherId, dayOfWeek, startTime, endTime, timezone, roomOrLink } = req.body;
        const schedule = await ClassSchedule.findById(req.params.id);
        if (!schedule) return res.status(404).json({ success: false, error: 'Schedule not found' });

        const nextStart = startTime || schedule.startTime;
        const nextEnd = endTime || schedule.endTime;
        const timeError = validateScheduleTimes(nextStart, nextEnd);
        if (timeError) {
            return res.status(400).json({ success: false, error: timeError });
        }

        const targetCourseId = courseId || schedule.course;
        if (courseId) {
            const course = await Course.findOne({ _id: courseId, ...activeCourseFilter() });
            if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
            schedule.course = courseId;
        }
        if (courseId || teacherId !== undefined) {
            const resolved = await resolveScheduleTeacher(
                targetCourseId,
                teacherId !== undefined && teacherId !== '' ? teacherId : null
            );
            if (resolved.error) {
                return res.status(400).json({ success: false, error: resolved.error });
            }
            schedule.teacher = resolved.teacherId;
        }
        if (dayOfWeek !== undefined) schedule.dayOfWeek = dayOfWeek;
        if (startTime) schedule.startTime = startTime;
        if (endTime) schedule.endTime = endTime;
        if (timezone !== undefined) {
            const academyTimezone = await getAcademyTimezone();
            schedule.timezone = canonicalizeScheduleTimezone(timezone, academyTimezone);
        }
        if (roomOrLink !== undefined) schedule.roomOrLink = roomOrLink || '';

        const duplicate = await findDuplicateSchedule({
            courseId: schedule.course,
            dayOfWeek: schedule.dayOfWeek,
            startTime: schedule.startTime,
            excludeId: schedule._id,
        });
        if (duplicate) {
            return res.status(409).json({
                success: false,
                error: 'A schedule already exists for this course, day, and start time.',
            });
        }

        const teacherConflict = await findTeacherScheduleConflict({
            teacherId: schedule.teacher,
            dayOfWeek: schedule.dayOfWeek,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            excludeId: schedule._id,
        });
        if (teacherConflict) {
            return res.status(409).json({
                success: false,
                error: teacherScheduleConflictMessage(teacherConflict),
            });
        }

        await schedule.save();
        const populated = await ClassSchedule.findById(schedule._id)
            .populate('course', 'title')
            .populate('teacher', 'name email');
        res.json({ success: true, schedule: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update schedule' });
    }
});

router.delete('/schedules/:id', async (req, res) => {
    try {
        const schedule = await ClassSchedule.findByIdAndDelete(req.params.id);
        if (!schedule) {
            return res.status(404).json({ success: false, error: 'Schedule not found' });
        }
        await Enrollment.updateMany(
            { assignedSchedule: schedule._id },
            { $set: { assignedSchedule: null } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete schedule' });
    }
});

router.post('/schedules/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No schedule IDs provided' });
        }

        await Enrollment.updateMany(
            { assignedSchedule: { $in: ids } },
            { $set: { assignedSchedule: null } }
        );
        const result = await ClassSchedule.deleteMany({ _id: { $in: ids } });

        res.json({
            success: true,
            message: `${result.deletedCount} schedule(s) removed`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to bulk delete schedules' });
    }
});

module.exports = router;
