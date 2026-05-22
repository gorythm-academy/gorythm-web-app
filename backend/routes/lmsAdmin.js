const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const ClassSchedule = require('../models/ClassSchedule');
const ParentStudentLink = require('../models/ParentStudentLink');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherAttendance = require('../models/TeacherAttendance');
const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const {
    buildMonthCalendar,
    monthBounds,
    isoDateKey,
} = require('../services/teacherAttendanceCalendar');
const User = require('../models/User');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const Resource = require('../models/Resource');

router.use(authMiddleware);
router.use(allowRoles('super-admin', 'admin'));

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ——— Class schedules ———
router.get('/schedules', async (req, res) => {
    try {
        const filter = {};
        if (req.query.courseId) filter.course = req.query.courseId;
        const schedules = await ClassSchedule.find(filter)
            .populate('course', 'title')
            .populate('teacher', 'name email')
            .sort({ dayOfWeek: 1, startTime: 1 });
        const teachers = await User.find({ role: 'teacher' }).select('name email').sort({ name: 1 });
        res.json({ success: true, schedules, dayLabels: DAY_LABELS, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedules' });
    }
});

router.post('/schedules', async (req, res) => {
    try {
        const { courseId, teacherId, dayOfWeek, startTime, endTime, timezone, roomOrLink } = req.body;
        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
        const schedule = await ClassSchedule.create({
            course: courseId,
            teacher: teacherId || course.instructor,
            dayOfWeek,
            startTime,
            endTime,
            timezone: timezone || 'UTC',
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

        if (courseId) {
            const course = await Course.findById(courseId);
            if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
            schedule.course = courseId;
            if (!teacherId) schedule.teacher = course.instructor;
        }
        if (teacherId) schedule.teacher = teacherId;
        if (dayOfWeek !== undefined) schedule.dayOfWeek = dayOfWeek;
        if (startTime) schedule.startTime = startTime;
        if (endTime) schedule.endTime = endTime;
        if (timezone !== undefined) schedule.timezone = timezone || 'UTC';
        if (roomOrLink !== undefined) schedule.roomOrLink = roomOrLink || '';

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
        await ClassSchedule.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete schedule' });
    }
});

// ——— Parent ↔ student links ———
router.get('/parent-links', async (req, res) => {
    try {
        const links = await ParentStudentLink.find()
            .populate('parent', 'name email')
            .populate('student', 'name email studentId')
            .sort({ createdAt: -1 });
        const parents = await User.find({ role: 'parent' }).select('name email').sort({ name: 1 });
        const students = await User.find({ role: 'student' }).select('name email studentId').sort({ name: 1 });
        res.json({ success: true, links, parents, students });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load parent links' });
    }
});

router.post('/parent-links', async (req, res) => {
    try {
        const { parentId, studentId, relation = 'guardian' } = req.body;
        const link = await ParentStudentLink.findOneAndUpdate(
            { parent: parentId, student: studentId },
            { relation },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        )
            .populate('parent', 'name email')
            .populate('student', 'name email studentId');
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to link parent and student' });
    }
});

router.delete('/parent-links/:id', async (req, res) => {
    try {
        await ParentStudentLink.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to remove link' });
    }
});

// ——— Teacher attendance approval ———
router.get('/teacher-attendance-requests', async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const requests = await TeacherAttendanceRequest.find(filter)
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email')
            .sort({ submittedAt: -1, updatedAt: -1 });
        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load requests' });
    }
});

router.get('/teacher-attendance-requests/:id/daily', async (req, res) => {
    try {
        const request = await TeacherAttendanceRequest.findById(req.params.id).populate(
            'teacher',
            'name email'
        );
        if (!request) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }
        const monthKey = request.monthKey;
        const calendar = await buildMonthCalendar(monthKey);
        const { start, end } = monthBounds(monthKey);
        const teacherId = request.teacher?._id || request.teacher;
        const days = await TeacherSelfAttendanceDay.find({
            teacher: teacherId,
            date: { $gte: start, $lte: end },
        });
        const marksByDate = {};
        days.forEach((d) => {
            marksByDate[isoDateKey(d.date)] = {
                status: d.status,
                notes: d.notes || '',
                _id: d._id,
            };
        });
        const dailyLog = calendar.days.map((d) => ({
            ...d,
            mark: marksByDate[d.date] || null,
        }));
        res.json({
            success: true,
            request,
            monthKey,
            expectedWorkingDays: calendar.expectedWorkingDays,
            dailyLog,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load daily attendance' });
    }
});

router.patch('/teacher-attendance-requests/:id', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, error: 'status must be approved or rejected' });
        }
        const reviewerId = req.user?.userId || req.user?.id;
        if (!reviewerId) {
            return res.status(401).json({ success: false, error: 'Reviewer not authenticated' });
        }

        const existing = await TeacherAttendanceRequest.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Request not found' });
        }

        const request = await TeacherAttendanceRequest.findByIdAndUpdate(
            req.params.id,
            {
                status,
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
            },
            { new: true, runValidators: true }
        )
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email');

        const teacherId = request.teacher?._id || request.teacher;

        if (status === 'approved' && teacherId) {
            await TeacherAttendance.findOneAndUpdate(
                { teacher: teacherId, monthKey: request.monthKey },
                {
                    presentDays: request.presentDays ?? 0,
                    leaveDays: request.leaveDays ?? 0,
                    notes: request.notes || '',
                },
                { upsert: true, new: true }
            );
        }

        res.json({ success: true, request });
    } catch (error) {
        req.log?.error?.('Teacher attendance request review failed', { err: error });
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to update request',
        });
    }
});

// ——— Course resources (books, files, links) ———
router.get('/resources', async (req, res) => {
    try {
        const filter = {};
        if (req.query.courseId) filter.course = req.query.courseId;
        const resources = await Resource.find(filter)
            .populate('course', 'title instructorName')
            .populate('uploadedBy', 'name email role')
            .sort({ createdAt: -1 });
        const courses = await Course.find()
            .select('title instructorName instructor')
            .populate('instructor', 'name email')
            .sort({ title: 1 });
        res.json({ success: true, resources, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load resources' });
    }
});

router.post('/resources', async (req, res) => {
    try {
        const { courseId, title, description, fileUrl, type, attachments } = req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, error: 'courseId and title are required' });
        }
        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
        const resource = await Resource.create({
            title: String(title).trim(),
            description: description || '',
            fileUrl: fileUrl || (Array.isArray(attachments) && attachments[0]) || '',
            type: type || 'file',
            course: courseId,
            uploadedBy: req.user.userId,
        });
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('uploadedBy', 'name role');
        res.status(201).json({ success: true, resource: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create resource' });
    }
});

router.patch('/resources/:id', async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        const { courseId, title, description, fileUrl, type } = req.body;
        if (courseId) {
            const course = await Course.findById(courseId);
            if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
            resource.course = courseId;
        }
        if (title !== undefined) resource.title = String(title).trim();
        if (description !== undefined) resource.description = description || '';
        if (fileUrl !== undefined) resource.fileUrl = fileUrl || '';
        if (type !== undefined) resource.type = type || 'file';
        await resource.save();
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('uploadedBy', 'name role');
        res.json({ success: true, resource: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update resource' });
    }
});

router.delete('/resources/:id', async (req, res) => {
    try {
        await Resource.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete resource' });
    }
});

// ——— Assignments (admin view + create; includes teacher-created) ———
router.get('/assignments', async (req, res) => {
    try {
        const filter = {};
        if (req.query.courseId) filter.course = req.query.courseId;
        const assignments = await Assignment.find(filter)
            .populate('course', 'title instructorName')
            .populate('teacher', 'name email')
            .sort({ dueDate: -1 });
        const courses = await Course.find()
            .select('title instructorName instructor')
            .populate('instructor', 'name email')
            .sort({ title: 1 });
        const teachers = await User.find({ role: 'teacher' }).select('name email').sort({ name: 1 });
        res.json({ success: true, assignments, courses, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.post('/assignments', async (req, res) => {
    try {
        const { courseId, teacherId, title, description, dueDate, maxPoints, status, attachments } = req.body;
        if (!courseId || !title || !dueDate) {
            return res.status(400).json({ success: false, error: 'courseId, title, and dueDate are required' });
        }
        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
        const teacher = teacherId || course.instructor;
        const assignment = await Assignment.create({
            title: String(title).trim(),
            description: description || '',
            course: courseId,
            teacher,
            dueDate: new Date(dueDate),
            maxPoints: maxPoints != null && maxPoints !== '' ? Number(maxPoints) : null,
            attachments: Array.isArray(attachments) ? attachments : [],
            status: status || 'published',
        });
        const populated = await Assignment.findById(assignment._id)
            .populate('course', 'title')
            .populate('teacher', 'name');
        res.status(201).json({ success: true, assignment: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create assignment' });
    }
});

router.patch('/assignments/:id', async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        const { courseId, teacherId, title, description, dueDate, maxPoints, status, attachments } = req.body;
        if (courseId) {
            const course = await Course.findById(courseId);
            if (!course) return res.status(404).json({ success: false, error: 'Course not found' });
            assignment.course = courseId;
            if (!teacherId) assignment.teacher = course.instructor;
        }
        if (teacherId) assignment.teacher = teacherId;
        if (title !== undefined) assignment.title = String(title).trim();
        if (description !== undefined) assignment.description = description || '';
        if (dueDate) assignment.dueDate = new Date(dueDate);
        if (maxPoints !== undefined) {
            assignment.maxPoints = maxPoints != null && maxPoints !== '' ? Number(maxPoints) : null;
        }
        if (status !== undefined) assignment.status = status;
        if (attachments !== undefined) assignment.attachments = Array.isArray(attachments) ? attachments : [];
        await assignment.save();
        const populated = await Assignment.findById(assignment._id)
            .populate('course', 'title')
            .populate('teacher', 'name');
        res.json({ success: true, assignment: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update assignment' });
    }
});

router.delete('/assignments/:id', async (req, res) => {
    try {
        await Assignment.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete assignment' });
    }
});

module.exports = router;
