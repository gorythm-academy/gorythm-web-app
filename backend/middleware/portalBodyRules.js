const mongoose = require('mongoose');
const { ATTENDANCE_STATUSES } = require('../constants/attendanceStatuses');

function objectId(value) {
    return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function studentSubmission(body) {
    if (!objectId(body?.assignmentId)) return 'Assignment is invalid';
    if (body?.text != null && typeof body.text !== 'string') return 'Answer is invalid';
    if (typeof body?.text === 'string' && body.text.length > 20000) return 'Answer is too long';
    if (body?.attachments != null && !Array.isArray(body.attachments)) return 'Files are invalid';
    return null;
}

function quizAttempt(body) {
    if (!objectId(body?.quizId)) return 'Quiz is invalid';
    if (body?.correctAnswer != null || body?.correctIndex != null) {
        return 'Quiz answers cannot include the correct option';
    }
    if (body?.answers != null && !Array.isArray(body.answers)) return 'Answers are invalid';
    if (body?.attachments != null && !Array.isArray(body.attachments)) return 'Files are invalid';
    return null;
}

function teacherAttendance(body) {
    if (!objectId(body?.courseId)) return 'Course is invalid';
    const listed = Array.isArray(body?.records) ? body.records : [];
    const rows = listed.length ? listed : body?.studentId ? [{ studentId: body.studentId, status: body.status }] : [];
    if (!rows.length) return 'Attendance records are required';
    for (const row of rows) {
        if (!objectId(row?.studentId)) return 'Student is invalid';
        const status = row?.status || body?.status || 'present';
        if (!ATTENDANCE_STATUSES.includes(status)) return 'Attendance status is invalid';
    }
    return null;
}

function teacherAssignment(body) {
    if (!objectId(body?.courseId)) return 'Course is invalid';
    if (typeof body?.title !== 'string' || !body.title.trim()) return 'Title is required';
    if (!body?.dueDate) return 'Due date is required';
    const ids = Array.isArray(body?.scheduleIds) && body.scheduleIds.length
        ? body.scheduleIds
        : body?.scheduleId
          ? [body.scheduleId]
          : [];
    if (!ids.length) return 'Select at least one class slot';
    if (ids.some((id) => !objectId(id))) return 'Class slot is invalid';
    return null;
}

function teacherQuiz(body) {
    if (!objectId(body?.courseId)) return 'Course is invalid';
    if (typeof body?.title !== 'string' || !body.title.trim()) return 'Title is required';
    if (body?.questions != null && !Array.isArray(body.questions)) return 'Questions are invalid';
    const ids = Array.isArray(body?.scheduleIds) && body.scheduleIds.length
        ? body.scheduleIds
        : body?.scheduleId
          ? [body.scheduleId]
          : [];
    if (!ids.length) return 'Select at least one class slot';
    if (ids.some((id) => !objectId(id))) return 'Class slot is invalid';
    return null;
}

function teacherResource(body) {
    if (!objectId(body?.courseId)) return 'Course is invalid';
    if (typeof body?.title !== 'string' || !body.title.trim()) return 'Title is required';
    const ids = Array.isArray(body?.scheduleIds) && body.scheduleIds.length
        ? body.scheduleIds
        : body?.scheduleId
          ? [body.scheduleId]
          : [];
    if (!ids.length) return 'Select at least one class slot';
    if (ids.some((id) => !objectId(id))) return 'Class slot is invalid';
    return null;
}

function parentStudentLink(body) {
    if (!objectId(body?.parentId)) return 'Parent is invalid';
    if (!objectId(body?.studentId)) return 'Student is invalid';
    return null;
}

function childLink(body) {
    if (!objectId(body?.studentId)) return 'Student is invalid';
    return null;
}

function salaryProfile(body) {
    if (!objectId(body?.teacherId)) return 'Teacher is invalid';
    const salary = Number(body?.monthlySalary);
    if (!Number.isFinite(salary) || salary < 0) return 'Salary must be a number of 0 or more';
    if (body?.workingDays != null && body.workingDays !== '') {
        const days = Number(body.workingDays);
        if (!Number.isFinite(days) || days < 0 || days > 31) return 'Working days are invalid';
    }
    if (body?.currency != null && body.currency !== '' && String(body.currency).trim().length !== 3) {
        return 'Currency is invalid';
    }
    return null;
}

function payrollAttendance(body) {
    if (!objectId(body?.teacherId)) return 'Teacher is invalid';
    if (!/^\d{4}-\d{2}$/.test(String(body?.monthKey || ''))) return 'Month is invalid';
    for (const field of ['presentDays', 'leaveDays', 'absentDays']) {
        if (body?.[field] == null || body[field] === '') continue;
        const value = Number(body[field]);
        if (!Number.isFinite(value) || value < 0 || value > 31) return 'Attendance days are invalid';
    }
    return null;
}

function payrollRun(body) {
    if (!objectId(body?.teacherId)) return 'Teacher is invalid';
    if (!/^\d{4}-\d{2}$/.test(String(body?.monthKey || ''))) return 'Month is invalid';
    return null;
}

module.exports = {
    studentSubmission,
    quizAttempt,
    teacherAttendance,
    teacherAssignment,
    teacherQuiz,
    teacherResource,
    parentStudentLink,
    childLink,
    salaryProfile,
    payrollAttendance,
    payrollRun,
};
