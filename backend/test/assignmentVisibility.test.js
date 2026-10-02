const test = require('node:test');
const assert = require('node:assert/strict');
const Enrollment = require('../models/Enrollment');
const ClassSchedule = require('../models/ClassSchedule');
const {
    studentAssignmentMongoFilter,
    resourceVisibleToStudent,
    studentSlotMatchesResource,
    studentResourceMongoFilter,
    resolveValidScheduleTargets,
} = require('../utils/lmsContentRules');
const { activeLmsFilter, mergeMongoFilters } = require('../utils/lmsTrashQuery');

test('combines assignment visibility and active filters without clobbering $or', () => {
    const visibility = {
        $or: [
            { course: 'course-a', teacher: 'teacher-a', assignedSchedule: 'slot-a' },
            { course: 'course-b', teacher: 'teacher-b', assignedSchedule: 'slot-b' },
        ],
    };

    const filter = mergeMongoFilters(visibility, { status: 'published' }, activeLmsFilter());

    assert.deepEqual(filter, {
        $and: [
            visibility,
            { status: 'published' },
            { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
        ],
    });
});

test('builds assignment visibility from the student assigned class slots', async (t) => {
    const originalFind = Enrollment.find;
    t.after(() => {
        Enrollment.find = originalFind;
    });

    Enrollment.find = () => ({
        select() {
            return this;
        },
        populate() {
            return this;
        },
        lean() {
            return Promise.resolve([
                {
                    course: 'course-a',
                    assignedSchedule: { _id: 'slot-a', teacher: { _id: 'teacher-a' } },
                },
                {
                    course: 'course-b',
                    assignedSchedule: { _id: 'slot-b', teacher: 'teacher-b' },
                },
            ]);
        },
    });

    const filter = await studentAssignmentMongoFilter('student-a');

    assert.deepEqual(filter, {
        $or: [
            { course: 'course-a', teacher: 'teacher-a', assignedSchedule: 'slot-a' },
            { course: 'course-b', teacher: 'teacher-b', assignedSchedule: 'slot-b' },
        ],
    });
});

test('teacher-scoped resources are visible only to the matching class slot', () => {
    const slots = [{ courseId: 'course-a', teacherId: 'teacher-a', scheduleId: 'slot-a' }];

    assert.equal(
        resourceVisibleToStudent(
            { course: 'course-a', teacher: 'teacher-a', scope: 'teacher' },
            slots
        ),
        true
    );
    assert.equal(
        resourceVisibleToStudent(
            { course: 'course-a', teacher: 'teacher-b', scope: 'teacher' },
            slots
        ),
        false
    );
    assert.equal(
        resourceVisibleToStudent({ course: 'course-a', scope: 'course' }, slots),
        true
    );
});

test('course-scoped resources are visible when student has no assigned schedule', () => {
    const slots = [{ courseId: 'course-a', teacherId: null, scheduleId: null }];

    assert.equal(
        resourceVisibleToStudent({ course: 'course-a', scope: 'course' }, slots),
        true
    );
    assert.equal(
        resourceVisibleToStudent(
            { course: 'course-a', teacher: 'teacher-a', scope: 'teacher' },
            slots
        ),
        false
    );
});

test('teacher-scoped resources with assignedSchedule require matching slot', () => {
    const slots = [{ courseId: 'course-a', teacherId: 'teacher-a', scheduleId: 'slot-a' }];

    assert.equal(
        studentSlotMatchesResource(
            slots[0],
            { course: 'course-a', teacher: 'teacher-a', assignedSchedule: 'slot-a', scope: 'teacher' }
        ),
        true
    );
    assert.equal(
        studentSlotMatchesResource(
            slots[0],
            { course: 'course-a', teacher: 'teacher-a', assignedSchedule: 'slot-b', scope: 'teacher' }
        ),
        false
    );
});

test('studentResourceMongoFilter includes course-wide resources without schedule', async (t) => {
    const originalFind = Enrollment.find;
    t.after(() => {
        Enrollment.find = originalFind;
    });

    Enrollment.find = () => ({
        select() {
            return this;
        },
        populate() {
            return this;
        },
        lean() {
            return Promise.resolve([{ course: 'course-a', assignedSchedule: null }]);
        },
    });

    const filter = await studentResourceMongoFilter('student-a');
    assert.ok(Array.isArray(filter.$or));
    assert.ok(
        filter.$or.some(
            (clause) =>
                clause.course === 'course-a' &&
                clause.$or?.some((row) => row.scope === 'course')
        )
    );
});

test('resolveValidScheduleTargets returns course and teacher from each slot', async (t) => {
    const originalFind = ClassSchedule.find;
    t.after(() => {
        ClassSchedule.find = originalFind;
    });

    ClassSchedule.find = () => ({
        select() {
            return this;
        },
        lean() {
            return Promise.resolve([
                { _id: 'slot-a', course: 'course-a', teacher: 'teacher-a' },
                { _id: 'slot-b', course: 'course-a', teacher: 'teacher-a' },
            ]);
        },
    });

    const targets = await resolveValidScheduleTargets({ scheduleIds: ['slot-a', 'slot-b'] });
    assert.deepEqual(targets, [
        { scheduleId: 'slot-a', courseId: 'course-a', teacherId: 'teacher-a' },
        { scheduleId: 'slot-b', courseId: 'course-a', teacherId: 'teacher-a' },
    ]);
});
