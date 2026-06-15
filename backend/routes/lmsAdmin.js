const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const ClassSchedule = require('../models/ClassSchedule');
const Enrollment = require('../models/Enrollment');
const ParentStudentLink = require('../models/ParentStudentLink');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherAttendance = require('../models/TeacherAttendance');
const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const {
    buildMonthCalendar,
    monthBounds,
    isoDateKey,
} = require('../services/teacherAttendanceCalendar');
const {
    aggregateFromApprovedDays,
    monthNeedsReapproval,
    syncMonthlyRequestFromDaily,
} = require('../services/teacherAttendanceSync');
const {
    assertMonthEndedForApproval,
    autoGeneratePayrollForApprovedMonth,
} = require('../services/payrollCalculation');
const User = require('../models/User');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Resource = require('../models/Resource');
const PayrollRun = require('../models/PayrollRun');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const { getTeacherPayrollAttendanceDetail } = require('../services/teacherPayrollAttendance');
const { getTeachersForCourse } = require('../services/courseTeachers');
const { activeUserFilter } = require('../utils/userQuery');

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
        let teachers;
        if (req.query.courseId) {
            teachers = await getTeachersForCourse(req.query.courseId);
        } else {
            teachers = await User.find({ role: 'teacher', ...activeUserFilter() })
                .select('name email')
                .sort({ name: 1 });
        }
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

// ——— Parent ↔ student links ———
router.get('/parent-links', async (req, res) => {
    try {
        const links = await ParentStudentLink.find()
            .populate('parent', 'name email')
            .populate('student', 'name email studentId')
            .sort({ createdAt: -1 });
        const parents = await User.find({ role: 'parent', ...activeUserFilter() })
            .select('name email')
            .sort({ name: 1 });
        const students = await User.find({ role: 'student', ...activeUserFilter() })
            .select('name email studentId')
            .sort({ name: 1 });
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
router.get('/teacher-attendance-daily', async (req, res) => {
    try {
        const { month, status, teacherId } = req.query;
        const filter = {};
        if (month) {
            const key = String(month).trim();
            const { start, end } = monthBounds(key);
            filter.date = { $gte: start, $lte: end };
        }
        if (status && status !== 'all') {
            filter.approvalStatus = status;
        }
        if (teacherId) {
            filter.teacher = teacherId;
        }
        const days = await TeacherSelfAttendanceDay.find(filter)
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email')
            .sort({ date: -1, submittedAt: -1 });
        const workingDays = days.filter((d) => {
            const dow = new Date(d.date).getDay();
            return dow !== 0;
        });
        res.json({
            success: true,
            days: workingDays.map((d) => ({
                _id: d._id,
                date: isoDateKey(d.date),
                status: d.status,
                notes: d.notes || '',
                approvalStatus: d.approvalStatus || 'pending',
                submittedAt: d.submittedAt,
                reviewedAt: d.reviewedAt,
                teacher: d.teacher,
                reviewedBy: d.reviewedBy,
            })),
            count: workingDays.length,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load daily attendance' });
    }
});

router.patch('/teacher-attendance-daily/:id', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, error: 'status must be approved or rejected' });
        }
        const reviewerId = req.user?.userId || req.user?.id;
        if (!reviewerId) {
            return res.status(401).json({ success: false, error: 'Reviewer not authenticated' });
        }
        const day = await TeacherSelfAttendanceDay.findByIdAndUpdate(
            req.params.id,
            {
                approvalStatus: status,
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
            },
            { new: true, runValidators: true }
        )
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email');
        if (!day) {
            return res.status(404).json({ success: false, error: 'Daily record not found' });
        }
        const teacherId = day.teacher?._id || day.teacher;
        if (teacherId) {
            await syncMonthlyRequestFromDaily(teacherId, day.date);
        }
        res.json({ success: true, day });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update daily attendance' });
    }
});

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

        const teacherId = existing.teacher?._id || existing.teacher;
        const monthKey = existing.monthKey;
        const { start, end } = monthBounds(monthKey);
        const monthDays = await TeacherSelfAttendanceDay.find({
            teacher: teacherId,
            date: { $gte: start, $lte: end },
        });
        const calendar = await buildMonthCalendar(monthKey);

        if (status === 'approved') {
            assertMonthEndedForApproval(monthKey);
            const workingMonthDays = monthDays.filter((d) => {
                const key = isoDateKey(d.date);
                const calDay = calendar.days.find((cd) => cd.date === key);
                return calDay?.dayType !== 'weekend';
            });
            const submitted = workingMonthDays.filter((d) => d.submittedAt);
            if (!submitted.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot approve month: no daily attendance submissions for this month.',
                });
            }
            if (monthNeedsReapproval(monthDays, calendar.days)) {
                return res.status(400).json({
                    success: false,
                    error: 'Cannot approve month: one or more submitted days are still pending or rejected.',
                });
            }
        }

        const agg = aggregateFromApprovedDays(monthDays, calendar.days);
        const countFields = {
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

        const request = await TeacherAttendanceRequest.findByIdAndUpdate(
            req.params.id,
            {
                ...countFields,
                status,
                reviewedBy: reviewerId,
                reviewedAt: new Date(),
                payrollMissingReason: null,
            },
            { new: true, runValidators: true }
        )
            .populate('teacher', 'name email')
            .populate('reviewedBy', 'name email');

        if (status === 'approved' && teacherId) {
            await TeacherAttendance.findOneAndUpdate(
                { teacher: teacherId, monthKey },
                {
                    ...countFields,
                    notes: request.notes || '',
                },
                { upsert: true, new: true }
            );
        }

        let payroll = null;
        let payrollError = null;
        if (status === 'approved' && teacherId) {
            try {
                const result = await autoGeneratePayrollForApprovedMonth(
                    teacherId,
                    monthKey,
                    reviewerId
                );
                payroll = result.payroll;
            } catch (err) {
                payrollError = err.message || 'Payroll could not be auto-generated';
                await TeacherAttendanceRequest.findByIdAndUpdate(req.params.id, {
                    payrollMissingReason: payrollError,
                });
                request.payrollMissingReason = payrollError;
                req.log?.warn?.('Auto payroll failed after month approval', {
                    teacherId,
                    monthKey,
                    err: payrollError,
                });
            }
        }

        res.json({ success: true, request, payroll, payrollError });
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

router.post('/resources/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const result = await Resource.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete resources' });
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
        const teachers = await User.find({ role: 'teacher', ...activeUserFilter() })
            .select('name email')
            .sort({ name: 1 });
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

router.post('/assignments/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        await AssignmentSubmission.deleteMany({ assignment: { $in: ids } });
        const result = await Assignment.deleteMany({ _id: { $in: ids } });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete assignments' });
    }
});

router.delete('/assignments/:id', async (req, res) => {
    try {
        await AssignmentSubmission.deleteMany({ assignment: req.params.id });
        await Assignment.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete assignment' });
    }
});

function formatScoreDisplay(score, maxPoints) {
    if (score == null) return '—';
    if (maxPoints != null && maxPoints > 0) return `${score} / ${maxPoints}`;
    return String(score);
}

function buildQuizReviewPayload(quiz, answers) {
    const questions = quiz?.questions || [];
    const items = questions.map((q, idx) => {
        const picked = answers[idx];
        const correct = Number(q.correctAnswer);
        const isCorrect = picked != null && Number(picked) === correct;
        return {
            question: q.question,
            options: q.options || [],
            pickedIndex: picked,
            correctIndex: correct,
            isCorrect,
        };
    });
    const correctCount = items.filter((i) => i.isCorrect).length;
    const total = items.length;
    const normalizedScore =
        quiz?.totalMarks != null && quiz.totalMarks > 0 && total
            ? Math.round((correctCount / total) * quiz.totalMarks)
            : correctCount;
    return {
        items,
        correctCount,
        totalQuestions: total,
        score: normalizedScore,
        scoreDisplay: formatScoreDisplay(normalizedScore, quiz?.totalMarks),
    };
}

// ——— Assignment submissions (admin view by course) ———
router.get('/submissions', async (req, res) => {
    try {
        const filter = {};
        if (req.query.courseId) {
            const assignmentIds = await Assignment.find({ course: req.query.courseId }).distinct('_id');
            filter.assignment = { $in: assignmentIds };
        }
        const submissions = await AssignmentSubmission.find(filter)
            .populate('student', 'name email studentId')
            .populate({
                path: 'assignment',
                select: 'title maxPoints dueDate course teacher',
                populate: [
                    { path: 'course', select: 'title instructorName' },
                    { path: 'teacher', select: 'name email' },
                ],
            })
            .sort({ submittedAt: -1 })
            .limit(500);
        const courses = await Course.find().select('title instructorName').sort({ title: 1 });
        res.json({ success: true, submissions, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load submissions' });
    }
});

router.get('/quiz-attempts', async (req, res) => {
    try {
        const filter = {};
        if (req.query.courseId) {
            const quizIds = await Quiz.find({ course: req.query.courseId }).distinct('_id');
            filter.quiz = { $in: quizIds };
        }
        const attempts = await QuizAttempt.find(filter)
            .populate('student', 'name email studentId')
            .populate({
                path: 'quiz',
                select: 'title totalMarks course teacher',
                populate: [
                    { path: 'course', select: 'title instructorName' },
                    { path: 'teacher', select: 'name email' },
                ],
            })
            .sort({ createdAt: -1 })
            .limit(500);
        const quizIds = [...new Set(attempts.map((a) => String(a.quiz?._id || a.quiz)).filter(Boolean))];
        const fullQuizzes = await Quiz.find({ _id: { $in: quizIds } }).select('questions totalMarks title');
        const quizById = Object.fromEntries(fullQuizzes.map((q) => [String(q._id), q]));
        res.json({
            success: true,
            attempts: attempts.map((a) => {
                const o = a.toObject();
                const fullQuiz = quizById[String(a.quiz?._id || a.quiz)];
                o.scoreDisplay = formatScoreDisplay(o.score, a.quiz?.totalMarks);
                o.review = fullQuiz ? buildQuizReviewPayload(fullQuiz, o.answers || []) : null;
                return o;
            }),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quiz attempts' });
    }
});

// ——— Teacher payroll (paid records for admin) ———
router.get('/payroll-missing-alerts', async (req, res) => {
    try {
        const alerts = await TeacherAttendanceRequest.find({
            status: 'approved',
            payrollMissingReason: { $nin: [null, ''] },
        })
            .populate('teacher', 'name email')
            .sort({ monthKey: -1 })
            .limit(50);
        res.json({ success: true, alerts });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payroll alerts' });
    }
});

router.get('/payroll-runs/:id/attendance', async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id).populate('teacher', 'name email');
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        const attendance = await getTeacherPayrollAttendanceDetail(
            run.teacher._id || run.teacher,
            run.monthKey
        );
        res.json({
            success: true,
            run: {
                _id: run._id,
                monthKey: run.monthKey,
                teacher: run.teacher,
                status: run.status,
                finalSalary: run.finalSalary,
            },
            attendance,
        });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Failed to load attendance',
        });
    }
});

router.get('/payroll-runs', async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const runs = await PayrollRun.find(filter)
            .populate('teacher', 'name email')
            .populate('paidBy', 'name email')
            .sort({ monthKey: -1, paidAt: -1, updatedAt: -1 })
            .limit(300);
        const teacherIds = runs.map((r) => r.teacher?._id || r.teacher).filter(Boolean);
        const profiles = await TeacherSalaryProfile.find({ teacher: { $in: teacherIds } });
        const profileByTeacher = new Map(profiles.map((p) => [String(p.teacher), p]));
        const rows = runs.map((r) => {
            const plain = r.toObject();
            const tid = String(r.teacher?._id || r.teacher);
            const profile = profileByTeacher.get(tid);
            return {
                ...plain,
                profileSalary: profile?.monthlySalary ?? null,
            };
        });
        res.json({ success: true, runs: rows });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payroll runs' });
    }
});

module.exports = router;
