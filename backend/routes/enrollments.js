const express = require('express');
const router = express.Router();
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const ClassSchedule = require('../models/ClassSchedule');
const authMiddleware = require('../middleware/auth');
const { allowRoles } = require('../middleware/authorize');
const { enrichEnrollmentsWithPaymentStatus } = require('../services/enrollmentPaymentStatus');
const { attachTeachersToEnrollments } = require('../services/courseTeachers');
const { syncStudentUserLoginFromEnrollmentStatus } = require('../services/syncStudentAccountLogin');
const { activeEnrollmentFilter, trashedEnrollmentFilter } = require('../utils/enrollmentQuery');
const { deleteStudentUserCompletely } = require('../utils/studentCleanup');

router.use(authMiddleware);
router.use(allowRoles('super-admin', 'admin'));
const STUDENT_POPULATE = 'name email personalEmail phone avatar studentId isActive createdAt';
const STUDENT_POPULATE_WITH_ENROLLED = `${STUDENT_POPULATE} enrolledCourses`;

const coursePopulate = () => ({
    path: 'course',
    select: 'title category instructorName instructor students',
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

const removeOrphanEnrollmentRows = async () => {
    const validStudentIds = await User.find({ role: 'student' }).distinct('_id');
    const orConditions = [
        { student: null },
        { student: { $exists: false } },
    ];
    // MongoDB: `{ student: { $nin: [] } }` matches every document — never add it with an empty array.
    if (validStudentIds.length > 0) {
        orConditions.push({ student: { $nin: validStudentIds } });
    }
    await Enrollment.deleteMany({ $or: orConditions });
};

// Get all enrollments (admin only)
router.get('/', async (req, res) => {
    try {
        try {
            await removeOrphanEnrollmentRows();
        } catch (maintErr) {
            req.log.warn('Enrollment list maintenance skipped', { err: maintErr });
        }
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const filter = trash ? trashedEnrollmentFilter() : activeEnrollmentFilter();
        const sort = trash ? { deletedAt: -1 } : { enrollmentDate: -1 };

        const [enrollments, trashCount] = await Promise.all([
            Enrollment.find(filter)
                .populate('student', STUDENT_POPULATE)
                .populate(coursePopulate())
                .populate(assignedSchedulePopulate())
                .sort(sort),
            Enrollment.countDocuments(trashedEnrollmentFilter()),
        ]);

        const enriched = [];
        for (const enr of enrollments) {
            const student = enr.student;
            if (!student?._id || !enr.course) {
                enriched.push({ ...(enr.toObject ? enr.toObject() : enr), paymentStatus: 'pending' });
                continue;
            }
            const [one] = await enrichEnrollmentsWithPaymentStatus(
                [enr],
                student._id,
                student.email || student.personalEmail
            );
            enriched.push(one);
        }

        const withTeachers = await attachTeachersToEnrollments(enriched);

        res.json({
            success: true,
            enrollments: withTeachers,
            count: withTeachers.length,
            trashCount,
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
        const course = await Course.findById(req.params.courseId).select('title');
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

// Assign a course to an existing student (reuses placeholder row when course is null)
router.post('/', async (req, res) => {
    try {
        const { studentUserId, courseId, status, progress, grade, enrollmentDate, paymentStatus } = req.body;

        if (!studentUserId || !courseId) {
            return res.status(400).json({
                success: false,
                message: 'Student and course are required'
            });
        }

        // Validate course exists
        const course = await Course.findById(courseId);
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
        // Do not block on `isActive`: pending learners use isActive=false for portal login, but admins
        // must still be able to assign courses from Students data / Enroll Student.

        // Check if already enrolled in this course
        const alreadyEnrolled = await Enrollment.findOne({ student: student._id, course: courseId });
        if (alreadyEnrolled) {
            return res.status(400).json({ success: false, message: 'Student is already enrolled in this course' });
        }

        // Reuse the placeholder row (course: null) if one exists — avoids creating a duplicate row
        const placeholder = await Enrollment.findOne({
            student: student._id,
            $or: [{ course: null }, { course: { $exists: false } }]
        });

        let enrollment;
        if (placeholder) {
            placeholder.course = courseId;
            placeholder.status = status || 'pending';
            placeholder.progress = progress || 0;
            placeholder.grade = grade || null;
            placeholder.enrollmentDate = enrollmentDate ? new Date(enrollmentDate) : new Date();
            placeholder.lastAccessed = new Date();
            const feeStatus = ['paid', 'pending', 'failed', 'refunded'].includes(paymentStatus)
                ? paymentStatus
                : 'pending';
            placeholder.paymentStatus = feeStatus;
            await placeholder.save();
            enrollment = placeholder;
        } else {
            const feeStatus = ['paid', 'pending', 'failed', 'refunded'].includes(paymentStatus)
                ? paymentStatus
                : 'pending';
            enrollment = await Enrollment.create({
                student: student._id,
                course: courseId,
                status: status || 'pending',
                progress: progress || 0,
                grade: grade || null,
                enrollmentDate: enrollmentDate ? new Date(enrollmentDate) : new Date(),
                lastAccessed: new Date(),
                paymentStatus: feeStatus,
            });
        }

        await Course.findByIdAndUpdate(course._id, { $addToSet: { students: student._id } });
        await User.findByIdAndUpdate(student._id, { $addToSet: { enrolledCourses: courseId } });

        const populatedEnrollment = await Enrollment.findById(enrollment._id)
            .populate('student', STUDENT_POPULATE)
            .populate(coursePopulate());

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

        const enrollment = await Enrollment.findById(req.params.id)
            .populate('student', STUDENT_POPULATE_WITH_ENROLLED)
            .populate(coursePopulate());

        if (!enrollment) {
            return res.status(404).json({ success: false, message: 'Enrollment not found' });
        }

        // Handle course change
        if (courseId && String(courseId) !== String(enrollment.course?._id)) {
            const newCourse = await Course.findById(courseId);
            if (!newCourse) {
                return res.status(404).json({ success: false, message: 'New course not found' });
            }

            // Pull from old course arrays (if old course existed)
            if (enrollment.course) {
                await Course.findByIdAndUpdate(enrollment.course._id, {
                    $pull: { students: enrollment.student._id }
                });
                await User.findByIdAndUpdate(enrollment.student._id, {
                    $pull: { enrolledCourses: enrollment.course._id }
                });
            }

            // Push into new course arrays (avoid .includes on undefined legacy docs)
            await Course.findByIdAndUpdate(courseId, { $addToSet: { students: enrollment.student._id } });
            await User.findByIdAndUpdate(enrollment.student._id, { $addToSet: { enrolledCourses: courseId } });

            enrollment.course = courseId;
            enrollment.assignedSchedule = null;
        }

        if (assignedScheduleId !== undefined) {
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

        if (status !== undefined) enrollment.status = status;
        if (paymentStatus !== undefined) {
            const allowed = ['paid', 'pending', 'failed', 'refunded'];
            if (allowed.includes(paymentStatus)) enrollment.paymentStatus = paymentStatus;
        }
        if (progress !== undefined) enrollment.progress = progress;
        if (grade !== undefined) enrollment.grade = grade;
        if (enrollmentDate) enrollment.enrollmentDate = new Date(enrollmentDate);
        enrollment.lastAccessed = lastAccessed ? new Date(lastAccessed) : new Date();
        if (status === 'completed') enrollment.completionDate = new Date();

        await enrollment.save();

        if (status !== undefined && enrollment.student) {
            const studentId = enrollment.student._id || enrollment.student;
            await syncStudentUserLoginFromEnrollmentStatus(studentId, enrollment.status);
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
        const enrollment = await Enrollment.findOneAndUpdate(
            { _id: req.params.id, ...trashedEnrollmentFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );
        if (!enrollment) {
            return res.status(404).json({ success: false, message: 'Enrollment not found in trash' });
        }
        if (enrollment.course && enrollment.student) {
            await Course.findByIdAndUpdate(enrollment.course, {
                $addToSet: { students: enrollment.student },
            });
            await User.findByIdAndUpdate(enrollment.student, {
                $addToSet: { enrolledCourses: enrollment.course },
            });
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

        if (enrollment.course) {
            await Course.findByIdAndUpdate(enrollment.course, {
                $pull: { students: enrollment.student },
            });
            await User.findByIdAndUpdate(enrollment.student, {
                $pull: { enrolledCourses: enrollment.course },
            });
        }

        const { deleted: userDeleted } = await deleteStudentUserCompletely(enrollment.student);

        res.json({
            success: true,
            message: userDeleted
                ? 'Enrollment and student account permanently deleted'
                : 'Enrollment permanently deleted',
            userDeleted,
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

        if (enrollment.course) {
            await Course.findByIdAndUpdate(enrollment.course, {
                $pull: { students: enrollment.student },
            });
            await User.findByIdAndUpdate(enrollment.student, {
                $pull: { enrolledCourses: enrollment.course },
            });
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
        
        const updateData = { status };
        if (status === 'completed') {
            updateData.completionDate = new Date();
        }
        
        await Enrollment.updateMany(
            { _id: { $in: enrollmentIds } },
            updateData
        );

        if (status !== undefined) {
            const rows = await Enrollment.find({ _id: { $in: enrollmentIds } }).select('student status');
            await Promise.all(
                rows.map((row) =>
                    syncStudentUserLoginFromEnrollmentStatus(row.student, row.status)
                )
            );
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

// Get enrollment statistics
router.get('/stats', async (req, res) => {
    try {
        const total = await Enrollment.countDocuments();
        const active = await Enrollment.countDocuments({ status: 'active' });
        const completed = await Enrollment.countDocuments({ status: 'completed' });
        const pending = await Enrollment.countDocuments({ status: 'pending' });
        
        res.json({
            success: true,
            stats: {
                totalEnrollments: total,
                activeEnrollments: active,
                completedEnrollments: completed,
                pendingEnrollments: pending
            }
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