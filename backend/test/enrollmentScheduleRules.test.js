const test = require('node:test');
const assert = require('node:assert/strict');
const Enrollment = require('../models/Enrollment');
const ClassSchedule = require('../models/ClassSchedule');
const {
    findStudentScheduleConflict,
    studentScheduleConflictMessage,
    assertStudentScheduleAvailable,
} = require('../utils/enrollmentScheduleRules');

function stubSchedule(target) {
    ClassSchedule.findById = () => ({
        populate() {
            return this;
        },
        select() {
            return Promise.resolve(target);
        },
    });
}

function stubEnrollments(enrollments, capturedFilter) {
    Enrollment.find = (filter) => {
        capturedFilter.value = filter;
        return {
            populate() {
                return this;
            },
            lean() {
                return Promise.resolve(enrollments);
            },
        };
    };
}

test('detects an overlapping student class on the same weekday', async (t) => {
    const originalFindById = ClassSchedule.findById;
    const originalFind = Enrollment.find;
    t.after(() => {
        ClassSchedule.findById = originalFindById;
        Enrollment.find = originalFind;
    });

    const capturedFilter = {};
    stubSchedule({
        _id: 'slot-new',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '11:00',
        course: { title: 'Physics' },
    });
    stubEnrollments(
        [
            {
                _id: 'enrollment-old',
                course: { title: 'Mathematics' },
                assignedSchedule: {
                    _id: 'slot-old',
                    dayOfWeek: 1,
                    startTime: '10:30',
                    endTime: '11:30',
                },
            },
        ],
        capturedFilter
    );

    const conflict = await findStudentScheduleConflict('student-a', 'slot-new', {
        exceptEnrollmentId: 'enrollment-new',
    });

    assert.equal(conflict.type, 'overlap');
    assert.equal(
        studentScheduleConflictMessage(conflict),
        'This student already has "Mathematics" at this time. Choose a non-overlapping timeslot.'
    );
    assert.deepEqual(capturedFilter.value._id, { $ne: 'enrollment-new' });
});

test('allows adjacent classes and rejects the exact same slot', async (t) => {
    const originalFindById = ClassSchedule.findById;
    const originalFind = Enrollment.find;
    t.after(() => {
        ClassSchedule.findById = originalFindById;
        Enrollment.find = originalFind;
    });

    stubSchedule({
        _id: 'slot-new',
        dayOfWeek: 2,
        startTime: '11:00',
        endTime: '12:00',
    });
    stubEnrollments(
        [
            {
                course: { title: 'Chemistry' },
                assignedSchedule: {
                    _id: 'slot-adjacent',
                    dayOfWeek: 2,
                    startTime: '10:00',
                    endTime: '11:00',
                },
            },
        ],
        {}
    );
    assert.equal(await findStudentScheduleConflict('student-a', 'slot-new'), null);

    stubEnrollments(
        [
            {
                course: { title: 'Chemistry' },
                assignedSchedule: {
                    _id: 'slot-new',
                    dayOfWeek: 2,
                    startTime: '11:00',
                    endTime: '12:00',
                },
            },
        ],
        {}
    );

    await assert.rejects(
        assertStudentScheduleAvailable('student-a', 'slot-new'),
        (error) => error.status === 400 && /already assigned to this timeslot/.test(error.message)
    );
});
