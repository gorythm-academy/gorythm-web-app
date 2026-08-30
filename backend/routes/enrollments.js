const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const ClassSchedule = require('../models/ClassSchedule');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const { enrichEnrollmentsWithPaymentStatus } = require('../services/enrollmentPaymentStatus');
const { attachTeachersToEnrollments } = require('../services/courseTeachers');
const { syncStudentUserLoginFromAllEnrollments } = require('../services/syncStudentAccountLogin');
const {
    normalizeEnrollmentStatusInput,
    buildVisibleListFilter,
    appendSearchToFilter,
    queryEnrollmentsAdminList,
} = require('../utils/enrollmentAdminList');
const { activeEnrollmentFilter, trashedEnrollmentFilter } = require('../utils/enrollmentQuery');
const { activeUserFilter } = require('../utils/userQuery');
const { activeCourseFilter } = require('../utils/courseQuery');
const {
    syncStudentRosterFromEnrollments,
} = require('../services/enrollmentRosterSync');
const { ensureStudentId } = require('../utils/studentIdGenerator');
const {
    buildEnrollmentMatchForStudentIds,
    isPendingSetup,
    queryStudentUsers,
    countStudentsWithTrashedEnrollments,
    countTrashedStudentUsers,
    countEnrollmentStats,
} = require('../utils/enrollmentStudentsList');
const {
    assertStudentScheduleAvailable,
    findStudentScheduleConflict,
    studentScheduleConflictMessage,
} = require('../utils/enrollmentScheduleRules');
const ParentStudentLink = require('../models/ParentStudentLink');
router.use(authMiddleware);
router.use(validateSessionUser);
router.use(allowRoles('super-admin', 'manager'));
const STUDENT_POPULATE = 'name email personalEmail phone avatar studentId isActive canLogin status createdAt deletedAt lastLogin';
const STUDENT_POPULATE_WITH_ENROLLED = `${STUDENT_POPULATE} enrolledCourses`;

async function loadParentsByStudentIds(studentIds) {
    const map = new Map();
    if (!studentIds?.length) return map;
    const links = await ParentStudentLink.find({ student: { $in: studentIds } })
        .populate('parent', 'name email')
        .lean();
    for (const link of links) {
        const sid = String(link.student);
        if (!map.has(sid)) map.set(sid, []);
        const parent = link.parent;
        if (!parent) continue;
        map.get(sid).push({
            _id: parent._id,
            name: parent.name || 'Parent',
            email: parent.email || '',
            relation: link.relation || '',
        });
    }
    return map;
}
const coursePopulate = () => ({
    path: 'course',
    select: 'title category instructorName instructor students deletedAt',
    populate: { path: 'instructor', select: 'name' },
});

const assignedSchedulePopulate = () => ({
    path: 'assignedSchedule',
    populate: { path: 'teacher', select: 'name email' },
});

const enrollmentPopulate = () => [
    { path: 'student', select: STUDENT_POPULATE },
    coursePopulate(),
    assignedSchedulePopulate(),
];

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ALLOWED_FEE_STATUSES = ['paid', 'pending', 'failed', 'refunded'];

async function requireTimeslotIfCourseHasSlots(courseId, assignedScheduleId) {
    if (!courseId) return null;
    const slotCount = await ClassSchedule.countDocuments({ course: courseId });
    if (slotCount > 0 && !assignedScheduleId) {
        return 'Please select a class timeslot for this course.';
    }
    return null;
}

/** Active enrollment for same student+course (optionally excluding one row). */
async function findActiveDuplicateEnrollment(studentId, courseId, excludeId = null) {
    if (!studentId || !courseId) return null;
    const query = {
        student: studentId,
        course: courseId,
        ...activeEnrollmentFilter(),
    };
    if (excludeId) query._id = { $ne: excludeId };
    return Enrollment.findOne(query).select('_id');
}

const syncLoginForStudentIds = async (studentIds = []) => {
    const unique = [...new Set(studentIds.map((id) => String(id)).filter(Boolean))];
    await Promise.all(unique.map((id) => syncStudentUserLoginFromAllEnrollments(id)));
};

// Get all enrollments (admin only) — read-only; no maintenance mutations on list fetch
router.get('/', async (req, res) => {
    try {
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const filter = trash ? trashedEnrollmentFilter() : activeEnrollmentFilter();
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(5000, Math.max(10, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;
        const search = String(req.query.search || '').trim().toLowerCase();
        const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
        const feeStatusFilter = String(req.query.feeStatus || 'all').trim().toLowerCase();
        const sortBy = String(req.query.sortBy || 'enrollmentDate');
        const sortOrder = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
        const studentUserId = String(req.query.studentUserId || '').trim();

        const listFilter = { ...filter };
        if (studentUserId && mongoose.Types.ObjectId.isValid(studentUserId)) {
            listFilter.student = studentUserId;
        }
        if (statusFilter && statusFilter !== 'all') {
            if (statusFilter === 'inactive') {
                listFilter.status = { $in: ['inactive', 'pending', null] };
            } else if (['active', 'completed'].includes(statusFilter)) {
                listFilter.status = statusFilter;
            }
        }
        if (feeStatusFilter && feeStatusFilter !== 'all' && ALLOWED_FEE_STATUSES.includes(feeStatusFilter)) {
            if (feeStatusFilter === 'pending') {
                listFilter.paymentStatus = { $in: ['pending', null] };
            } else {
                listFilter.paymentStatus = feeStatusFilter;
            }
        }

        const listFilterVisible = await buildVisibleListFilter(listFilter, trash);

        const populateEnrollments = (query) =>
            query
                .populate('student', STUDENT_POPULATE)
                .populate(coursePopulate())
                .populate(assignedSchedulePopulate());

        const { total, enrollments } = await queryEnrollmentsAdminList({
            listFilter: listFilterVisible,
            search,
            sortBy,
            sortOrder,
            skip,
            limit,
            queryFactory: populateEnrollments,
        });

        const trashCount = await Enrollment.countDocuments(trashedEnrollmentFilter());

        const enriched = await enrichEnrollmentsWithPaymentStatus(enrollments);
        const withTeachers = await attachTeachersToEnrollments(enriched);

        res.json({
            success: true,
            enrollments: withTeachers,
            count: withTeachers.length,
            total,
            page,
            limit,
            trashCount,
            exportTruncated: false,
        });
    } catch (error) {
        req.log.error('Error fetching enrollments', { err: error });
        res.status(500).json({
            success: false,
            message: 'Error fetching enrollments',
            error: error.message
        });
    }
});

// Class schedule slots for a course (admin: assign timeslot to student)
router.get('/course-schedules/:courseId', async (req, res) => {
    try {
        const course = await Course.findOne({
            _id: req.params.courseId,
            ...activeCourseFilter(),
        }).select('title');
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }
        const schedules = await ClassSchedule.find({ course: course._id })
            .populate('teacher', 'name email')
            .sort({ dayOfWeek: 1, startTime: 1 });
        res.json({ success: true, schedules, dayLabels: DAY_LABELS, course });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to load course schedules' });
    }
});

// Paginated student cards: Users (students) + their enrollment rows
router.get('/students', async (req, res) => {
    try {
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const trashStudents = req.query.trashStudents === 'true' || req.query.trashStudents === '1';
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        // Allow PAGE_SIZE=9 (and similar) from the Students admin tab
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;
        const search = String(req.query.search || '').trim();
        // Quarantine lists — status/fee filters apply only to Active tab
        const statusFilter = (trash || trashStudents)
            ? 'all'
            : String(req.query.status || 'all').trim().toLowerCase();
        const feeStatusFilter = (trash || trashStudents)
            ? 'all'
            : String(req.query.feeStatus || 'all').trim().toLowerCase();
        const sortBy = String(req.query.sortBy || 'studentId').trim();
        const sortOrder = String(req.query.sortOrder || 'asc').trim().toLowerCase() === 'desc'
            ? 'desc'
            : 'asc';
        const includeCounts = req.query.includeCounts === 'true' || req.query.includeCounts === '1';

        const { total: totalStudents, users } = await queryStudentUsers({
            search,
            skip,
            limit,
            trash: trash && !trashStudents,
            trashStudents,
            sortBy,
            sortOrder,
        });

        const studentIds = users.map((u) => u._id);
        let enrollments = [];

        // Quarantine students = account archive → show their soft-deleted course rows
        const enrollmentTrash = trash || trashStudents;

        if (studentIds.length) {
            const enrFilter = buildEnrollmentMatchForStudentIds(studentIds, {
                trash: enrollmentTrash,
                statusFilter,
                feeStatusFilter,
            });
            // Card list: lean rows — full detail stays on GET /student/:id
            enrollments = await Enrollment.find(enrFilter)
                .select('student course status paymentStatus enrollmentDate deletedAt')
                .populate('course', 'title _id deletedAt')
                .sort({ enrollmentDate: -1 })
                .lean();
        }

        const normalizedEnrollments = enrollments.map((row) => {
            const stored = row.paymentStatus;
            const paymentStatus = stored && ALLOWED_FEE_STATUSES.includes(stored) ? stored : 'pending';
            return { ...row, paymentStatus };
        });

        const parentsByStudent = await loadParentsByStudentIds(studentIds);

        const byStudent = new Map();
        for (const row of normalizedEnrollments) {
            const sid = String(row.student?._id || row.student);
            if (!byStudent.has(sid)) byStudent.set(sid, []);
            byStudent.get(sid).push(row);
        }

        const students = users.map((user) => ({
            student: user,
            enrollments: byStudent.get(String(user._id)) || [],
            parents: parentsByStudent.get(String(user._id)) || [],
            pendingSetup: isPendingSetup(user),
        }));

        let trashCount;
        let trashStudentCount;
        let trashStudentsAccountCount;
        if (includeCounts) {
            [trashCount, trashStudentCount, trashStudentsAccountCount] = await Promise.all([
                Enrollment.countDocuments(trashedEnrollmentFilter()),
                countStudentsWithTrashedEnrollments(),
                countTrashedStudentUsers(),
            ]);
        }

        let totalRows = 0;
        if (studentIds.length) {
            const rowFilter = buildEnrollmentMatchForStudentIds(studentIds, {
                trash: enrollmentTrash,
                statusFilter,
                feeStatusFilter,
            });
            totalRows = await Enrollment.countDocuments(rowFilter);
        }

        res.json({
            success: true,
            students,
            totalStudents,
            totalRows,
            page,
            limit,
            ...(includeCounts ? {
                trashCount,
                trashStudentCount,
                trashStudentsAccountCount,
            } : {}),
            sortBy,
            sortOrder,
        });
    } catch (error) {
        req.log.error('Error fetching student cards', { err: error });
        res.status(500).json({
            success: false,
            message: 'Error fetching students',
            error: error.message,
        });
    }
});

// Lightweight enrollments for one student (overlay) — no list maintenance
router.get('/student/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        if (!mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ success: false, message: 'Invalid student id' });
        }

        const student = await User.findOne({
            _id: studentId,
            role: 'student',
        }).select(STUDENT_POPULATE);

        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const filter = trash ? trashedEnrollmentFilter() : activeEnrollmentFilter();
        filter.student = studentId;

        const enrollments = await Enrollment.find(filter)
            .populate('student', STUDENT_POPULATE)
            .populate(coursePopulate())
            .populate(assignedSchedulePopulate())
            .sort({ enrollmentDate: -1 });

        const enriched = await enrichEnrollmentsWithPaymentStatus(enrollments);
        const withTeachers = await attachTeachersToEnrollments(enriched);

        // Always attach the known student object so UI never shows "Unknown"
        const studentObj = student.toObject ? student.toObject() : student;
        const parentsByStudent = await loadParentsByStudentIds([studentId]);
        const parents = parentsByStudent.get(String(studentId)) || [];
        studentObj.parents = parents;

        const rows = withTeachers.map((row) => {
            const plain = row && typeof row === 'object' ? { ...row } : row;
            if (!plain.student || !plain.student.name) {
                plain.student = studentObj;
            }
            return plain;
        });

        const quarantineCount = await Enrollment.countDocuments({
            student: studentId,
            ...trashedEnrollmentFilter(),
        });

        res.json({
            success: true,
            student: studentObj,
            parents,
            enrollments: rows,
            total: rows.length,
            quarantineCount,
            pendingSetup: isPendingSetup(studentObj),
        });
    } catch (error) {
        req.log.error('Error fetching student enrollments', { err: error });
        res.status(500).json({
            success: false,
            message: 'Error fetching student enrollments',
            error: error.message,
        });
    }
});

// Assign a course to an existing student (reuses placeholder row when course is null)
router.post('/', async (req, res) => {
    try {
        const {
            studentUserId,
            courseId,
            status,
            progress,
            grade,
            enrollmentDate,
            paymentStatus,
            assignedScheduleId,
        } = req.body;

        if (!studentUserId || !courseId) {
            return res.status(400).json({
                success: false,
                message: 'Student and course are required'
            });
        }

        const normalizedStatus = normalizeEnrollmentStatusInput(status);

        // Validate course exists
        const course = await Course.findOne({ _id: courseId, ...activeCourseFilter() });
        if (!course) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        // Validate student exists and has student role
        const student = await User.findById(studentUserId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        if (student.role !== 'student') {
            return res.status(400).json({ success: false, message: 'Selected user is not a student' });
        }
        if (student.deletedAt) {
            return res.status(400).json({ success: false, message: 'Student is in trash. Restore the account first.' });
        }

        // Check if already enrolled in this course
        const alreadyEnrolled = await Enrollment.findOne({
            student: student._id,
            course: courseId,
            ...activeEnrollmentFilter(),
        });
        if (alreadyEnrolled) {
            return res.status(400).json({ success: false, message: 'Student is already enrolled in this course' });
        }

        const trashedTwin = await Enrollment.findOne({
            student: student._id,
            course: courseId,
            ...trashedEnrollmentFilter(),
        }).select('_id');
        if (trashedTwin && req.body.confirmRestoreTrashed !== true && req.body.confirmRestoreTrashed !== 'true') {
            return res.status(409).json({
                success: false,
                code: 'TRASHED_COURSE_EXISTS',
                message:
                    'This student already has this course in Quarantine. Restore that enrollment, or send confirmRestoreTrashed=true to create a new active row anyway.',
                trashedEnrollmentId: trashedTwin._id,
            });
        }

        let assignedSchedule = null;
        if (assignedScheduleId) {
            const schedule = await ClassSchedule.findById(assignedScheduleId);
            if (!schedule) {
                return res.status(404).json({ success: false, message: 'Schedule slot not found' });
            }
            if (String(schedule.course) !== String(courseId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Selected timeslot does not belong to this course',
                });
            }
            assignedSchedule = schedule._id;
        }

        const timeslotRequired = await requireTimeslotIfCourseHasSlots(courseId, assignedSchedule);
        if (timeslotRequired) {
            return res.status(400).json({ success: false, message: timeslotRequired });
        }

        if (assignedSchedule) {
            try {
                await assertStudentScheduleAvailable(student._id, assignedSchedule);
            } catch (error) {
                if (error.status === 400) {
                    return res.status(400).json({ success: false, message: error.message });
                }
                throw error;
            }
        }

        const feeStatus = ALLOWED_FEE_STATUSES.includes(paymentStatus) ? paymentStatus : 'pending';

        // Only fill a course:null placeholder when this student has NO course enrollments yet.
        // If they already have any course, always create a NEW row (never overwrite).
        const existingCourseCount = await Enrollment.countDocuments({
            student: student._id,
            course: { $ne: null, $exists: true },
            ...activeEnrollmentFilter(),
        });

        const forceNew = req.body.forceNew === true || req.body.forceNew === 'true' || existingCourseCount > 0;

        const placeholder = forceNew
            ? null
            : await Enrollment.findOne({
                student: student._id,
                $or: [{ course: null }, { course: { $exists: false } }],
                ...activeEnrollmentFilter(),
            });

        let enrollment;
        if (placeholder) {
            placeholder.course = courseId;
            placeholder.deletedAt = null;
            placeholder.status = normalizedStatus;
            placeholder.progress = progress || 0;
            placeholder.grade = grade || null;
            placeholder.enrollmentDate = enrollmentDate ? new Date(enrollmentDate) : new Date();
            placeholder.lastAccessed = new Date();
            placeholder.paymentStatus = feeStatus;
            placeholder.assignedSchedule = assignedSchedule;
            await placeholder.save();
            enrollment = placeholder;
        } else {
            enrollment = await Enrollment.create({
                student: student._id,
                course: courseId,
                status: normalizedStatus,
                progress: progress || 0,
                grade: grade || null,
                enrollmentDate: enrollmentDate ? new Date(enrollmentDate) : new Date(),
                lastAccessed: new Date(),
                paymentStatus: feeStatus,
                assignedSchedule,
            });
        }

        await syncStudentRosterFromEnrollments(student._id);
        await ensureStudentId(student._id);
        await syncStudentUserLoginFromAllEnrollments(student._id);

        const populatedEnrollment = await Enrollment.findById(enrollment._id).populate(enrollmentPopulate());

        res.status(201).json({
            success: true,
            message: 'Student enrolled successfully',
            enrollment: populatedEnrollment
        });
    } catch (error) {
        req.log.error('Enrollment error', { err: error });
        res.status(500).json({
            success: false,
            message: 'Error creating enrollment',
            error: error.message
        });
    }
});

// Update enrollment (status, progress, grade, course change, enrollmentDate)
router.put('/:id', async (req, res) => {
    try {
        const { status, progress, grade, lastAccessed, courseId, enrollmentDate, paymentStatus, assignedScheduleId } = req.body;

        const enrollment = await Enrollment.findOne({
            _id: req.params.id,
            ...activeEnrollmentFilter(),
        })
            .populate('student', STUDENT_POPULATE_WITH_ENROLLED)
            .populate(coursePopulate());

        if (!enrollment) {
            return res.status(404).json({ success: false, message: 'Enrollment not found' });
        }

        let courseWasChanged = false;

        // Handle course change (admin should use Add course; reject accidental overwrites via API)
        if (courseId && String(courseId) !== String(enrollment.course?._id)) {
            return res.status(400).json({
                success: false,
                message: 'Course cannot be changed on this enrollment. Use Add course for a different course.',
            });
        }

        const slotWasTouched = assignedScheduleId !== undefined;
        if (slotWasTouched) {
            if (!assignedScheduleId) {
                enrollment.assignedSchedule = null;
            } else {
                const schedule = await ClassSchedule.findById(assignedScheduleId);
                const activeCourseId = enrollment.course?._id || enrollment.course;
                if (!schedule) {
                    return res.status(404).json({ success: false, message: 'Schedule slot not found' });
                }
                if (!activeCourseId || String(schedule.course) !== String(activeCourseId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Selected timeslot does not belong to this course',
                    });
                }
                enrollment.assignedSchedule = schedule._id;
            }
        }

        // Timeslot required only when course or schedule is changing — not for status/fee-only updates
        if (courseWasChanged || slotWasTouched) {
            const activeCourseIdForSlot = enrollment.course?._id || enrollment.course;
            const timeslotRequired = await requireTimeslotIfCourseHasSlots(
                activeCourseIdForSlot,
                enrollment.assignedSchedule
            );
            if (timeslotRequired) {
                return res.status(400).json({ success: false, message: timeslotRequired });
            }
        }

        if (slotWasTouched && enrollment.assignedSchedule) {
            try {
                const studentId = enrollment.student?._id || enrollment.student;
                await assertStudentScheduleAvailable(studentId, enrollment.assignedSchedule, {
                    exceptEnrollmentId: enrollment._id,
                });
            } catch (error) {
                if (error.status === 400) {
                    return res.status(400).json({ success: false, message: error.message });
                }
                throw error;
            }
        }

        if (status !== undefined) enrollment.status = normalizeEnrollmentStatusInput(status);
        if (paymentStatus !== undefined) {
            if (ALLOWED_FEE_STATUSES.includes(paymentStatus)) enrollment.paymentStatus = paymentStatus;
        }
        if (progress !== undefined) enrollment.progress = progress;
        if (grade !== undefined) enrollment.grade = grade;
        if (enrollmentDate) enrollment.enrollmentDate = new Date(enrollmentDate);
        enrollment.lastAccessed = lastAccessed ? new Date(lastAccessed) : new Date();
        if (status === 'completed') enrollment.completionDate = new Date();

        await enrollment.save();

        if (status !== undefined && enrollment.student) {
            const studentId = enrollment.student._id || enrollment.student;
            await syncStudentUserLoginFromAllEnrollments(studentId);
        }

        const populated = await Enrollment.findById(enrollment._id).populate(enrollmentPopulate());

        res.json({
            success: true,
            message: 'Enrollment updated successfully',
            enrollment: populated
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating enrollment',
            error: error.message
        });
    }
});

// Restore enrollment from trash
router.patch('/:id/restore', async (req, res) => {
    try {
        const pending = await Enrollment.findOne({
            _id: req.params.id,
            ...trashedEnrollmentFilter(),
        });
        if (!pending) {
            return res.status(404).json({ success: false, message: 'Enrollment not found in trash' });
        }

        const student = await User.findOne({ _id: pending.student, ...activeUserFilter() });
        if (!student) {
            return res.status(400).json({
                success: false,
                message: 'Cannot restore enrollment while the student is in trash. Restore the student first.',
            });
        }
        if (pending.course) {
            const course = await Course.findOne({
                _id: pending.course,
                ...activeCourseFilter(),
            }).select('_id');
            if (!course) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot restore enrollment while the course is in trash. Restore the course first.',
                });
            }
            const duplicate = await findActiveDuplicateEnrollment(pending.student, pending.course, pending._id);
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot restore: student already has an active enrollment for this course. Remove or quarantine the active row first.',
                });
            }
            if (pending.assignedSchedule) {
                const scheduleConflict = await findStudentScheduleConflict(
                    pending.student,
                    pending.assignedSchedule,
                    { exceptEnrollmentId: pending._id }
                );
                if (scheduleConflict) {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot restore: ${studentScheduleConflictMessage(scheduleConflict)}`,
                    });
                }
            }
        }

        const enrollment = await Enrollment.findOneAndUpdate(
            { _id: req.params.id, ...trashedEnrollmentFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );
        if (!enrollment) {
            return res.status(404).json({ success: false, message: 'Enrollment not found in trash' });
        }

        if (enrollment.course && enrollment.student) {
            await syncStudentRosterFromEnrollments(enrollment.student);
        }
        if (enrollment.student) {
            await syncStudentUserLoginFromAllEnrollments(enrollment.student);
        }
        res.json({ success: true, message: 'Enrollment restored' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error restoring enrollment' });
    }
});

// Permanently delete enrollment (must be in trash)
router.delete('/:id/permanent', async (req, res) => {
    try {
        const enrollment = await Enrollment.findOneAndDelete({
            _id: req.params.id,
            ...trashedEnrollmentFilter(),
        });

        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment must be in trash before permanent delete',
            });
        }

        if (enrollment.student) {
            await syncStudentRosterFromEnrollments(enrollment.student);
            await syncStudentUserLoginFromAllEnrollments(enrollment.student);
        }

        res.json({
            success: true,
            message: 'Enrollment permanently deleted',
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error permanently deleting enrollment' });
    }
});

// Soft-delete enrollment (move to trash)
router.delete('/:id', async (req, res) => {
    try {
        const enrollment = await Enrollment.findOneAndUpdate(
            { _id: req.params.id, ...activeEnrollmentFilter() },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );

        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found',
            });
        }

        if (enrollment.student) {
            await syncStudentRosterFromEnrollments(enrollment.student);
            await syncStudentUserLoginFromAllEnrollments(enrollment.student);
        }

        res.json({
            success: true,
            message: 'Enrollment moved to trash',
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting enrollment',
            error: error.message,
        });
    }
});

// Bulk soft-delete enrollments (move to trash)
router.post('/bulk-trash', async (req, res) => {
    try {
        const { enrollmentIds } = req.body;
        if (!enrollmentIds?.length) {
            return res.status(400).json({ success: false, message: 'No enrollments selected' });
        }

        const results = await Promise.allSettled(
            enrollmentIds.map(async (id) => {
                const enrollment = await Enrollment.findOneAndUpdate(
                    { _id: id, ...activeEnrollmentFilter() },
                    { $set: { deletedAt: new Date() } },
                    { new: true }
                );
                if (!enrollment) {
                    throw new Error('Enrollment not found');
                }
                if (enrollment.student) {
                    await syncStudentRosterFromEnrollments(enrollment.student);
                }
                return enrollment.student;
            })
        );

        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - succeeded;
        await syncLoginForStudentIds(
            results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
        );

        res.json({
            success: failed === 0,
            message:
                failed > 0
                    ? `${succeeded} moved to trash, ${failed} failed`
                    : `${succeeded} enrollment(s) moved to trash`,
            succeeded,
            failed,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error moving enrollments to trash' });
    }
});

// Bulk restore enrollments from trash
router.post('/bulk-restore', async (req, res) => {
    try {
        const { enrollmentIds } = req.body;
        if (!enrollmentIds?.length) {
            return res.status(400).json({ success: false, message: 'No enrollments selected' });
        }

        const results = await Promise.allSettled(
            enrollmentIds.map(async (id) => {
                const enrollment = await Enrollment.findOneAndUpdate(
                    { _id: id, ...trashedEnrollmentFilter() },
                    { $set: { deletedAt: null } },
                    { new: true }
                );
                if (!enrollment) throw new Error('Enrollment not found in trash');

                const student = await User.findOne({ _id: enrollment.student, ...activeUserFilter() });
                if (!student) {
                    throw new Error('Student is in trash — restore the student first');
                }
                if (enrollment.course) {
                    const course = await Course.findOne({
                        _id: enrollment.course,
                        ...activeCourseFilter(),
                    }).select('_id');
                    if (!course) {
                        throw new Error('Course is in trash — restore the course first');
                    }
                    const duplicate = await findActiveDuplicateEnrollment(
                        enrollment.student,
                        enrollment.course,
                        enrollment._id
                    );
                    if (duplicate) {
                        await Enrollment.updateOne(
                            { _id: enrollment._id },
                            { $set: { deletedAt: new Date() } }
                        );
                        throw new Error('Already has an active enrollment for this course');
                    }
                    if (enrollment.assignedSchedule) {
                        const scheduleConflict = await findStudentScheduleConflict(
                            enrollment.student,
                            enrollment.assignedSchedule,
                            { exceptEnrollmentId: enrollment._id }
                        );
                        if (scheduleConflict) {
                            await Enrollment.updateOne(
                                { _id: enrollment._id },
                                { $set: { deletedAt: new Date() } }
                            );
                            throw new Error(studentScheduleConflictMessage(scheduleConflict));
                        }
                    }
                }
                if (enrollment.student) {
                    await syncStudentRosterFromEnrollments(enrollment.student);
                }
                return enrollment.student;
            })
        );

        const succeeded = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - succeeded;
        await syncLoginForStudentIds(
            results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
        );

        res.json({
            success: failed === 0,
            message:
                failed > 0
                    ? `${succeeded} restored, ${failed} failed`
                    : `${succeeded} enrollment(s) restored`,
            succeeded,
            failed,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error restoring enrollments' });
    }
});

// Bulk update enrollments
router.post('/bulk-update', async (req, res) => {
    try {
        const { enrollmentIds, status } = req.body;
        
        if (!enrollmentIds || !enrollmentIds.length) {
            return res.status(400).json({
                success: false,
                message: 'No enrollments selected'
            });
        }
        
        const updateData = { status: normalizeEnrollmentStatusInput(status) };
        if (status === 'completed') {
            updateData.completionDate = new Date();
        }
        
        await Enrollment.updateMany(
            { _id: { $in: enrollmentIds }, ...activeEnrollmentFilter() },
            updateData
        );

        if (status !== undefined) {
            const rows = await Enrollment.find({
                _id: { $in: enrollmentIds },
                ...activeEnrollmentFilter(),
            }).select('student');
            const studentIds = [...new Set(rows.map((row) => String(row.student)).filter(Boolean))];
            await Promise.all(studentIds.map((id) => syncStudentUserLoginFromAllEnrollments(id)));
        }

        res.json({
            success: true,
            message: `${enrollmentIds.length} enrollment(s) updated successfully`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating enrollments',
            error: error.message
        });
    }
});

// Get enrollment statistics (row counts + unique students on active enrollments)
router.get('/stats', async (req, res) => {
    try {
        const search = String(req.query.search || '').trim().toLowerCase();
        const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
        const feeStatusFilter = String(req.query.feeStatus || 'all').trim().toLowerCase();

        const listFilter = { ...activeEnrollmentFilter() };
        if (statusFilter && statusFilter !== 'all') {
            if (statusFilter === 'inactive') {
                listFilter.status = { $in: ['inactive', 'pending', null] };
            } else if (['active', 'completed'].includes(statusFilter)) {
                listFilter.status = statusFilter;
            }
        }
        if (feeStatusFilter && feeStatusFilter !== 'all' && ALLOWED_FEE_STATUSES.includes(feeStatusFilter)) {
            if (feeStatusFilter === 'pending') {
                listFilter.paymentStatus = { $in: ['pending', null] };
            } else {
                listFilter.paymentStatus = feeStatusFilter;
            }
        }

        const listFilterVisible = await buildVisibleListFilter(listFilter, false);
        const matchFilter = await appendSearchToFilter(listFilterVisible, search);
        const stats = await countEnrollmentStats(matchFilter);
        const totalStudentAccounts = await User.countDocuments({ role: 'student', ...activeUserFilter() });

        res.json({
            success: true,
            stats: {
                ...stats,
                uniqueStudents: Math.max(stats.uniqueStudents, 0),
                totalStudentAccounts,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching enrollment stats',
            error: error.message
        });
    }
});

module.exports = router;