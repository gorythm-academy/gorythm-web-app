const express = require('express');
const router = express.Router();
const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// Get all enrollments (admin only)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const enrollments = await Enrollment.find()
            .populate('student', 'name email avatar')
            .populate('course', 'title category instructor')
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

// Create new enrollment - FIXED VERSION
router.post('/', authMiddleware, async (req, res) => {
    try {
        console.log('Received enrollment request:', req.body);
        
        const { studentName, studentEmail, courseId, status, progress, grade } = req.body;
        
        // Validate required fields
        if (!studentName || !studentEmail || !courseId) {
            return res.status(400).json({
                success: false,
                message: 'Student name, email and course are required'
            });
        }

        console.log('Checking course:', courseId);
        
        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        console.log('Course found:', course.title);
        
        // Find or create student user
        let student = await User.findOne({ email: studentEmail.toLowerCase() });
        
        if (!student) {
            console.log('Creating new student:', studentName, studentEmail);
            
            // Create new student user with temporary password
            const randomPassword = Math.random().toString(36).slice(-8);
            
            student = new User({
                name: studentName,
                email: studentEmail.toLowerCase(),
                password: randomPassword,
                role: 'student',
                avatar: studentName.charAt(0).toUpperCase(),
                isActive: true
            });
            
            await student.save();
            console.log('Student created with ID:', student._id);
        } else {
            console.log('Existing student found:', student._id);
        }

        // Check if enrollment already exists
        const existingEnrollment = await Enrollment.findOne({
            student: student._id,
            course: courseId
        });
        
        if (existingEnrollment) {
            return res.status(400).json({
                success: false,
                message: 'Student is already enrolled in this course'
            });
        }
        
        console.log('Creating new enrollment...');
        
        // Create new enrollment
        const enrollment = new Enrollment({
            student: student._id,
            course: courseId,
            status: status || 'pending',
            progress: progress || 0,
            grade: grade || null,
            enrollmentDate: req.body.enrollmentDate ? new Date(req.body.enrollmentDate) : new Date(),
            lastAccessed: new Date(),
            paymentStatus: 'paid'
        });
        
        await enrollment.save();
        console.log('Enrollment saved:', enrollment._id);

        // Update course's students array
        if (!course.students.includes(student._id)) {
            course.students.push(student._id);
            await course.save();
            console.log('Course updated with new student');
        }

        // Update student's enrolledCourses
        if (!student.enrolledCourses.includes(courseId)) {
            student.enrolledCourses.push(courseId);
            await student.save();
            console.log('Student updated with new course');
        }
        
        // Populate the saved enrollment
        const populatedEnrollment = await Enrollment.findById(enrollment._id)
            .populate('student', 'name email avatar')
            .populate('course', 'title category instructor');
        
        console.log('Enrollment process completed successfully');
        
        res.status(201).json({
            success: true,
            message: 'Student enrolled successfully',
            enrollment: populatedEnrollment
        });
    } catch (error) {
        console.error('❌ Enrollment error details:', error);
        console.error('Error stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Error creating enrollment',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Update enrollment
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { status, progress, grade, lastAccessed } = req.body;
        
        const enrollment = await Enrollment.findByIdAndUpdate(
            req.params.id,
            {
                status,
                progress,
                grade,
                lastAccessed: lastAccessed || new Date(),
                ...(status === 'completed' && { completionDate: new Date() })
            },
            { new: true }
        ).populate('student', 'name email avatar')
         .populate('course', 'title category instructor');
        
        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Enrollment updated successfully',
            enrollment
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
        
        // Remove student from course
        await Course.findByIdAndUpdate(enrollment.course, {
            $pull: { students: enrollment.student }
        });
        
        // Remove course from student
        await User.findByIdAndUpdate(enrollment.student, {
            $pull: { enrolledCourses: enrollment.course }
        });
        
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