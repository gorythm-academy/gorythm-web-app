const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { allowPortalRoles, getPortalActorId } = require('../middleware/portalAccess');
const PayrollRun = require('../models/PayrollRun');
const TeacherSalaryProfile = require('../models/TeacherSalaryProfile');
const TeacherAttendance = require('../models/TeacherAttendance');
const {
    normalizeMonthKey,
    getTeacherAttendanceForPayroll,
    calculatePayrollAmounts,
    buildPayrollRun,
    persistPayrollRun,
    payrollRunTeacherId,
    payrollRunTeacherDisplay,
} = require('../services/payrollCalculation');
const { upsertTeacherPayrollProfile } = require('../services/teacherPayrollProfile');
const { getTeacherPayrollAttendanceDetail } = require('../services/teacherPayrollAttendance');
const Enrollment = require('../models/Enrollment');
const AttendanceRecord = require('../models/AttendanceRecord');
const Assignment = require('../models/Assignment');
const AssignmentSubmission = require('../models/AssignmentSubmission');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Resource = require('../models/Resource');
const ParentStudentLink = require('../models/ParentStudentLink');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const ClassSchedule = require('../models/ClassSchedule');
const TeacherAttendanceRequest = require('../models/TeacherAttendanceRequest');
const TeacherSelfAttendanceDay = require('../models/TeacherSelfAttendanceDay');
const {
    getCourseRosterStudents,
    getActiveCourseRosterStudents,
    getActiveCourseRosterStudentIds,
} = require('../services/courseRoster');
const {
    isoDateKey,
    startOfDay,
    monthBounds,
    buildMonthCalendar,
    aggregateTeacherMonthlyFromDays: aggregateMonthlyWithCalendar,
} = require('../services/teacherAttendanceCalendar');
const { syncMonthlyRequestFromDaily } = require('../services/teacherAttendanceSync');
const User = require('../models/User');
const {
    enrichEnrollmentsWithPaymentStatus,
    countPendingFeesForStudents,
} = require('../services/enrollmentPaymentStatus');
const { isValidAttendanceStatus } = require('../constants/attendanceStatuses');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activeCourseFilter, isCourseTrashed } = require('../utils/courseQuery');
const { activeUserFilter, isUserTrashed } = require('../utils/userQuery');
const { activePaymentFilter, trashedPaymentFilter, activePaymentListFilter, studentPaymentsFilter } = require('../utils/paymentQuery');
const { serializePayments } = require('../utils/serializePayment');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const {
    assertTeacherOwnsCourse,
    getTeacherCourseIds,
} = require('../services/teacherCourseAccess');
const { stripCourseModulesForStudent } = require('../utils/stripCourseModulesForStudent');

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

router.use(authMiddleware);
router.use(validateSessionUser);
router.use((req, res, next) => {
    req.portalActorId = getPortalActorId(req);
    next();
});

function withActiveEnrollments(studentId, extra = {}) {
    return { student: studentId, ...activeEnrollmentFilter(), ...extra };
}

function dropTrashedCourses(enrollments = []) {
    return enrollments.filter((e) => e.course && !isCourseTrashed(e.course));
}

function unauthorized(res) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
}

/** Course IDs where the student has an active enrollment (LMS content access). */
async function getStudentCourseIds(studentId) {
    if (!studentId) return [];
    const enrollments = await Enrollment.find({
        ...withActiveEnrollments(studentId),
        course: { $ne: null },
        status: 'active',
    }).select('course');
    const seen = new Set();
    const courseIds = [];
    for (const enr of enrollments) {
        const id = String(enr.course);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        courseIds.push(enr.course);
    }
    if (!courseIds.length) return [];

    const activeCourses = await Course.find({
        _id: { $in: courseIds },
        ...activeCourseFilter(),
    }).select('_id');
    return activeCourses.map((c) => c._id);
}

async function assertParentChild(parentId, studentId) {
    const link = await ParentStudentLink.findOne({ parent: parentId, student: studentId });
    if (!link) {
        const err = new Error('Child not linked to this parent');
        err.status = 403;
        throw err;
    }
    const student = await User.findOne({ _id: studentId, role: 'student', ...activeUserFilter() });
    if (!student) {
        const err = new Error('Child not linked to this parent');
        err.status = 403;
        throw err;
    }
    return link;
}

function parseAttendanceAnchor(dateInput) {
    if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
        return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }
    const str = String(dateInput || '').trim();
    const dayMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dayMatch) {
        return new Date(Number(dayMatch[1]), Number(dayMatch[2]) - 1, Number(dayMatch[3]));
    }
    const monthMatch = str.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
        return new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1);
    }
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) {
        const err = new Error('Invalid date');
        err.status = 400;
        throw err;
    }
    return startOfDay(parsed);
}

function dayRange(dateInput) {
    const dayStart = dateInput ? parseAttendanceAnchor(dateInput) : startOfDay(new Date());
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    return { dayStart, dayEnd };
}

/** Academy weekend: Sunday only — no attendance marking. */
function isAcademyWeekendDate(dateInput) {
    const anchor =
        dateInput instanceof Date && !Number.isNaN(dateInput.getTime())
            ? parseAttendanceAnchor(dateInput)
            : dayRange(dateInput).dayStart;
    return anchor.getDay() === 0;
}

function isFutureAttendanceDate(dateInput) {
    const { dayStart } = dayRange(dateInput);
    const today = startOfDay(new Date());
    return dayStart.getTime() > today.getTime();
}

/** Quizzes on instructor courses or created by this teacher (legacy/admin data). */
function teacherQuizScopeFilter(teacherId, courseIds) {
    const clauses = [{ teacher: teacherId }];
    if (courseIds?.length) clauses.push({ course: { $in: courseIds } });
    return { $or: clauses };
}

/** Assignments on courses this teacher instructs (scoped to roster). */
function teacherAssignmentScopeFilter(teacherId, courseIds) {
    if (courseIds?.length) return { course: { $in: courseIds } };
    return { teacher: teacherId };
}

async function findQuizForTeacher(teacherId, quizId) {
    if (!teacherId) return null;
    const courseIds = await getTeacherCourseIds(teacherId);
    return Quiz.findOne({ _id: quizId, ...teacherQuizScopeFilter(teacherId, courseIds) });
}

function formatScoreDisplay(score, maxPoints) {
    if (score == null) return '—';
    if (maxPoints != null && maxPoints > 0) return `${score} / ${maxPoints}`;
    return String(score);
}

/** Each question must have exactly 3 options (A/B/C). */
function normalizeQuizQuestions(questions) {
    return (questions || [])
        .map((q) => {
            const opts = (q.options || []).map((o) => String(o).trim());
            while (opts.length < 3) opts.push('');
            const options = opts.slice(0, 3);
            let correctAnswer = Number(q.correctAnswer);
            if (!Number.isFinite(correctAnswer) || correctAnswer < 0 || correctAnswer > 2) {
                correctAnswer = 0;
            }
            return {
                question: String(q.question || '').trim(),
                options,
                correctAnswer,
            };
        })
        .filter((q) => q.question);
}

function buildQuizReviewPayload(quiz, answers) {
    const questions = quiz.questions || [];
    const total = questions.length;
    let correctCount = 0;
    const items = questions.map((q, idx) => {
        const chosen = answers[idx] != null ? Number(answers[idx]) : -1;
        const correctIdx = Number(q.correctAnswer) ?? 0;
        const isCorrect = chosen === correctIdx;
        if (isCorrect) correctCount += 1;
        return {
            question: q.question,
            options: (q.options || []).slice(0, 3),
            correctIndex: correctIdx,
            chosenIndex: chosen,
            isCorrect,
        };
    });
    const normalizedScore =
        quiz.totalMarks != null && quiz.totalMarks > 0 && total
            ? Math.round((correctCount / total) * quiz.totalMarks)
            : correctCount;
    return {
        items,
        correctCount,
        totalQuestions: total,
        score: normalizedScore,
        scoreDisplay: formatScoreDisplay(normalizedScore, quiz.totalMarks),
    };
}

/** One record per course+day (latest wins) for accurate attendance %. */
function dedupeAttendanceRecords(records) {
    const byKey = {};
    records.forEach((r) => {
        const day = new Date(r.date);
        day.setHours(0, 0, 0, 0);
        const key = `${String(r.course)}-${String(r.student)}-${day.getTime()}`;
        const prev = byKey[key];
        if (!prev || new Date(r.updatedAt || r.createdAt) > new Date(prev.updatedAt || prev.createdAt)) {
            byKey[key] = r;
        }
    });
    return Object.values(byKey);
}

function attendancePresentRate(records) {
    const unique = dedupeAttendanceRecords(records);
    if (!unique.length) return 0;
    const present = unique.filter((r) => r.status === 'present' || r.status === 'late').length;
    return Math.round((present / unique.length) * 100);
}

function attendancePeriodBounds(period, dateInput) {
    if (period === 'monthly') {
        const monthKey = String(dateInput || isoDateKey(new Date())).trim().slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(monthKey)) {
            const err = new Error('Invalid month');
            err.status = 400;
            throw err;
        }
        return monthBounds(monthKey);
    }

    const anchor = dateInput ? parseAttendanceAnchor(dateInput) : startOfDay(new Date());
    anchor.setHours(0, 0, 0, 0);

    if (period === 'daily') {
        const { dayStart, dayEnd } = dayRange(anchor);
        return { start: dayStart, end: dayEnd };
    }
    if (period === 'weekly') {
        // Academy week: Monday–Saturday (Sunday is weekend, excluded).
        const dow = anchor.getDay();
        const daysFromMonday = dow === 0 ? 6 : dow - 1;
        const start = new Date(anchor);
        start.setDate(anchor.getDate() - daysFromMonday);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 5);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }
    const err = new Error('period must be daily, weekly, or monthly');
    err.status = 400;
    throw err;
}

function emptyAttendanceCounts() {
    return { present: 0, absent: 0, late: 0, leave: 0, holiday: 0, weekend: 0, total: 0 };
}

function daysInRange(start, end) {
    const days = [];
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    while (cur <= endDay) {
        days.push(isoDateKey(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}

/** Calendar count of academy weekend days (Sundays) within [start, end]. */
function countWeekendDaysInPeriod(start, end) {
    return daysInRange(start, end).filter((day) => isAcademyWeekendDate(day)).length;
}

function summarizeAttendanceByDay(records) {
    const deduped = dedupeAttendanceRecords(records);
    const byDay = {};
    deduped.forEach((r) => {
        const day = new Date(r.date);
        day.setHours(0, 0, 0, 0);
        const key = isoDateKey(day);
        if (!byDay[key]) byDay[key] = { ...emptyAttendanceCounts(), date: key };
        if (byDay[key][r.status] != null) byDay[key][r.status] += 1;
        byDay[key].total += 1;
    });
    return byDay;
}

function buildAttendanceSummaryRows(records, start, end) {
    const byDay = summarizeAttendanceByDay(records);
    return daysInRange(start, end).map((date) => byDay[date] || { ...emptyAttendanceCounts(), date });
}

function buildStudentAttendanceSummaryRows(records, rosterStudents) {
    const deduped = dedupeAttendanceRecords(records);
    const byStudent = {};

    rosterStudents.forEach((s) => {
        const sid = String(s._id);
        byStudent[sid] = {
            studentId: sid,
            name: s.name || '—',
            rollNumber: s.studentId || '',
            ...emptyAttendanceCounts(),
        };
    });

    deduped.forEach((r) => {
        const sid = String(r.student?._id || r.student);
        if (!byStudent[sid]) {
            byStudent[sid] = {
                studentId: sid,
                name: r.student?.name || '—',
                rollNumber: r.student?.studentId || '',
                ...emptyAttendanceCounts(),
            };
        }
        if (byStudent[sid][r.status] != null) byStudent[sid][r.status] += 1;
        byStudent[sid].total += 1;
    });

    return Object.values(byStudent).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function parentNamesByStudentIds(studentIds) {
    if (!studentIds.length) return {};
    const links = await ParentStudentLink.find({ student: { $in: studentIds } }).populate('parent', 'name');
    const map = {};
    links.forEach((l) => {
        const sid = String(l.student);
        const name = l.parent?.name || '—';
        if (!map[sid]) map[sid] = [];
        if (!map[sid].includes(name)) map[sid].push(name);
    });
    return map;
}

async function filterAttendanceForActiveStudents(courseId, records) {
    const activeIds = new Set(
        (await getActiveCourseRosterStudentIds(courseId)).map((id) => String(id))
    );
    return records.filter((r) => activeIds.has(String(r.student?._id || r.student)));
}

function filterAttendanceRecordsForActiveIds(records, activeStudentIds) {
    const activeIds =
        activeStudentIds instanceof Set
            ? activeStudentIds
            : new Set(activeStudentIds.map((id) => String(id)));
    return records.filter((r) => activeIds.has(String(r.student?._id || r.student)));
}

async function loadTeacherAttendancePeriodView(courseId, period, date, teacherId) {
    await assertTeacherOwnsCourse(teacherId, courseId);
    const { start, end } = attendancePeriodBounds(period, date);
    const rosterStudents = await getActiveCourseRosterStudents(courseId);
    const activeIds = new Set(rosterStudents.map((s) => String(s._id)));
    const records = await AttendanceRecord.find({
        course: courseId,
        date: { $gte: start, $lte: end },
    })
        .populate('student', 'name studentId')
        .populate('course', 'title')
        .sort({ date: -1, updatedAt: -1 });
    const activeRecords = filterAttendanceRecordsForActiveIds(records, activeIds);
    const reportRecords = dedupeAttendanceRecords(activeRecords).map((r) => r.toObject());
    const payload = {
        period,
        startDate: isoDateKey(start),
        endDate: isoDateKey(end),
        rows: buildStudentAttendanceSummaryRows(activeRecords, rosterStudents),
        records: reportRecords,
        count: reportRecords.length,
    };
    if (period === 'monthly') {
        payload.weekendDaysInPeriod = countWeekendDaysInPeriod(start, end);
    }
    return payload;
}

async function loadStudentAttendancePeriodView(studentId, courseId, period, date) {
    const courseIds = await getStudentCourseIds(studentId);
    if (!courseIds.some((id) => String(id) === String(courseId))) {
        const err = new Error('Not enrolled in this course');
        err.status = 403;
        throw err;
    }
    const { start, end } = attendancePeriodBounds(period, date);
    const records = await AttendanceRecord.find({
        student: studentId,
        course: courseId,
        date: { $gte: start, $lte: end },
    })
        .populate('course', 'title')
        .sort({ date: -1, updatedAt: -1 });
    const deduped = dedupeAttendanceRecords(records);
    const byDay = {};
    deduped.forEach((r) => {
        byDay[isoDateKey(new Date(r.date))] = r;
    });
    const calendarRows = daysInRange(start, end).map((dateKey) => {
        const rec = byDay[dateKey];
        return {
            date: dateKey,
            status: rec?.status || null,
            notes: rec?.notes || '',
            recordId: rec?._id || null,
        };
    });
    const summary = { ...emptyAttendanceCounts(), presentRate: 0 };
    deduped.forEach((r) => {
        if (summary[r.status] != null) summary[r.status] += 1;
        summary.total += 1;
    });
    summary.presentRate = attendancePresentRate(deduped);
    const payload = {
        period,
        startDate: isoDateKey(start),
        endDate: isoDateKey(end),
        records: deduped.map((r) => r.toObject()),
        calendarRows,
        summary,
    };
    if (period === 'monthly') {
        payload.weekendDaysInPeriod = countWeekendDaysInPeriod(start, end);
    }
    return payload;
}

// ————————————————— STUDENT —————————————————

router.get('/student/dashboard', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title category price deletedAt');
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        ));
        const courseIds = enrollments
            .filter((e) => e.status === 'active' && e.course?._id)
            .map((e) => e.course._id);

        const attendance = await AttendanceRecord.find({
            student: studentId,
            ...(courseIds.length ? { course: { $in: courseIds } } : { course: { $in: [] } }),
        });
        const attendanceRate = attendancePresentRate(attendance);

        const now = new Date();
        const assignments = await Assignment.find({ course: { $in: courseIds }, status: 'published' })
            .populate('course', 'title')
            .sort({ dueDate: 1 })
            .limit(50);
        const submissions = await AssignmentSubmission.find({ student: studentId });
        const submittedIds = new Set(submissions.map((s) => String(s.assignment)));
        const dueAssignments = assignments.filter(
            (a) => !submittedIds.has(String(a._id)) && a.dueDate && new Date(a.dueDate) >= now
        );

        const quizzes = await Quiz.find({ course: { $in: courseIds }, status: 'published' }).limit(20);

        const pendingFees = enrollments.filter((e) => e.paymentStatus === 'pending' && e.course).length;

        res.json({
            success: true,
            summary: {
                enrolledCourses: enrollments.filter((e) => e.course && e.status === 'active').length,
                attendanceRate,
                assignmentsDue: dueAssignments.length,
                quizzesAvailable: quizzes.length,
                pendingFees,
            },
            enrollments,
            dueAssignments: dueAssignments.map((a) => ({
                _id: a._id,
                title: a.title,
                dueDate: a.dueDate,
                course: a.course,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load student portal data' });
    }
});

router.get('/student/courses', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title category description price duration level instructorName deletedAt')
            .sort({ enrollmentDate: -1 });
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        ));
        res.json({ success: true, enrollments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load courses' });
    }
});

router.get('/student/fees', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title price deletedAt')
            .sort({ updatedAt: -1 });
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            req.user.email
        ));
        const payments = await Payment.find(studentPaymentsFilter(studentId, req.user.email))
            .populate('course', 'title')
            .sort({ createdAt: -1 })
            .limit(50);
        res.json({ success: true, enrollments, payments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load fees' });
    }
});

router.get('/student/schedule', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);

        const enrollments = await Enrollment.find({
            ...withActiveEnrollments(studentId),
            status: 'active',
            course: { $ne: null },
            assignedSchedule: { $ne: null },
        }).select('assignedSchedule');

        const scheduleIds = enrollments
            .map((e) => e.assignedSchedule)
            .filter(Boolean);

        if (!scheduleIds.length) {
            return res.json({ success: true, schedules: [], dayLabels: DAY_LABELS });
        }

        const schedules = await ClassSchedule.find({ _id: { $in: scheduleIds } })
            .populate('course', 'title deletedAt')
            .populate('teacher', 'name deletedAt')
            .sort({ dayOfWeek: 1, startTime: 1 });
        const activeSchedules = schedules.filter(
            (s) => s.course && !isCourseTrashed(s.course) && s.teacher && !isUserTrashed(s.teacher)
        );
        res.json({ success: true, schedules: activeSchedules, dayLabels: DAY_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load schedule' });
    }
});

router.get('/student/assignments', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const assignments = await Assignment.find({ course: { $in: courseIds }, status: 'published' })
            .populate('course', 'title')
            .sort({ dueDate: 1 });
        const submissions = await AssignmentSubmission.find({ student: studentId });
        const byAssignment = Object.fromEntries(submissions.map((s) => [String(s.assignment), s]));
        res.json({
            success: true,
            assignments: assignments.map((a) => ({
                ...a.toObject(),
                submission: byAssignment[String(a._id)] || null,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.get('/student/quizzes/:quizId', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const quiz = await Quiz.findById(req.params.quizId).populate('course', 'title');
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(quiz.course._id || quiz.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const attempt = await QuizAttempt.findOne({ quiz: quiz._id, student: studentId });
        if (quiz.status !== 'published' && !attempt) {
            return res.status(403).json({ success: false, error: 'Quiz is not available' });
        }
        const obj = quiz.toObject();
        obj.questions = (obj.questions || []).map((q) => {
            const { correctAnswer, ...rest } = q;
            return rest;
        });
        let review = null;
        if (attempt) {
            const fullQuiz = await Quiz.findById(quiz._id).select('questions totalMarks title');
            review = buildQuizReviewPayload(fullQuiz, attempt.answers || []);
        }
        res.json({ success: true, quiz: obj, attempt, review });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quiz' });
    }
});

router.get('/student/quizzes', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const attempts = await QuizAttempt.find({ student: studentId });
        const attemptQuizIds = attempts.map((a) => a.quiz).filter(Boolean);
        const quizzes = await Quiz.find({
            $or: [
                { course: { $in: courseIds }, status: 'published' },
                ...(attemptQuizIds.length
                    ? [{ _id: { $in: attemptQuizIds }, course: { $in: courseIds } }]
                    : []),
            ],
        })
            .populate('course', 'title')
            .select('-questions.correctAnswer');
        const byQuiz = Object.fromEntries(attempts.map((a) => [String(a.quiz), a]));
        res.json({
            success: true,
            quizzes: quizzes.map((q) => ({
                ...q.toObject(),
                attempt: byQuiz[String(q._id)] || null,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load quizzes' });
    }
});

router.get('/student/content', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title modules');
        const resources = await Resource.find({ course: { $in: courseIds } })
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        res.json({
            success: true,
            courses: courses.map(stripCourseModulesForStudent),
            resources,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load content' });
    }
});

router.get('/student/attendance', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const records = await AttendanceRecord.find({
            student: studentId,
            ...(courseIds.length ? { course: { $in: courseIds } } : { course: { $in: [] } }),
        })
            .populate('course', 'title')
            .sort({ date: -1 })
            .limit(100);
        res.json({ success: true, records });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load attendance' });
    }
});

router.get('/student/attendance/courses', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const courseIds = await getStudentCourseIds(studentId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title').sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load courses' });
    }
});

router.get('/student/attendance/view', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return unauthorized(res);
        const { courseId, period = 'daily', date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        const payload = await loadStudentAttendancePeriodView(studentId, courseId, period, date);
        res.json({ success: true, ...payload });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load attendance' });
    }
});

router.post('/student/submissions', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { assignmentId, text, attachments = [] } = req.body;
        const hasText = String(text || '').trim().length > 0;
        const hasFiles = Array.isArray(attachments) && attachments.length > 0;
        if (!hasText && !hasFiles) {
            return res.status(400).json({ success: false, error: 'Add a written answer or attach a file' });
        }
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        if (assignment.status !== 'published') {
            return res.status(403).json({ success: false, error: 'Assignment is not available' });
        }
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(assignment.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const existing = await AssignmentSubmission.findOne({ assignment: assignmentId, student: studentId });
        if (assignment.dueDate && new Date(assignment.dueDate) < new Date() && !existing) {
            return res.status(400).json({ success: false, error: 'The due date for this assignment has passed' });
        }
        let submission;
        if (existing) {
            existing.text = text || '';
            existing.attachments = Array.isArray(attachments) ? attachments : [];
            existing.submittedAt = new Date();
            existing.status = 'submitted';
            await existing.save();
            submission = existing;
        } else {
            submission = await AssignmentSubmission.create({
                assignment: assignmentId,
                student: studentId,
                text: text || '',
                attachments: Array.isArray(attachments) ? attachments : [],
            });
        }
        res.status(201).json({ success: true, submission });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to submit assignment' });
    }
});

router.post('/student/quiz-attempts', allowPortalRoles('student'), async (req, res) => {
    try {
        const studentId = getPortalActorId(req);
        if (!studentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const { quizId, answers = [] } = req.body;
        const quiz = await Quiz.findById(quizId);
        if (!quiz) return res.status(404).json({ success: false, error: 'Quiz not found' });
        if (quiz.status !== 'published') {
            return res.status(403).json({ success: false, error: 'Quiz is not available' });
        }
        const courseIds = await getStudentCourseIds(studentId);
        if (!courseIds.some((id) => String(id) === String(quiz.course))) {
            return res.status(403).json({ success: false, error: 'Not enrolled in this course' });
        }
        const prior = await QuizAttempt.findOne({ quiz: quizId, student: studentId });
        if (prior) {
            return res.status(400).json({ success: false, error: 'You have already attempted this quiz' });
        }
        const review = buildQuizReviewPayload(quiz, answers);
        const attempt = await QuizAttempt.create({
            quiz: quizId,
            student: studentId,
            answers,
            score: review.score,
        });
        res.status(201).json({
            success: true,
            attempt,
            review,
            totalQuestions: review.totalQuestions,
            rawCorrect: review.correctCount,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to submit quiz attempt' });
    }
});

// ————————————————— TEACHER —————————————————

router.get('/teacher/dashboard', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = getPortalActorId(req);
        if (!teacherId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const courseIds = await getTeacherCourseIds(teacherId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title category');
        const assignmentsCount = await Assignment.countDocuments(teacherAssignmentScopeFilter(teacherId, courseIds));
        const quizzesCount = await Quiz.countDocuments(teacherQuizScopeFilter(teacherId, courseIds));
        const myAssignmentIds = await Assignment.find(teacherAssignmentScopeFilter(teacherId, courseIds)).distinct('_id');
        const submissionCount = await AssignmentSubmission.countDocuments({
            assignment: { $in: myAssignmentIds },
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
        const courseIds = await getTeacherCourseIds(teacherId);
        const assignments = await Assignment.find(teacherAssignmentScopeFilter(teacherId, courseIds))
            .populate('course', 'title')
            .populate('teacher', 'name')
            .sort({ dueDate: -1 });
        res.json({ success: true, assignments });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load assignments' });
    }
});

router.get('/teacher/submissions', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const courseIds = await getTeacherCourseIds(teacherId);
        const myAssignments = await Assignment.find(teacherAssignmentScopeFilter(teacherId, courseIds)).select('_id');
        const ids = myAssignments.map((a) => a._id);
        const filter = { assignment: { $in: ids } };
        const submissions = await AssignmentSubmission.find(filter)
            .populate('student', 'name email studentId')
            .populate({
                path: 'assignment',
                select: 'title description attachments dueDate course',
                populate: { path: 'course', select: 'title' },
            })
            .sort({ submittedAt: -1 });
        res.json({ success: true, submissions });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load submissions' });
    }
});

router.delete('/teacher/submissions/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const submission = await AssignmentSubmission.findById(req.params.id).populate('assignment');
        if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });
        await assertTeacherOwnsCourse(req.portalActorId, submission.assignment.course);
        await AssignmentSubmission.findByIdAndDelete(req.params.id);
        res.json({ success: true });
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
        const submissions = await AssignmentSubmission.find({ _id: { $in: ids } }).populate('assignment');
        let deleted = 0;
        for (const submission of submissions) {
            try {
                await assertTeacherOwnsCourse(req.portalActorId, submission.assignment.course);
                await AssignmentSubmission.findByIdAndDelete(submission._id);
                deleted += 1;
            } catch {
                /* skip if not teacher's course */
            }
        }
        res.json({ success: true, deletedCount: deleted });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete submissions' });
    }
});

router.get('/teacher/quizzes', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const teacherId = req.portalActorId;
        const courseIds = await getTeacherCourseIds(teacherId);
        const quizzes = await Quiz.find(teacherQuizScopeFilter(teacherId, courseIds))
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        const attemptCounts = await QuizAttempt.aggregate([
            { $match: { quiz: { $in: quizzes.map((q) => q._id) } } },
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
        const quizIds = await Quiz.find(teacherQuizScopeFilter(teacherId, courseIds)).distinct('_id');
        const attempts = await QuizAttempt.find({ quiz: { $in: quizIds } })
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
        const courseIds = await getTeacherCourseIds(req.portalActorId);
        const resources = await Resource.find({ course: { $in: courseIds } })
            .populate('course', 'title')
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
        const assignment = await Assignment.create({
            title: String(title).trim(),
            description: description || '',
            course: courseId,
            teacher: req.portalActorId,
            dueDate: new Date(dueDate),
            attachments: Array.isArray(attachments) ? attachments : [],
            status: status || 'published',
        });
        const populated = await Assignment.findById(assignment._id).populate('course', 'title');
        res.status(201).json({ success: true, assignment: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create assignment' });
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
        const { courseId, title, description, fileUrl, type } = req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, error: 'courseId and title are required' });
        }
        await assertTeacherOwnsCourse(req.portalActorId, courseId);
        const resource = await Resource.create({
            title: String(title).trim(),
            description: description || '',
            fileUrl: fileUrl || '',
            type: type || 'file',
            course: courseId,
            uploadedBy: req.portalActorId,
        });
        const populated = await Resource.findById(resource._id)
            .populate('course', 'title')
            .populate('uploadedBy', 'name');
        res.status(201).json({ success: true, resource: populated });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to create resource' });
    }
});

router.patch('/teacher/assignments/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        if (!req.params.id || req.params.id === 'undefined') {
            return res.status(400).json({ success: false, error: 'Assignment id is required' });
        }
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        await assertTeacherOwnsCourse(req.portalActorId, assignment.course);
        const { title, description, dueDate, status, attachments } = req.body;
        if (title !== undefined) assignment.title = String(title).trim();
        if (description !== undefined) assignment.description = description || '';
        if (dueDate) assignment.dueDate = new Date(dueDate);
        if (status !== undefined) assignment.status = status;
        if (attachments !== undefined) assignment.attachments = Array.isArray(attachments) ? attachments : [];
        await assignment.save();
        const populated = await Assignment.findById(assignment._id)
            .populate('course', 'title')
            .populate('teacher', 'name');
        res.json({ success: true, assignment: populated });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update assignment' });
    }
});

router.delete('/teacher/assignments/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });
        await assertTeacherOwnsCourse(req.portalActorId, assignment.course);
        await AssignmentSubmission.deleteMany({ assignment: assignment._id });
        await Assignment.findByIdAndDelete(req.params.id);
        res.json({ success: true });
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
        const assignments = await Assignment.find({ _id: { $in: ids } });
        let deleted = 0;
        for (const assignment of assignments) {
            try {
                await assertTeacherOwnsCourse(req.portalActorId, assignment.course);
                await AssignmentSubmission.deleteMany({ assignment: assignment._id });
                await Assignment.findByIdAndDelete(assignment._id);
                deleted += 1;
            } catch {
                /* skip assignments the teacher does not own */
            }
        }
        res.json({ success: true, deletedCount: deleted });
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
        const resources = await Resource.find({ _id: { $in: ids } });
        let deleted = 0;
        for (const resource of resources) {
            try {
                await assertTeacherOwnsCourse(req.portalActorId, resource.course);
                await Resource.findByIdAndDelete(resource._id);
                deleted += 1;
            } catch {
                /* skip resources the teacher does not own */
            }
        }
        res.json({ success: true, deletedCount: deleted });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete resources' });
    }
});

router.patch('/teacher/resources/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        await assertTeacherOwnsCourse(req.portalActorId, resource.course);
        const { title, description, fileUrl, type, courseId } = req.body;
        if (courseId) await assertTeacherOwnsCourse(req.portalActorId, courseId);
        if (courseId) resource.course = courseId;
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
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to update resource' });
    }
});

router.delete('/teacher/resources/:id', allowPortalRoles('teacher'), async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource) return res.status(404).json({ success: false, error: 'Resource not found' });
        await assertTeacherOwnsCourse(req.portalActorId, resource.course);
        await Resource.findByIdAndDelete(req.params.id);
        res.json({ success: true });
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
        const attemptCount = await QuizAttempt.countDocuments({ quiz: quiz._id });
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
        await QuizAttempt.deleteMany({ quiz: quiz._id });
        await Quiz.findByIdAndDelete(quiz._id);
        res.json({ success: true });
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
        const attempts = await QuizAttempt.find({ quiz: quiz._id })
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

// ————————————————— PARENT —————————————————

router.get('/parent/dashboard', allowPortalRoles('parent'), async (req, res) => {
    try {
        const parentId = getPortalActorId(req);
        if (!parentId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const links = await ParentStudentLink.find({ parent: parentId }).populate(
            'student',
            'name email studentId deletedAt'
        );
        const activeLinks = links.filter((l) => l.student && !isUserTrashed(l.student));
        const studentIds = activeLinks.map((l) => l.student?._id).filter(Boolean);

        const enrollments = dropTrashedCourses(
            await Enrollment.find({
                student: { $in: studentIds },
                ...activeEnrollmentFilter(),
            }).populate('course', 'title deletedAt')
        );
        const enrolledCourseIds = [
            ...new Set(
                enrollments
                    .map((e) => e.course?._id || e.course)
                    .filter(Boolean)
                    .map((id) => String(id))
            ),
        ];
        const attendance =
            enrolledCourseIds.length > 0
                ? await AttendanceRecord.find({
                      student: { $in: studentIds },
                      course: { $in: enrolledCourseIds },
                  })
                : [];
        const quizAttempts = await QuizAttempt.find({ student: { $in: studentIds } });
        const emailByStudentId = {};
        for (const link of activeLinks) {
            if (link.student?._id) {
                emailByStudentId[String(link.student._id)] = link.student.email;
            }
        }
        const pendingFees = await countPendingFeesForStudents(studentIds, emailByStudentId);

        res.json({
            success: true,
            children: activeLinks,
            summary: {
                childrenCount: activeLinks.length,
                enrollmentsCount: enrollments.length,
                attendanceRecords: attendance.length,
                quizAttempts: quizAttempts.length,
                pendingFees,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load parent dashboard' });
    }
});

router.get('/parent/children', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        const links = await ParentStudentLink.find({ parent: req.portalActorId }).populate(
            'student',
            'name email studentId status deletedAt'
        );
        const children = links.filter((l) => l.student && !isUserTrashed(l.student));
        res.json({ success: true, children });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load children' });
    }
});

router.get('/parent/children/:studentId/attendance/courses', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        await assertParentChild(req.portalActorId, req.params.studentId);
        const studentId = req.params.studentId;
        const courseIds = await getStudentCourseIds(studentId);
        const courses = await Course.find({ _id: { $in: courseIds } }).select('title').sort({ title: 1 });
        res.json({ success: true, courses });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load courses' });
    }
});

router.get('/parent/children/:studentId/attendance/view', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        await assertParentChild(req.portalActorId, req.params.studentId);
        const { courseId, period = 'daily', date } = req.query;
        if (!courseId) return res.status(400).json({ success: false, error: 'courseId required' });
        const payload = await loadStudentAttendancePeriodView(req.params.studentId, courseId, period, date);
        res.json({ success: true, ...payload });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load attendance' });
    }
});

router.get('/parent/children/:studentId', allowPortalRoles('parent'), async (req, res) => {
    try {
        if (!req.portalActorId) return unauthorized(res);
        await assertParentChild(req.portalActorId, req.params.studentId);
        const studentId = req.params.studentId;

        const student = await User.findById(studentId).select('email deletedAt');
        if (!student || isUserTrashed(student)) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
            .populate('course', 'title price deletedAt');
        const enrollments = dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(
            enrollmentsRaw,
            studentId,
            student?.email
        ));
        const enrolledCourseIds = enrollments
            .map((e) => e.course?._id || e.course)
            .filter(Boolean);
        const attendance = enrolledCourseIds.length
            ? await AttendanceRecord.find({
                  student: studentId,
                  course: { $in: enrolledCourseIds },
              })
                  .populate('course', 'title')
                  .sort({ date: -1 })
                  .limit(50)
            : [];
        const submissions = await AssignmentSubmission.find({ student: studentId })
            .populate('assignment', 'title')
            .sort({ submittedAt: -1 })
            .limit(30);
        const quizAttempts = await QuizAttempt.find({ student: studentId })
            .populate('quiz', 'title totalMarks')
            .sort({ createdAt: -1 })
            .limit(30);
        const quizAttemptsOut = quizAttempts.map((a) => {
            const o = a.toObject();
            o.scoreDisplay = formatScoreDisplay(o.score, o.quiz?.totalMarks);
            return o;
        });
        const payments = await Payment.find(studentPaymentsFilter(studentId, student?.email))
            .populate('course', 'title')
            .sort({ createdAt: -1 });
        const paymentsOut = serializePayments(payments);

        res.json({
            success: true,
            enrollments,
            attendance,
            submissions,
            quizAttempts: quizAttemptsOut,
            payments: paymentsOut,
        });
    } catch (error) {
        const code = error.status || 500;
        res.status(code).json({ success: false, error: error.message || 'Failed to load child data' });
    }
});

// ————————————————— ACCOUNTANT (read-focused portal APIs) —————————————————

router.get('/accountant/dashboard', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payments = await Payment.find(activePaymentFilter()).sort({ createdAt: -1 }).limit(500);
        const payrollRuns = await PayrollRun.find().select('status');
        const payrollMissingAlerts = await TeacherAttendanceRequest.find({
            status: 'approved',
            payrollMissingReason: { $nin: [null, ''] },
        })
            .populate('teacher', 'name email')
            .sort({ monthKey: -1 })
            .limit(20);
        res.json({
            success: true,
            summary: {
                payments: payments.length,
                paid: payments.filter((p) => p.status === 'paid' || p.status === 'completed').length,
                pending: payments.filter((p) =>
                    ['pending', 'awaiting_review', 'processing'].includes(p.status)
                ).length,
                refunded: payments.filter((p) => p.status === 'refunded').length,
                failed: payments.filter((p) => p.status === 'failed').length,
                payrollPendingReview: payrollRuns.filter((r) => r.status === 'pending_review').length,
                payrollStale: payrollRuns.filter((r) => r.status === 'stale').length,
                payrollPaid: payrollRuns.filter((r) => r.status === 'paid').length,
                payrollMissing: payrollMissingAlerts.length,
            },
            payrollMissingAlerts: payrollMissingAlerts.map((a) => ({
                _id: a._id,
                teacher: a.teacher,
                monthKey: a.monthKey,
                reason: a.payrollMissingReason,
            })),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load accountant dashboard' });
    }
});

router.get('/accountant/payments', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const filter = trash ? trashedPaymentFilter() : activePaymentListFilter();
        const sort = trash ? { deletedAt: -1 } : { createdAt: -1 };
        const [payments, trashCount] = await Promise.all([
            Payment.find(filter)
                .populate('user', 'name email')
                .populate('course', 'title')
                .sort(sort)
                .lean(),
            Payment.countDocuments(trashedPaymentFilter()),
        ]);
        const withProof = serializePayments(payments).map((p) => ({
            ...p,
            proofUrl: p.proofUrl || '',
        }));
        res.json({ success: true, payments: withProof, trashCount });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payments' });
    }
});

router.patch('/accountant/payments/:id/approve', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { isPaidStatus } = require('../services/onPaymentPaid');
        const verifiedBy = req.portalActorId || req.user?.userId;
        const { fulfillPaymentEnrollment } = require('../services/onPaymentPaid');
        const { resolveAndLinkCourseOnPayment } = require('../services/resolveCourseFromPayment');

        const claimed = await Payment.findOneAndUpdate(
            {
                _id: req.params.id,
                ...activePaymentFilter(),
                paymentMethod: 'bank',
                status: 'awaiting_review',
                proofUrl: { $nin: [null, ''] },
            },
            {
                $set: {
                    status: 'processing',
                    verifiedBy,
                    verifiedAt: new Date(),
                },
            },
            { new: true }
        );

        if (!claimed) {
            const payment = await Payment.findById(req.params.id);
            if (!payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            if (payment.deletedAt) {
                return res.status(400).json({ success: false, error: 'Payment is in trash' });
            }
            if (payment.paymentMethod !== 'bank') {
                return res.status(400).json({ success: false, error: 'Only bank transfer payments can be approved here' });
            }
            if (!payment.proofUrl) {
                return res.status(400).json({ success: false, error: 'No payment proof uploaded yet' });
            }
            if (isPaidStatus(payment.status)) {
                return res.status(400).json({ success: false, error: 'Payment is already paid' });
            }
            return res.status(400).json({ success: false, error: 'Payment is not awaiting review' });
        }

        try {
            await resolveAndLinkCourseOnPayment(claimed);
            await claimed.populate(['user', 'course']);
            await fulfillPaymentEnrollment(claimed, { verifiedBy });

            claimed.status = 'paid';
            claimed.rejectionReason = '';
            await claimed.save();

            res.json({ success: true, message: 'Payment approved', payment: claimed });
        } catch (error) {
            await Payment.findByIdAndUpdate(claimed._id, {
                $set: { status: 'awaiting_review' },
                $unset: { verifiedBy: 1, verifiedAt: 1 },
            });
            throw error;
        }
    } catch (error) {
        req.log?.error('Approve bank payment failed', { err: error });
        const msg =
            error?.code === 11000
                ? 'Could not create student account — that email is already used. Ask admin to link the student manually.'
                : error.message || 'Failed to approve payment';
        res.status(400).json({ success: false, error: msg });
    }
});

router.patch('/accountant/payments/:id/reject', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { isPaidStatus } = require('../services/onPaymentPaid');
        const reason = String(req.body?.reason || '').trim();
        if (!reason) {
            return res.status(400).json({ success: false, error: 'Rejection reason is required' });
        }
        const payment = await Payment.findOne({ _id: req.params.id, ...activePaymentFilter() });
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }
        if (payment.paymentMethod !== 'bank') {
            return res.status(400).json({ success: false, error: 'Only bank transfer payments can be rejected here' });
        }
        if (isPaidStatus(payment.status)) {
            return res.status(400).json({ success: false, error: 'Paid payments cannot be rejected' });
        }
        if (!['awaiting_review', 'pending', 'processing'].includes(payment.status)) {
            return res.status(400).json({ success: false, error: 'This payment cannot be rejected' });
        }

        payment.status = 'rejected';
        payment.rejectionReason = reason;
        await payment.save();

        res.json({ success: true, message: 'Payment rejected', payment });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Failed to reject payment' });
    }
});

router.delete('/accountant/payments/:id', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payment = await Payment.findOneAndUpdate(
            { _id: req.params.id, ...activePaymentFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }
        res.json({ success: true, message: 'Payment moved to trash', paymentId: req.params.id });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete payment' });
    }
});

router.patch('/accountant/payments/:id/restore', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const payment = await Payment.findOneAndUpdate(
            { _id: req.params.id, ...trashedPaymentFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Trashed payment not found' });
        }
        res.json({ success: true, message: 'Payment restored', payment });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore payment' });
    }
});

router.delete('/accountant/payments/:id/permanent', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { deleteProofFile } = require('../services/trashCleanup');
        const payment = await Payment.findOne({
            _id: req.params.id,
            ...trashedPaymentFilter(),
        });
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment must be in trash before permanent delete' });
        }
        if (payment.proofUrl) {
            deleteProofFile(payment.proofUrl);
        }
        await Payment.deleteOne({ _id: payment._id });
        res.json({ success: true, message: 'Payment permanently deleted', paymentId: req.params.id });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete payment' });
    }
});

// ————————————————— ACCOUNTANT PAYROLL (portal; uses approved attendance) —————————————————

router.get('/accountant/payroll/teachers', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher', ...activeUserFilter() }).select('_id name email');
        res.json({ success: true, teachers });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load teachers' });
    }
});

router.get('/accountant/payroll/preview', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey } = req.query;
        if (!teacherId || !monthKey) {
            return res.status(400).json({ success: false, error: 'teacherId and monthKey required' });
        }
        const built = await buildPayrollRun(teacherId, monthKey, req.portalActorId || req.user?.userId);
        res.json({
            success: true,
            preview: { ...built.amounts, attendanceSource: built.attendance.source, monthKey: built.monthKey },
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Preview failed' });
    }
});

router.get('/accountant/payroll/salary-profiles', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher', ...activeUserFilter() }).select('_id name email').sort({ name: 1 });
        const profiles = await TeacherSalaryProfile.find().populate('teacher', 'name email');
        const profileByTeacher = new Map(profiles.map((p) => [String(p.teacher?._id || p.teacher), p]));
        const rows = teachers.map((t) => ({
            teacher: t,
            profile: profileByTeacher.get(String(t._id)) || null,
        }));
        const listedTeacherIds = new Set(teachers.map((t) => String(t._id)));
        profiles.forEach((p) => {
            const teacherRef = p.teacher?._id || p.get('teacher');
            const tid = teacherRef ? String(teacherRef) : '';
            if (!tid || listedTeacherIds.has(tid)) return;
            rows.push({
                teacher: p.teacher?.name
                    ? p.teacher
                    : { _id: teacherRef, name: 'Removed teacher', email: '', removed: true },
                profile: p,
                teacherRemoved: true,
            });
        });
        res.json({ success: true, rows });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load salary profiles' });
    }
});

router.post('/accountant/payroll/salary-profile', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, name, monthlySalary, workingDays, email } = req.body;
        const result = await upsertTeacherPayrollProfile({
            teacherId: teacherId || null,
            name,
            monthlySalary,
            workingDays,
            email,
        });
        res.json({
            success: true,
            profile: result.profile,
            teacher: { _id: result.teacher._id, name: result.teacher.name, email: result.teacher.email },
            created: result.created,
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to save salary profile' });
    }
});

router.patch('/accountant/payroll/teacher-profile/:teacherId', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { name, monthlySalary, workingDays } = req.body;
        const result = await upsertTeacherPayrollProfile({
            teacherId: req.params.teacherId,
            name,
            monthlySalary,
            workingDays,
        });
        res.json({
            success: true,
            profile: result.profile,
            teacher: { _id: result.teacher._id, name: result.teacher.name, email: result.teacher.email },
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to update teacher profile' });
    }
});

router.delete('/accountant/payroll/teacher-profile/:teacherId', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const teacherId = req.params.teacherId;
        const profile = await TeacherSalaryProfile.findOneAndDelete({ teacher: teacherId });
        if (!profile) {
            return res.status(404).json({ success: false, error: 'Teacher salary profile not found' });
        }
        res.json({ success: true, message: 'Teacher salary profile removed' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to remove teacher salary profile' });
    }
});

router.post('/accountant/payroll/attendance', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey, presentDays, leaveDays, absentDays, notes } = req.body;
        const key = normalizeMonthKey(monthKey);
        const attendance = await TeacherAttendance.findOneAndUpdate(
            { teacher: teacherId, monthKey: key },
            {
                presentDays,
                leaveDays,
                absentDays: absentDays ?? 0,
                notes: notes || '',
            },
            { upsert: true, new: true }
        );
        res.json({ success: true, attendance });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to save attendance' });
    }
});

router.post('/accountant/payroll/run', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { teacherId, monthKey } = req.body;
        const actorId = req.portalActorId || req.user?.userId;
        const result = await persistPayrollRun(teacherId, monthKey, actorId, {
            autoGenerated: false,
            status: 'pending_review',
        });
        res.json({ success: true, payroll: result.payroll, calculation: result.calculation });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to generate payroll' });
    }
});

router.post('/accountant/payroll/runs/:id/regenerate', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Cannot regenerate a payroll that is already marked paid.',
            });
        }
        const actorId = req.portalActorId || req.user?.userId;
        const result = await persistPayrollRun(run.teacher, run.monthKey, actorId, {
            autoGenerated: false,
            status: 'pending_review',
        });
        res.json({ success: true, payroll: result.payroll, calculation: result.calculation });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to regenerate payroll' });
    }
});

router.get('/accountant/payroll/runs/:id/attendance', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id).populate('teacher', 'name email');
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        const teacherId = payrollRunTeacherId(run);
        if (!teacherId) {
            return res.status(404).json({
                success: false,
                error: 'Teacher account no longer exists for this payroll run.',
            });
        }
        const attendance = await getTeacherPayrollAttendanceDetail(teacherId, run.monthKey);
        const teacher = payrollRunTeacherDisplay(run);
        res.json({
            success: true,
            run: {
                _id: run._id,
                monthKey: run.monthKey,
                teacher,
                teacherName: run.teacherName,
                presentDays: run.presentDays,
                absentDays: run.absentDays,
                deduction: run.deduction,
                finalSalary: run.finalSalary,
                status: run.status,
            },
            attendance,
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to load attendance' });
    }
});

router.patch('/accountant/payroll/runs/:id', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({ success: false, error: 'Cannot edit a payroll that is already marked paid.' });
        }
        const { deduction, finalSalary, absentDays, accountantNotes } = req.body;
        const updates = { editedByAccountant: true };
        if (accountantNotes !== undefined) updates.accountantNotes = String(accountantNotes || '');

        if (absentDays !== undefined && absentDays !== null) {
            const absent = Math.max(0, Number(absentDays) || 0);
            const perDay = run.workingDays > 0 ? run.monthlySalary / run.workingDays : 0;
            updates.absentDays = absent;
            updates.deductionDays = absent;
            updates.deduction = Math.round(perDay * absent * 100) / 100;
            updates.finalSalary = Math.max(0, Math.round((run.monthlySalary - updates.deduction) * 100) / 100);
        } else {
            if (deduction !== undefined && deduction !== null) {
                updates.deduction = Math.max(0, Number(deduction) || 0);
            }
            if (finalSalary !== undefined && finalSalary !== null) {
                updates.finalSalary = Math.max(0, Number(finalSalary) || 0);
            } else if (updates.deduction !== undefined) {
                updates.finalSalary = Math.max(
                    0,
                    Math.round((run.monthlySalary - updates.deduction) * 100) / 100
                );
            }
        }

        const payroll = await PayrollRun.findByIdAndUpdate(run._id, updates, { new: true })
            .populate('teacher', 'name email')
            .populate('generatedBy', 'name email');
        res.json({ success: true, payroll });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update payroll' });
    }
});

router.patch('/accountant/payroll/runs/:id/mark-paid', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'stale') {
            return res.status(400).json({
                success: false,
                error: 'This payroll is out of date. Regenerate from approved attendance before marking paid.',
            });
        }
        if (run.status === 'paid') {
            return res.status(400).json({ success: false, error: 'Payroll is already marked paid.' });
        }
        if (run.status === 'rejected') {
            return res.status(400).json({
                success: false,
                error: 'Rejected payroll must be reviewed by admin before marking paid.',
            });
        }
        const actorId = req.portalActorId || req.user?.userId;
        const payroll = await PayrollRun.findByIdAndUpdate(
            run._id,
            { status: 'paid', paidAt: new Date(), paidBy: actorId, rejectedAt: null, rejectedBy: null },
            { new: true }
        )
            .populate('teacher', 'name email')
            .populate('paidBy', 'name email');
        res.json({ success: true, payroll });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to mark payroll paid' });
    }
});

router.patch('/accountant/payroll/runs/:id/reject', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const { note } = req.body;
        const trimmedNote = String(note || '').trim();
        if (!trimmedNote) {
            return res.status(400).json({ success: false, error: 'Rejection note is required' });
        }
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({ success: false, error: 'Paid payroll cannot be rejected.' });
        }
        const actorId = req.portalActorId || req.user?.userId;
        const teacherId = payrollRunTeacherId(run);
        const payroll = await PayrollRun.findByIdAndUpdate(
            run._id,
            {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectedBy: actorId,
                accountantNotes: trimmedNote,
                paidAt: null,
                paidBy: null,
            },
            { new: true }
        )
            .populate('teacher', 'name email')
            .populate('rejectedBy', 'name email');
        if (teacherId) {
            await TeacherAttendanceRequest.updateOne(
                { teacher: teacherId, monthKey: run.monthKey },
                { status: 'pending', reviewedBy: null, reviewedAt: null }
            );
        }
        res.json({ success: true, payroll });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to reject payroll' });
    }
});

router.delete('/accountant/payroll/runs/:id', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) {
            return res.status(404).json({ success: false, error: 'Payroll run not found' });
        }
        if (run.status === 'paid') {
            return res.status(400).json({
                success: false,
                error: 'Paid payroll runs cannot be deleted. Contact an admin if this record must be removed.',
            });
        }
        await PayrollRun.deleteOne({ _id: run._id });
        res.json({ success: true, message: 'Payroll run deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete payroll run' });
    }
});

router.get('/accountant/payroll/runs', allowPortalRoles('accountant'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }
        const runs = await PayrollRun.find(filter)
            .populate('teacher', 'name email')
            .populate('generatedBy', 'name email')
            .populate('paidBy', 'name email')
            .populate('rejectedBy', 'name email')
            .sort({ monthKey: -1, updatedAt: -1 })
            .limit(200);
        const teacherIds = runs.map((r) => r.teacher?._id || r.teacher).filter(Boolean);
        const profiles = await TeacherSalaryProfile.find({ teacher: { $in: teacherIds } });
        const profileByTeacher = new Map(profiles.map((p) => [String(p.teacher), p]));
        const enriched = runs.map((r) => {
            const plain = r.toObject();
            const tid = String(r.teacher?._id || r.teacher);
            const profile = profileByTeacher.get(tid);
            const teacher = payrollRunTeacherDisplay(r);
            return {
                ...plain,
                teacher,
                profileSalary: profile?.monthlySalary ?? null,
                profileWorkingDays: profile?.workingDays ?? null,
            };
        });
        res.json({ success: true, runs: enriched });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to load payroll runs' });
    }
});

// Legacy admin link endpoint (portal path)
router.post('/admin/link-parent-student', allowRoles('manager', 'super-admin'), async (req, res) => {
    try {
        const { parentId, studentId, relation = 'guardian' } = req.body;
        if (!parentId || !studentId) {
            return res.status(400).json({ success: false, error: 'parentId and studentId are required' });
        }
        const parent = await User.findOne({ _id: parentId, role: 'parent', ...activeUserFilter() });
        const student = await User.findOne({ _id: studentId, role: 'student', ...activeUserFilter() });
        if (!parent || !student) {
            return res.status(400).json({ success: false, error: 'Invalid or removed parent/student' });
        }
        const link = await ParentStudentLink.findOneAndUpdate(
            { parent: parentId, student: studentId },
            { relation },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to link parent and student' });
    }
});

module.exports = router;
