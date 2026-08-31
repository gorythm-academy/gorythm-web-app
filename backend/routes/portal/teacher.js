const express = require('express');
const router = express.Router();

const { allowPortalRoles, getPortalActorId } = require('../../middleware/portalAccess');
const AttendanceRecord = require('../../models/AttendanceRecord');
const Assignment = require('../../models/Assignment');
const AssignmentSubmission = require('../../models/AssignmentSubmission');
const Quiz = require('../../models/Quiz');
const QuizAttempt = require('../../models/QuizAttempt');
const Resource = require('../../models/Resource');
const Course = require('../../models/Course');
const ClassSchedule = require('../../models/ClassSchedule');
const TeacherAttendanceRequest = require('../../models/TeacherAttendanceRequest');
const TeacherSelfAttendanceDay = require('../../models/TeacherSelfAttendanceDay');
const PayrollRun = require('../../models/PayrollRun');
const {
    getCourseRosterStudents,
    getActiveCourseRosterStudents,
    getActiveCourseRosterStudentIds,
} = require('../../services/courseRoster');
const {
    isoDateKey,
    monthBounds,
    buildMonthCalendar,
    aggregateTeacherMonthlyFromDays: aggregateMonthlyWithCalendar,
} = require('../../services/teacherAttendanceCalendar');
const { syncMonthlyRequestFromDaily } = require('../../services/teacherAttendanceSync');
const { normalizeMonthKey } = require('../../services/payrollCalculation');
const { isValidAttendanceStatus } = require('../../constants/attendanceStatuses');
const { activeLmsFilter, trashedLmsFilter } = require('../../utils/lmsTrashQuery');
const { assertTeacherOwnsCourse, getTeacherCourseIds } = require('../../services/teacherCourseAccess');
const {
    assertDueDateNotPast,
    teacherAssignmentScopeFilter,
    teacherResourceMongoFilter,
    assertTeacherCanMutateAssignment,
    assertTeacherCanDeleteAssignment,
    assertTeacherCanMutateResource,
    assertTeacherCanDeleteResource,
    recordDueDateExtension,
    isAssignmentLockedForTeacher,
    mapSubmissionForPortal,
} = require('../../utils/lmsContentRules');
const { buildQuizReviewPayload, formatScoreDisplay } = require('../../utils/quizReview');
const {
    DAY_LABELS,
    unauthorized,
    mapAssignmentForPortal,
    teacherQuizScopeFilter,
    assertTeacherOwnsAssignment,
    findQuizForTeacher,
    normalizeQuizQuestions,
    dedupeAttendanceRecords,
    attendancePeriodBounds,
    dayRange,
    isAcademyWeekendDate,
    isFutureAttendanceDate,
    buildStudentAttendanceSummaryRows,
    parentNamesByStudentIds,
    filterAttendanceForActiveStudents,
    loadTeacherAttendancePeriodView,
} = require('./helpers');

// ————————————————— TEACHER —————————————————

router.get('/teacher/dashboard', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = getPortalActorId(req);
        if (!teacherId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const courseIds = await getTeacherCourseIds(teacherId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title category');
        const assignmentsCount = await Assignment.countDocuments({
            ...teacherAssignmentScopeFilter(teacherId),
            ...activeLmsFilter(),
        });
        const quizzesCount = await Quiz.countDocuments({
            ...teacherQuizScopeFilter(teacherId, courseIds),
            ...activeLmsFilter(),
        });
        const myAssignmentIds = await Assignment.find({
            ...teacherAssignmentScopeFilter(teacherId),
            ...activeLmsFilter(),
        }).distinct('_id');
        const submissionCount = await AssignmentSubmission.countDocuments({
            assignment: { $in: myAssignmentIds },
            ...activeLmsFilter(),
        });
        res.json({
            success: true,
            summary: {
                coursesManaged: courses.length,
                assignmentsCount,
                quizzesCount,
                submissionCount,
            },
            courses,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teacher dashboard' });
    }
});

router.get('/teacher/courses', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = getPortalActorId(req);
        if (!teacherId) return unauthorized(res);
        const courseIds = await getTeacherCourseIds(teacherId);
        const courses = await Course.find({ _id: { $in: courseIds } }).sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load courses' });
    }
});

router.get('/teacher/courses/:courseId/roster', allowPortalRoles('teacher'), async (req, res) => {
    try {
        await assertTeacherOwnsCourse(req.portalActorId, req.params.courseId);
        const students = await getCourseRosterStudents(req.params.courseId);
        res.json({ success: true, enrollments: students, students, count: students.length });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load roster' });
    }
});

router.get('/teacher/assignments', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const assignments = await Assignment.find({
            ...teacherAssignmentScopeFilter(teacherId),
            ...activeLmsFilter(),
        })
            .populate('course', 'title')
            .populate('teacher', 'name')
            .sort({ dueDate: -1 });
        res.json({
            success: true,
            assignments: assignments.map((a) => mapAssignmentForPortal(a, { viewerRole: 'teacher' })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.get('/teacher/submissions', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const myAssignments = await Assignment.find({
            ...teacherAssignmentScopeFilter(teacherId),
            ...activeLmsFilter(),
        }).select('_id');
        const ids = myAssignments.map((a) => a._id);
        const filter = { assignment: { $in: ids }, ...activeLmsFilter() };
        const submissions = await AssignmentSubmission.find(filter)
            .populate('student', 'name email studentId')
            .populate({
                path: 'assignment',
                select: 'title description attachments dueDate course',
                populate: { path: 'course', select: 'title' },
            })
            .sort({ submittedAt: -1 });
        const removedSubmissions = await AssignmentSubmission.find({
            assignment: { $in: ids },
            ...trashedLmsFilter(),
        })
            .populate('student', 'name email studentId')
            .populate({
                path: 'assignment',
                select: 'title course',
                populate: { path: 'course', select: 'title' },
            })
            .sort({ deletedAt: -1 })
            .lean();
        res.json({
            success: true,
            submissions: submissions.map((s) => mapSubmissionForPortal(s)),
            submissionRemovals: removedSubmissions.map((s) => ({
                id: s._id,
                studentName: s.student?.name || null,
                studentId: s.student?.studentId || null,
                assignmentTitle: s.assignment?.title || null,
                courseTitle: s.assignment?.course?.title || null,
                removedAt: s.deletedAt,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load submissions' });
    }
});

router.delete('/teacher/submissions/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const submission = await AssignmentSubmission.findOne({
            _id: req.params.id,
            ...activeLmsFilter(),
        }).populate('assignment');
        if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });
        await assertTeacherOwnsCourse(req.portalActorId, submission.assignment.course);
        submission.deletedAt = new Date();
        await submission.save();
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to delete submission' });
    }
});

router.post('/teacher/submissions/bulk-delete', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const submissions = await AssignmentSubmission.find({ _id: { $in: ids }, ...activeLmsFilter() }).populate('assignment');
        let deleted = 0;
        for (const submission of submissions) {
            try {
                await assertTeacherOwnsCourse(req.portalActorId, submission.assignment.course);
                submission.deletedAt = new Date();
                await submission.save();
                deleted += 1;
            } catch {
                /* skip if not teacher's course */
            }
        }
        res.json({ success: true, deletedCount: deleted, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete submissions' });
    }
});

router.get('/teacher/quizzes', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const courseIds = await getTeacherCourseIds(teacherId);
        const quizzes = await Quiz.find({
            ...teacherQuizScopeFilter(teacherId, courseIds),
            ...activeLmsFilter(),
        })
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        const attemptCounts = await QuizAttempt.aggregate([
            { $match: { quiz: { $in: quizzes.map((q) => q._id) }, ...activeLmsFilter() } },
            { $group: { _id: '$quiz', count: { $sum: 1 } } },
        ]);
        const countByQuiz = Object.fromEntries(attemptCounts.map((r) => [String(r._id), r.count]));
        res.json({
            success: true,
            quizzes: quizzes.map((q) => ({
                ...q.toObject(),
                attemptCount: countByQuiz[String(q._id)] || 0,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quizzes' });
    }
});

router.get('/teacher/quiz-attempts', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const courseIds = await getTeacherCourseIds(teacherId);
        const quizIds = await Quiz.find({
            ...teacherQuizScopeFilter(teacherId, courseIds),
            ...activeLmsFilter(),
        }).distinct('_id');
        const attempts = await QuizAttempt.find({ quiz: { $in: quizIds }, ...activeLmsFilter() })
            .populate('student', 'name email studentId')
            .populate({
                path: 'quiz',
                select: 'title totalMarks course teacher',
                populate: { path: 'course', select: 'title' },
            })
            .sort({ createdAt: -1 });
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

router.get('/teacher/resources', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const courseIds = await getTeacherCourseIds(teacherId);
        const resources = await Resource.find({
            ...(await teacherResourceMongoFilter(teacherId, courseIds)),
            ...activeLmsFilter(),
        })
            .populate('course', 'title')
            .populate('teacher', 'name')
            .populate('uploadedBy', 'name role')
            .sort({ createdAt: -1 });
        res.json({ success: true, resources });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load resources' });
    }
});

router.get('/teacher/attendance/roster', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const rosterStudents = await getActiveCourseRosterStudents(courseId);
        const { dayStart, dayEnd } = dayRange(date);
        const existing = await AttendanceRecord.find({
            course: courseId,
            date: { $gte: dayStart, $lte: dayEnd },
        });
        const byStudent = {};
        existing.forEach((r) => {
            const sid = String(r.student);
            const prev = byStudent[sid];
            if (!prev || new Date(r.updatedAt || r.createdAt) > new Date(prev.updatedAt || prev.createdAt)) {
                byStudent[sid] = r;
            }
        });
        res.json({
            success: true,
            count: rosterStudents.length,
            students: rosterStudents.map((s) => ({
                _id: s._id,
                name: s.name,
                studentId: s.studentId,
                enrollmentStatus: s.enrollmentStatus,
                record: byStudent[String(s._id)] || null,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load roster' });
    }
});

router.get('/teacher/attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const filter = { teacher: req.portalActorId };
        if (req.query.courseId) filter.course = req.query.courseId;
        if (req.query.date) {
            const { dayStart, dayEnd } = dayRange(req.query.date);
            filter.date = { $gte: dayStart, $lte: dayEnd };
        }
        const records = await AttendanceRecord.find(filter)
            .populate('student', 'name studentId')
            .populate('course', 'title')
            .sort({ date: -1 })
            .limit(500);
        res.json({ success: true, records, count: records.length });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance' });
    }
});

router.post('/teacher/attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, studentId, status, notes, date, records } = req.body;
        let list = Array.isArray(records) ? records : [];
        if (!list.length && studentId) {
            list = [{ studentId, status, notes, date }];
        }
        if (!courseId || !list.length) {
            return res.status(400).json({ success: false, error: 'courseId and attendance records required' });
        }
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const activeStudentIds = new Set(
            (await getActiveCourseRosterStudentIds(courseId)).map((id) => String(id))
        );

        let upserted = 0;
        for (const r of list) {
            if (!activeStudentIds.has(String(r.studentId))) continue;
            const recordDate = r.date || date;
            if (isFutureAttendanceDate(recordDate)) {
                return res.status(400).json({
                    success: false,
                    error: 'Attendance cannot be marked for future dates.',
                });
            }
            if (isAcademyWeekendDate(recordDate)) {
                return res.status(400).json({
                    success: false,
                    error: 'Attendance cannot be marked on Sunday (academy weekend).',
                });
            }
            const statusValue = r.status || 'present';
            if (!isValidAttendanceStatus(statusValue)) {
                return res.status(400).json({ success: false, error: `Invalid attendance status: ${statusValue}` });
            }
            const { dayStart, dayEnd } = dayRange(recordDate);
            await AttendanceRecord.findOneAndUpdate(
                {
                    course: courseId,
                    student: r.studentId,
                    date: { $gte: dayStart, $lte: dayEnd },
                },
                {
                    course: courseId,
                    teacher: req.portalActorId,
                    student: r.studentId,
                    status: statusValue,
                    notes: r.notes != null ? String(r.notes) : '',
                    date: dayStart,
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            upserted += 1;
        }
        res.status(201).json({ success: true, createdCount: upserted });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark attendance' });
    }
});

router.patch('/teacher/attendance/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { status, notes, date } = req.body;
        const record = await AttendanceRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
        await assertTeacherOwnsCourse(req.portalActorId, record.course);
        if (status) {
            if (!isValidAttendanceStatus(status)) {
                return res.status(400).json({ success: false, error: `Invalid attendance status: ${status}` });
            }
            record.status = status;
        }
        if (notes !== undefined) record.notes = String(notes);
        if (date) {
            if (isFutureAttendanceDate(date)) {
                return res.status(400).json({
                    success: false,
                    error: 'Attendance cannot be marked for future dates.',
                });
            }
            const { dayStart } = dayRange(date);
            record.date = dayStart;
        }
        await record.save();
        const populated = await AttendanceRecord.findById(record._id)
            .populate('student', 'name studentId')
            .populate('course', 'title');
        res.json({ success: true, record: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update attendance' });
    }
});

router.delete('/teacher/attendance/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const record = await AttendanceRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
        await assertTeacherOwnsCourse(req.portalActorId, record.course);
        await AttendanceRecord.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete attendance' });
    }
});

router.post('/teacher/attendance/bulk-delete', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const records = await AttendanceRecord.find({ _id: { $in: ids } });
        let deleted = 0;
        for (const record of records) {
            try {
                await assertTeacherOwnsCourse(req.portalActorId, record.course);
                await AttendanceRecord.findByIdAndDelete(record._id);
                deleted += 1;
            } catch {
                // skip records outside teacher scope
            }
        }
        res.json({ success: true, deletedCount: deleted });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete records' });
    }
});

router.get('/teacher/attendance/view', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, period = 'daily', date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        const payload = await loadTeacherAttendancePeriodView(
            courseId,
            period,
            date,
            req.portalActorId
        );
        res.json({ success: true, ...payload });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load attendance view' });
    }
});

router.get('/teacher/attendance/summary', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, period = 'daily', date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const { start, end } = attendancePeriodBounds(period, date);
        const rosterStudents = await getActiveCourseRosterStudents(courseId);
        const records = await filterAttendanceForActiveStudents(
            courseId,
            await AttendanceRecord.find({
                course: courseId,
                date: { $gte: start, $lte: end },
            }).populate('student', 'name studentId')
        );
        const rows = buildStudentAttendanceSummaryRows(records, rosterStudents);
        res.json({
            success: true,
            period,
            startDate: isoDateKey(start),
            endDate: isoDateKey(end),
            rows,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load attendance summary' });
    }
});

router.get('/teacher/attendance/report', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, period = 'daily', date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const { start, end } = attendancePeriodBounds(period, date);
        const records = await AttendanceRecord.find({
            course: courseId,
            date: { $gte: start, $lte: end },
        })
            .populate('student', 'name studentId')
            .populate('course', 'title')
            .sort({ date: -1, updatedAt: -1 });
        const deduped = dedupeAttendanceRecords(
            await filterAttendanceForActiveStudents(courseId, records)
        );
        const studentIds = deduped.map((r) => r.student?._id || r.student).filter(Boolean);
        const parentMap = await parentNamesByStudentIds(studentIds);
        const rows = deduped.map((r) => {
            const sid = String(r.student?._id || r.student);
            return {
                ...r.toObject(),
                parent: (parentMap[sid] || []).join(', ') || '—',
            };
        });
        res.json({
            success: true,
            period,
            startDate: isoDateKey(start),
            endDate: isoDateKey(end),
            records: rows,
            count: rows.length,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load attendance report' });
    }
});

router.post('/teacher/assignments', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, title, description, dueDate, status, attachments } = req.body;
        if (!courseId || !title || !dueDate) {
            return res.status(400).json({ success: false, error: 'courseId, title, and dueDate are required' });
        }
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const parsedDueDate = assertDueDateNotPast(dueDate);
        const assignment = await Assignment.create({
            title: String(title).trim(),
            description: description || '',
            course: courseId,
            teacher: req.portalActorId,
            dueDate: parsedDueDate,
            attachments: Array.isArray(attachments) ? attachments : [],
            status: status || 'published',
            createdByRole: 'teacher',
            createdByUser: req.portalActorId,
            lockedForTeacher: false,
        });
        const populated = await Assignment.findById(assignment._id).populate('course', 'title');
        res.status(201).json({ success: true, assignment: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to create assignment' });
    }
});

router.post('/teacher/quizzes', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, title, questions, totalMarks, dueDate, status, resourceLink, resourceFileUrl } =
            req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, error: 'courseId and title are required' });
        }
        const normalized = normalizeQuizQuestions(questions);
        if (!normalized.length) {
            return res.status(400).json({ success: false, error: 'Add at least one question with 3 options' });
        }
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const quiz = await Quiz.create({
            title: String(title).trim(),
            course: courseId,
            teacher: req.portalActorId,
            questions: normalized,
            totalMarks: totalMarks != null && totalMarks !== '' ? Number(totalMarks) : null,
            dueDate: dueDate ? new Date(dueDate) : null,
            resourceLink: resourceLink ? String(resourceLink).trim() : '',
            resourceFileUrl: resourceFileUrl ? String(resourceFileUrl).trim() : '',
            status: status || 'published',
        });
        res.status(201).json({ success: true, quiz });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create quiz' });
    }
});

router.post('/teacher/resources', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { courseId, title, description, fileUrl, attachments, type, scope = 'teacher' } = req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, error: 'courseId and title are required' });
        }
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const attachmentList = Array.isArray(attachments)
            ? attachments.map((u) => String(u || '').trim()).filter(Boolean)
            : fileUrl
              ? [String(fileUrl).trim()].filter(Boolean)
              : [];
        const resource = await Resource.create({
            title: String(title).trim(),
            description: description || '',
            fileUrl: attachmentList[0] || '',
            attachments: attachmentList,
            type: type || 'file',
            course: courseId,
            teacher: req.portalActorId,
            scope: scope === 'course' ? 'course' : 'teacher',
            uploadedBy: req.portalActorId,
            createdByRole: 'teacher',
            createdByUser: req.portalActorId,
            lockedForTeacher: false,
        });
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('uploadedBy', 'name');
        res.status(201).json({ success: true, resource: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to create resource' });
    }
});

router.patch('/teacher/assignments/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.params.id || req.params.id === 'undefined') {
            return res.status(400).json({ success: false, error: 'Assignment id is required' });
        }
        const assignment = await Assignment.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        await assertTeacherOwnsAssignment(req.portalActorId, assignment);
        const locked = isAssignmentLockedForTeacher(assignment);
        const { title, description, dueDate, status, attachments, extendDueDate } = req.body;

        if (locked) {
            if (dueDate && (extendDueDate || locked)) {
                recordDueDateExtension(assignment, dueDate, req.portalActorId, 'teacher');
            } else if (title !== undefined || description !== undefined || attachments !== undefined || status !== undefined) {
                assertTeacherCanMutateAssignment(assignment);
            }
        } else {
            if (title !== undefined) assignment.title = String(title).trim();
            if (description !== undefined) assignment.description = description || '';
            if (dueDate) {
                if (extendDueDate) {
                    recordDueDateExtension(assignment, dueDate, req.portalActorId, 'teacher');
                } else {
                    assignment.dueDate = assertDueDateNotPast(dueDate);
                }
            }
            if (status !== undefined) assignment.status = status;
            if (attachments !== undefined) assignment.attachments = Array.isArray(attachments) ? attachments : [];
        }

        await assignment.save();
        const populated = await Assignment.findById(assignment._id)
            .populate('course', 'title')
            .populate('teacher', 'name');
        res.json({
            success: true,
            assignment: mapAssignmentForPortal(populated, { viewerRole: 'teacher' }),
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update assignment' });
    }
});

router.delete('/teacher/assignments/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const assignment = await Assignment.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        await assertTeacherOwnsAssignment(req.portalActorId, assignment);
        assertTeacherCanDeleteAssignment(assignment);
        const trashedAt = new Date();
        assignment.deletedAt = trashedAt;
        await assignment.save();
        await AssignmentSubmission.updateMany(
            { assignment: assignment._id, ...activeLmsFilter() },
            { $set: { deletedAt: trashedAt } }
        );
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to delete assignment' });
    }
});

router.post('/teacher/assignments/bulk-delete', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const assignments = await Assignment.find({ _id: { $in: ids }, ...activeLmsFilter() });
        let deleted = 0;
        const trashedAt = new Date();
        for (const assignment of assignments) {
            try {
                await assertTeacherOwnsAssignment(req.portalActorId, assignment);
                assertTeacherCanDeleteAssignment(assignment);
                assignment.deletedAt = trashedAt;
                await assignment.save();
                await AssignmentSubmission.updateMany(
                    { assignment: assignment._id, ...activeLmsFilter() },
                    { $set: { deletedAt: trashedAt } }
                );
                deleted += 1;
            } catch {
                /* skip assignments the teacher does not own */
            }
        }
        res.json({ success: true, deletedCount: deleted, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete assignments' });
    }
});

router.post('/teacher/resources/bulk-delete', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        const resources = await Resource.find({ _id: { $in: ids }, ...activeLmsFilter() });
        let deleted = 0;
        const trashedAt = new Date();
        for (const resource of resources) {
            try {
                await assertTeacherOwnsCourse(req.portalActorId, resource.course);
                assertTeacherCanDeleteResource(resource);
                resource.deletedAt = trashedAt;
                await resource.save();
                deleted += 1;
            } catch {
                /* skip resources the teacher does not own */
            }
        }
        res.json({ success: true, deletedCount: deleted, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete resources' });
    }
});

router.patch('/teacher/resources/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const resource = await Resource.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        await assertTeacherOwnsCourse(req.portalActorId, resource.course);
        assertTeacherCanMutateResource(resource);
        const { courseId, title, description, fileUrl, attachments, type } = req.body;
        if (courseId) await assertTeacherOwnsCourse(req.portalActorId, courseId);
        if (courseId) resource.course = courseId;
        if (title !== undefined) resource.title = String(title).trim();
        if (description !== undefined) resource.description = description || '';
        if (attachments !== undefined || fileUrl !== undefined) {
            const list = Array.isArray(attachments)
                ? attachments.map((u) => String(u || '').trim()).filter(Boolean)
                : fileUrl !== undefined
                  ? [String(fileUrl || '').trim()].filter(Boolean)
                  : resource.attachments || [];
            resource.attachments = list;
            resource.fileUrl = list[0] || '';
        }
        if (type !== undefined) resource.type = type || 'file';
        await resource.save();
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('uploadedBy', 'name role');
        res.json({ success: true, resource: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update resource' });
    }
});

router.delete('/teacher/resources/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const resource = await Resource.findOne({ _id: req.params.id, ...activeLmsFilter() });
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        await assertTeacherOwnsCourse(req.portalActorId, resource.course);
        assertTeacherCanDeleteResource(resource);
        resource.deletedAt = new Date();
        await resource.save();
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to delete resource' });
    }
});

router.patch('/teacher/quizzes/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.params.id || req.params.id === 'undefined') {
            return res.status(400).json({ success: false, error: 'Quiz id is required' });
        }
        const quiz = await findQuizForTeacher(req.portalActorId, req.params.id);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const attemptCount = await QuizAttempt.countDocuments({ quiz: quiz._id, ...activeLmsFilter() });
        const { courseId, title, questions, totalMarks, dueDate, status, resourceLink, resourceFileUrl } =
            req.body;
        if (courseId) {
            await assertTeacherOwnsCourse(req.portalActorId, courseId);
            quiz.course = courseId;
        }
        if (title !== undefined) quiz.title = String(title).trim();
        if (questions !== undefined) {
            if (attemptCount > 0) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Students have already taken this quiz. You can edit title, due date, and total marks only — not questions.',
                });
            }
            const normalized = normalizeQuizQuestions(questions);
            if (!normalized.length) {
                return res.status(400).json({ success: false, error: 'Add at least one valid question' });
            }
            quiz.questions = normalized;
        }
        if (totalMarks !== undefined) {
            quiz.totalMarks = totalMarks != null && totalMarks !== '' ? Number(totalMarks) : null;
        }
        if (dueDate !== undefined) quiz.dueDate = dueDate ? new Date(dueDate) : null;
        if (resourceLink !== undefined) quiz.resourceLink = resourceLink ? String(resourceLink).trim() : '';
        if (resourceFileUrl !== undefined) {
            quiz.resourceFileUrl = resourceFileUrl ? String(resourceFileUrl).trim() : '';
        }
        if (status !== undefined) quiz.status = status;
        await quiz.save();
        res.json({ success: true, quiz });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update quiz' });
    }
});

router.delete('/teacher/quizzes/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const quiz = await findQuizForTeacher(req.portalActorId, req.params.id);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const trashedAt = new Date();
        quiz.deletedAt = trashedAt;
        await quiz.save();
        await QuizAttempt.updateMany(
            { quiz: quiz._id, ...activeLmsFilter() },
            { $set: { deletedAt: trashedAt } }
        );
        res.json({ success: true, deletedCount: 1, message: 'Moved to trash' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete quiz' });
    }
});

router.get('/teacher/quizzes/:quizId/attempts', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.params.quizId || req.params.quizId === 'undefined') {
            return res.status(400).json({ success: false, error: 'Quiz id is required' });
        }
        const quiz = await findQuizForTeacher(req.portalActorId, req.params.quizId);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const attempts = await QuizAttempt.find({ quiz: quiz._id, ...activeLmsFilter() })
            .populate('student', 'name email studentId')
            .sort({ createdAt: -1 });
        res.json({
            success: true,
            quiz: {
                _id: quiz._id,
                title: quiz.title,
                totalMarks: quiz.totalMarks,
                questions: quiz.questions,
            },
            attempts: attempts.map((a) => {
                const o = a.toObject();
                o.scoreDisplay = formatScoreDisplay(o.score, quiz.totalMarks);
                o.review = buildQuizReviewPayload(quiz, o.answers || []);
                return o;
            }),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quiz attempts' });
    }
});

router.get('/teacher/schedule', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = getPortalActorId(req);
        if (!teacherId) return unauthorized(res);
        const schedules = await ClassSchedule.find({ teacher: teacherId })
            .populate('course', 'title')
            .sort({ dayOfWeek: 1, startTime: 1 });
        res.json({ success: true, schedules, dayLabels: DAY_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedule' });
    }
});

async function buildTeacherMonthlyRecords(days, requests) {
    const monthKeys = new Set();
    for (const doc of days) {
        const d = new Date(doc.date);
        monthKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const calendarByMonth = new Map();
    for (const mk of [...monthKeys]) {
        calendarByMonth.set(mk, await buildMonthCalendar(mk));
    }
    const monthlyAgg = aggregateMonthlyWithCalendar(days, calendarByMonth);
    return monthlyAgg.map((m) => {
        const cal = calendarByMonth.get(m.monthKey);
        const reqRow = requests.find((r) => r.monthKey === m.monthKey);
        const rollup = reqRow
            ? {
                  presentDays: reqRow.presentDays ?? 0,
                  leaveDays: reqRow.leaveDays ?? 0,
                  absentDays: reqRow.absentDays ?? 0,
                  lateDays: reqRow.lateDays ?? 0,
                  holidayDays: reqRow.holidayDays ?? 0,
                  weekendDays: reqRow.weekendDays ?? 0,
                  reportAbsentDays: reqRow.reportAbsentDays ?? 0,
                  daysMarked: reqRow.daysMarked ?? 0,
                  expectedWorkingDays: reqRow.expectedWorkingDays ?? cal?.expectedWorkingDays ?? 0,
              }
            : {
                  expectedWorkingDays: m.expectedWorkingDays ?? cal?.expectedWorkingDays ?? 0,
              };
        return {
            ...m,
            ...rollup,
            approvalStatus: reqRow?.status || 'pending',
            reviewedAt: reqRow?.reviewedAt || null,
            payrollMissingReason: reqRow?.payrollMissingReason || null,
        };
    });
}

router.get('/teacher/my-attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.portalActorId) {
            return res.json({ success: true, monthlyRecords: [], todayRecord: null });
        }
        const days = await TeacherSelfAttendanceDay.find({ teacher: req.portalActorId }).sort({ date: -1 });
        const requests = await TeacherAttendanceRequest.find({ teacher: req.portalActorId });
        let monthlyRecords = await buildTeacherMonthlyRecords(days, requests);
        const payrollRuns = await PayrollRun.find({ teacher: req.portalActorId }).select(
            'monthKey status finalSalary deduction paidAt'
        );
        const payrollByMonth = new Map(payrollRuns.map((p) => [p.monthKey, p]));
        monthlyRecords = monthlyRecords.map((m) => ({
            ...m,
            payroll: payrollByMonth.get(m.monthKey) || null,
        }));

        const now = new Date();
        const viewMonth =
            req.query.month ||
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthCalendar = await buildMonthCalendar(normalizeMonthKey(viewMonth));
        const { start, end } = monthBounds(monthCalendar.monthKey);
        const monthDays = await TeacherSelfAttendanceDay.find({
            teacher: req.portalActorId,
            date: { $gte: start, $lte: end },
        });
        const marksByDate = {};
        monthDays.forEach((d) => {
            marksByDate[isoDateKey(d.date)] = {
                status: d.status,
                notes: d.notes || '',
                approvalStatus: d.approvalStatus || 'pending',
            };
        });
        const calendarDays = monthCalendar.days.map((d) => ({
            ...d,
            mark: marksByDate[d.date] || null,
        }));
        const dailySubmissions = monthDays
            .filter((d) => !isAcademyWeekendDate(d.date))
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map((d) => ({
                _id: d._id,
                date: isoDateKey(d.date),
                status: d.status,
                notes: d.notes || '',
                approvalStatus: d.approvalStatus || 'pending',
                submittedAt: d.submittedAt,
                reviewedAt: d.reviewedAt,
            }));

        const { dayStart } = dayRange(new Date());
        const todayRecord = await TeacherSelfAttendanceDay.findOne({
            teacher: req.portalActorId,
            date: dayStart,
        });
        let selectedDayRecord = null;
        let selectedDayMeta = null;
        if (req.query.date) {
            const { dayStart: selStart } = dayRange(req.query.date);
            selectedDayRecord = await TeacherSelfAttendanceDay.findOne({
                teacher: req.portalActorId,
                date: selStart,
            });
            selectedDayMeta = monthCalendar.days.find((d) => d.date === isoDateKey(selStart)) || null;
        }
        res.json({
            success: true,
            monthlyRecords,
            todayRecord,
            selectedDayRecord,
            selectedDayMeta,
            monthCalendar: { ...monthCalendar, days: calendarDays },
            viewMonth: monthCalendar.monthKey,
            dailySubmissions,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance' });
    }
});

router.post('/teacher/my-attendance', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.portalActorId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const { date, status, notes } = req.body;
        if (!isValidAttendanceStatus(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        if (isFutureAttendanceDate(date || new Date())) {
            return res.status(400).json({
                success: false,
                error: 'Attendance cannot be marked for future dates.',
            });
        }
        const { dayStart } = dayRange(date || new Date());
        if (isAcademyWeekendDate(dayStart)) {
            return res.status(400).json({
                success: false,
                error: 'Sunday is academy weekend. This day is counted automatically — no submission required.',
            });
        }
        if (status === 'weekend') {
            return res.status(400).json({
                success: false,
                error: 'Weekend status cannot be submitted. Sundays are counted automatically.',
            });
        }
        const monthKey = normalizeMonthKey(
            `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}`
        );
        const record = await TeacherSelfAttendanceDay.findOneAndUpdate(
            { teacher: req.portalActorId, date: dayStart },
            {
                status,
                notes: String(notes || ''),
                approvalStatus: 'pending',
                reviewedBy: null,
                reviewedAt: null,
                submittedAt: new Date(),
            },
            { upsert: true, new: true }
        );
        await syncMonthlyRequestFromDaily(req.portalActorId, dayStart);
        const days = await TeacherSelfAttendanceDay.find({ teacher: req.portalActorId });
        const requests = await TeacherAttendanceRequest.find({ teacher: req.portalActorId });
        const monthlyRecords = await buildTeacherMonthlyRecords(days, requests);
        res.json({
            success: true,
            record,
            monthlyRecords,
            monthKey,
            message: `Daily attendance submitted for ${isoDateKey(dayStart)} — pending admin approval.`,
        });
    } catch (error) {
        req.log?.error?.('Teacher my-attendance submit failed', { err: error });
        res.status(500).json({ success: false, error: 'Failed to submit attendance' });
    }
});

module.exports = router;
