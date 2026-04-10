const express = require('express');
const router = express.Router();
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const STUDENT_POPULATE = 'name email personalEmail avatar studentId isActive';
const STUDENT_POPULATE_WITH_ENROLLED = `${STUDENT_POPULATE} enrolledCourses`;

const coursePopulate = () => ({
    path: 'course',
    select: 'title category instructorName instructor students',
    populate: { path: 'instructor', select: 'name' },
});

const ensureStudentEnrollmentBackfill = async () => {
    const students = await User.find({ role: 'student' }).select('_id');
    if (!students.length) return;

    const studentIds = students.map((student) => student._id.toString());
    const enrolledStudentIds = await Enrollment.distinct('student', {
        student: { $in: students.map((student) => student._id) },
    });
    const enrolledSet = new Set(enrolledStudentIds.map((id) => String(id)));

    const missingStudents = studentIds.filter((id) => !enrolledSet.has(id));
    if (!missingStudents.length) return;

    await Enrollment.insertMany(
        missingStudents.map((studentId) => ({
            student: studentId,
            course: null,
            status: 'pending',
            progress: 0,
            grade: null,
            enrollmentDate: new Date(),
            lastAccessed: new Date(),
            paymentStatus: 'pending',
        }))
    );
};

// Get all enrollments (admin only)
router.get('/', authMiddleware, async (req, res) => {
    try {
        await ensureStudentEnrollmentBackfill();
        const enrollments = await Enrollment.find()
            .populate('student', STUDENT_POPULATE)
            .populate(coursePopulate())
            .sort({ enrollmentDate: -1 });
        
        res.json({
            success: true,
            enrollments,
            count: enrollments.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching enrollments',
            error: error.message
        });
    }
});

// Assign a course to an existing student (reuses placeholder row when course is null)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { studentUserId, courseId, status, progress, grade, enrollmentDate } = req.body;

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
        if (student.isActive === false) {
            return res.status(400).json({ success: false, message: 'Cannot enroll an inactive student' });
        }

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
            placeholder.paymentStatus = 'paid';
            await placeholder.save();
            enrollment = placeholder;
        } else {
            enrollment = await Enrollment.create({
                student: student._id,
                course: courseId,
                status: status || 'pending',
                progress: progress || 0,
                grade: grade || null,
                enrollmentDate: enrollmentDate ? new Date(enrollmentDate) : new Date(),
                lastAccessed: new Date(),
                paymentStatus: 'paid'
            });
        }

        if (!course.students.includes(student._id)) {
            course.students.push(student._id);
            await course.save();
        }

        if (!student.enrolledCourses.includes(courseId)) {
            student.enrolledCourses.push(courseId);
            await student.save();
        }

        const populatedEnrollment = await Enrollment.findById(enrollment._id)
            .populate('student', STUDENT_POPULATE)
            .populate(coursePopulate());

        res.status(201).json({
            success: true,
            message: 'Student enrolled successfully',
            enrollment: populatedEnrollment
        });
    } catch (error) {
        console.error('Enrollment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating enrollment',
            error: error.message
        });
    }
});

// Update enrollment (status, progress, grade, course change, enrollmentDate)
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { status, progress, grade, lastAccessed, courseId, enrollmentDate } = req.body;

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

            // Push into new course arrays
            if (!newCourse.students.includes(enrollment.student._id)) {
                await Course.findByIdAndUpdate(courseId, {
                    $push: { students: enrollment.student._id }
                });
            }
            const studentDoc = await User.findById(enrollment.student._id);
            if (!studentDoc.enrolledCourses.includes(courseId)) {
                await User.findByIdAndUpdate(enrollment.student._id, {
                    $push: { enrolledCourses: courseId }
                });
            }

            enrollment.course = courseId;
        }

        if (status !== undefined) enrollment.status = status;
        if (progress !== undefined) enrollment.progress = progress;
        if (grade !== undefined) enrollment.grade = grade;
        if (enrollmentDate) enrollment.enrollmentDate = new Date(enrollmentDate);
        enrollment.lastAccessed = lastAccessed ? new Date(lastAccessed) : new Date();
        if (status === 'completed') enrollment.completionDate = new Date();

        await enrollment.save();

        const populated = await Enrollment.findById(enrollment._id)
            .populate('student', STUDENT_POPULATE)
            .populate(coursePopulate());

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

// Delete enrollment
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const enrollment = await Enrollment.findByIdAndDelete(req.params.id);
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        // Only clean up arrays when a real course was assigned
        if (enrollment.course) {
            await Course.findByIdAndUpdate(enrollment.course, {
                $pull: { students: enrollment.student }
            });
            await User.findByIdAndUpdate(enrollment.student, {
                $pull: { enrolledCourses: enrollment.course }
            });
        }
        
        res.json({
            success: true,
            message: 'Enrollment deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting enrollment',
            error: error.message
        });
    }
});

// Bulk update enrollments
router.post('/bulk-update', authMiddleware, async (req, res) => {
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
router.get('/stats', authMiddleware, async (req, res) => {
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