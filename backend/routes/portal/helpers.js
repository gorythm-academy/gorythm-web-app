const Enrollment = require('../../models/Enrollment');
const Course = require('../../models/Course');
const User = require('../../models/User');
const ParentStudentLink = require('../../models/ParentStudentLink');
const AttendanceRecord = require('../../models/AttendanceRecord');
const Quiz = require('../../models/Quiz');
const {
    getActiveCourseRosterStudents,
    getActiveCourseRosterStudentIds,
} = require('../../services/courseRoster');
const {
    isoDateKey,
    startOfDay,
    monthBounds,
} = require('../../services/teacherAttendanceCalendar');
const { enrichEnrollmentsWithPaymentStatus } = require('../../services/enrollmentPaymentStatus');
const { activeEnrollmentFilter } = require('../../utils/enrollmentQuery');
const { activeCourseFilter, isCourseTrashed } = require('../../utils/courseQuery');
const { activeUserFilter, isUserTrashed } = require('../../utils/userQuery');
const { activeLmsFilter } = require('../../utils/lmsTrashQuery');
const { assertTeacherOwnsCourse, getTeacherCourseIds } = require('../../services/teacherCourseAccess');
const { buildDueDateExtensionNotice, mapSubmissionForPortal } = require('../../utils/lmsContentRules');

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function withActiveEnrollments(studentId, extra = {}) {
    return { student: studentId, ...activeEnrollmentFilter(), ...extra };
}

function dropTrashedCourses(enrollments = []) {
    return enrollments.filter((e) => e.course && !isCourseTrashed(e.course));
}

function unauthorized(res) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
}

function mapAssignmentForPortal(assignment, { viewerRole = 'student', submission = null, submissionRemovedAt = null } = {}) {
    const obj = assignment.toObject ? assignment.toObject() : { ...assignment };
    return {
        ...obj,
        submission: mapSubmissionForPortal(submission),
        submissionRemovedAt: submissionRemovedAt || null,
        dueDateNotice: buildDueDateExtensionNotice(obj, { viewerRole }),
    };
}

/** Same enrollment rows as Fees tab (active enrollments + payment status). */
async function loadStudentDisplayEnrollments(studentId, email) {
    const enrollmentsRaw = await Enrollment.find(withActiveEnrollments(studentId))
        .populate('course', 'title category price deletedAt')
        .populate({
            path: 'assignedSchedule',
            populate: { path: 'teacher', select: 'name deletedAt' },
        })
        .sort({ updatedAt: -1 })
        .lean();
    return dropTrashedCourses(await enrichEnrollmentsWithPaymentStatus(enrollmentsRaw, studentId, email)).filter(
        (e) => e.course
    );
}

function isPaidEnrollment(enrollment) {
    return enrollment.paymentStatus === 'paid';
}

function normalizeStudentScheduleSlot(scheduleDoc) {
    if (!scheduleDoc || !scheduleDoc.teacher || isUserTrashed(scheduleDoc.teacher)) return null;
    return {
        _id: scheduleDoc._id,
        dayOfWeek: scheduleDoc.dayOfWeek,
        startTime: scheduleDoc.startTime,
        endTime: scheduleDoc.endTime,
        roomOrLink: scheduleDoc.roomOrLink || '',
        teacher: scheduleDoc.teacher,
    };
}

/** Weekly timetable rows: paid enrollments only (matches fee-paid courses in Fees tab). */
function buildStudentWeeklyTimetable(enrollments) {
    return enrollments
        .filter(isPaidEnrollment)
        .map((e) => {
            const schedule = normalizeStudentScheduleSlot(e.assignedSchedule);
            return {
                enrollmentId: e._id,
                course: e.course,
                paymentStatus: e.paymentStatus,
                schedule,
                hasTimeslot: Boolean(schedule),
                sortDay: schedule?.dayOfWeek ?? 99,
                sortTime: schedule?.startTime ?? '',
            };
        })
        .sort((a, b) => {
            if (a.hasTimeslot !== b.hasTimeslot) return a.hasTimeslot ? -1 : 1;
            if (a.hasTimeslot && b.hasTimeslot) {
                return a.sortDay - b.sortDay || String(a.sortTime).localeCompare(String(b.sortTime));
            }
            return (a.course?.title || '').localeCompare(b.course?.title || '');
        });
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

async function assertTeacherOwnsAssignment(teacherId, assignment) {
    if (String(assignment.teacher) !== String(teacherId)) {
        const err = new Error('Assignment not found');
        err.status = 404;
        throw err;
    }
    await assertTeacherOwnsCourse(teacherId, assignment.course);
}

async function findQuizForTeacher(teacherId, quizId) {
    if (!teacherId) return null;
    const courseIds = await getTeacherCourseIds(teacherId);
    return Quiz.findOne({
        _id: quizId,
        ...teacherQuizScopeFilter(teacherId, courseIds),
        ...activeLmsFilter(),
    });
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

module.exports = {
    DAY_LABELS,
    withActiveEnrollments,
    dropTrashedCourses,
    unauthorized,
    mapAssignmentForPortal,
    loadStudentDisplayEnrollments,
    buildStudentWeeklyTimetable,
    getStudentCourseIds,
    assertParentChild,
    parseAttendanceAnchor,
    dayRange,
    isAcademyWeekendDate,
    isFutureAttendanceDate,
    teacherQuizScopeFilter,
    assertTeacherOwnsAssignment,
    findQuizForTeacher,
    normalizeQuizQuestions,
    dedupeAttendanceRecords,
    attendancePresentRate,
    attendancePeriodBounds,
    emptyAttendanceCounts,
    daysInRange,
    countWeekendDaysInPeriod,
    summarizeAttendanceByDay,
    buildAttendanceSummaryRows,
    buildStudentAttendanceSummaryRows,
    parentNamesByStudentIds,
    filterAttendanceForActiveStudents,
    filterAttendanceRecordsForActiveIds,
    loadTeacherAttendancePeriodView,
    loadStudentAttendancePeriodView,
};
