/**
 * Live heal + verify Students bugs after fixes.
 * Run: node backend/scripts/liveStudentsBugProbe.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
require('../models/Course');
require('../models/ClassSchedule');
const { activeEnrollmentFilter, trashedEnrollmentFilter } = require('../utils/enrollmentQuery');
const { isUnsetPortalEmail } = require('../utils/studentPortalEmail');
const { isPendingSetup } = require('../utils/enrollmentStudentsList');
const { enrichEnrollmentsWithPaymentStatus } = require('../services/enrollmentPaymentStatus');
const { attachTeachersToEnrollments } = require('../services/courseTeachers');
const { syncAllRostersFromEnrollments } = require('../utils/enrollmentOrphanCleanup');
const { ensureStudentId } = require('../utils/studentIdGenerator');

const STUDENT_POPULATE = 'name email personalEmail phone avatar studentId isActive canLogin status createdAt deletedAt';

function portalEmailDisplayLabel(email) {
    if (isUnsetPortalEmail(email)) return 'Not assigned yet';
    const trimmed = String(email || '').trim();
    return trimmed || 'Not assigned yet';
}

function resolveRowStudent(enrollment, overlayStudent) {
    const raw = enrollment?.student;
    if (raw && typeof raw === 'object' && (raw.name || raw.email || raw.studentId || raw._id)) {
        return {
            ...overlayStudent,
            ...raw,
            name: raw.name || overlayStudent?.name,
            studentId: raw.studentId || overlayStudent?.studentId,
            email: raw.email || overlayStudent?.email,
        };
    }
    return overlayStudent || {};
}

async function simulateDetailEndpoint(student) {
    const filter = { student: student._id, ...activeEnrollmentFilter() };
    const enrollments = await Enrollment.find(filter)
        .populate('student', STUDENT_POPULATE)
        .populate({
            path: 'course',
            select: 'title category instructorName instructor students deletedAt',
            populate: { path: 'instructor', select: 'name' },
        })
        .populate({ path: 'assignedSchedule', populate: { path: 'teacher', select: 'name email' } })
        .sort({ enrollmentDate: -1 });

    const enriched = await enrichEnrollmentsWithPaymentStatus(enrollments);
    const withTeachers = await attachTeachersToEnrollments(enriched);
    const studentObj = student.toObject ? student.toObject() : student;
    const rows = withTeachers.map((row) => {
        const plain = { ...row };
        if (!plain.student || !plain.student.name) plain.student = studentObj;
        return plain;
    });

    return rows.map((e) => {
        const rowStudent = resolveRowStudent(e, studentObj);
        return {
            course: e.course?.title || null,
            tableName: rowStudent.name || 'Unknown Student',
            tableRoll: rowStudent.studentId || '—',
            tablePortal: portalEmailDisplayLabel(rowStudent.email),
            unknownBug: !(rowStudent.name),
            populated: Boolean(e.student?.name),
        };
    });
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

    console.log('=== HEAL: sync rosters + assign missing roll numbers ===');
    const roster = await syncAllRostersFromEnrollments();
    const students = await User.find({ role: 'student' });
    const assigned = [];
    for (const s of students) {
        const before = s.studentId;
        const id = await ensureStudentId(s._id);
        if (!before && id) assigned.push({ name: s.name, studentId: id });
    }
    console.log({ roster, newlyAssignedRolls: assigned });

    const refreshed = await User.find({ role: 'student' })
        .select('name email personalEmail studentId canLogin isActive status enrolledCourses');

    console.log('\n=== VERIFY DETAIL OVERLAY PATH ===');
    let unknownCount = 0;
    let pendingFalsePositives = 0;
    let ghostCards = 0;
    let sameCourseActiveAndTrash = 0;

    for (const s of refreshed) {
        const active = await Enrollment.find({ student: s._id, ...activeEnrollmentFilter() })
            .populate('course', 'title')
            .select('course');
        const trash = await Enrollment.find({ student: s._id, ...trashedEnrollmentFilter() })
            .populate('course', 'title')
            .select('course');

        const detailRows = await simulateDetailEndpoint(s);
        const anyUnknown = detailRows.some((r) => r.tableName === 'Unknown Student');
        if (anyUnknown) unknownCount += 1;

        const pending = isPendingSetup(s);
        if (pending && !isUnsetPortalEmail(s.email)) pendingFalsePositives += 1;
        if (active.length === 0) ghostCards += 1;

        const activeCourseIds = new Set(active.map((e) => String(e.course?._id || e.course)));
        const trashOverlap = trash.filter((e) => activeCourseIds.has(String(e.course?._id || e.course)));
        if (trashOverlap.length) sameCourseActiveAndTrash += 1;

        console.log({
            name: s.name,
            roll: s.studentId,
            pendingSetup: pending,
            unsetPortal: isUnsetPortalEmail(s.email),
            enrolledCoursesLen: (s.enrolledCourses || []).length,
            activeRows: active.length,
            trashRows: trash.length,
            trashOverlapCourses: trashOverlap.map((e) => e.course?.title),
            detailSample: detailRows[0] || null,
            unknownBug: anyUnknown,
        });
    }

    console.log('\n=== SUMMARY ===');
    console.log({
        students: refreshed.length,
        unknownNameBugs: unknownCount,
        pendingSetupFalsePositives: pendingFalsePositives,
        studentsWithZeroEnrollments: ghostCards,
        studentsWithSameCourseInActiveAndTrash: sameCourseActiveAndTrash,
        allHaveRoll: refreshed.every((s) => !!s.studentId),
        PASS: unknownCount === 0 && pendingFalsePositives === 0 && refreshed.every((s) => !!s.studentId),
    });

    await mongoose.disconnect();
    if (unknownCount > 0 || pendingFalsePositives > 0) process.exit(1);
}

main().catch(async (e) => {
    console.error(e);
    try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
    process.exit(1);
});
