const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const User = require('../models/User');

const ROSTER_STATUSES = ['active', 'pending', 'completed'];

/**
 * All students registered on a course (enrollments + course.students), excluding inactive.
 */
async function getCourseRosterStudents(courseId) {
    const course = await Course.findById(courseId).select('students');
    if (!course) return [];

    const enrollments = await Enrollment.find({
        course: courseId,
        status: { $in: ROSTER_STATUSES },
    }).populate('student', 'name email studentId');

    const byId = new Map();
    for (const enr of enrollments) {
        if (!enr.student?._id) continue;
        byId.set(String(enr.student._id), {
            _id: enr.student._id,
            name: enr.student.name,
            email: enr.student.email,
            studentId: enr.student.studentId,
            enrollmentStatus: enr.status,
        });
    }

    const courseStudentIds = (course.students || []).map(String).filter(Boolean);
    const missingIds = courseStudentIds.filter((id) => !byId.has(id));
    if (missingIds.length) {
        const users = await User.find({ _id: { $in: missingIds }, role: 'student' }).select(
            'name email studentId'
        );
        for (const u of users) {
            byId.set(String(u._id), {
                _id: u._id,
                name: u.name,
                email: u.email,
                studentId: u.studentId,
                enrollmentStatus: 'active',
            });
        }
    }

    return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

module.exports = { getCourseRosterStudents, ROSTER_STATUSES };
