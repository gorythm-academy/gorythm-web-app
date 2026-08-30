const test = require('node:test');
const assert = require('node:assert/strict');
const Enrollment = require('../models/Enrollment');
const {
    studentAssignmentMongoFilter,
    resourceVisibleToStudent,
} = require('../utils/lmsContentRules');
const { activeLmsFilter, mergeMongoFilters } = require('../utils/lmsTrashQuery');

test('combines assignment visibility and active filters without clobbering $or', () => {
    const visibility = {
        $or: [
            { course: 'course-a', teacher: 'teacher-a' },
            { course: 'course-b', teacher: 'teacher-b' },
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

test('builds assignment visibility from the student assigned-slot teachers', async (t) => {
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
                    assignedSchedule: { teacher: { _id: 'teacher-a' } },
                },
                {
                    course: 'course-b',
                    assignedSchedule: { teacher: 'teacher-b' },
                },
            ]);
        },
    });

    const filter = await studentAssignmentMongoFilter('student-a');

    assert.deepEqual(filter, {
        $or: [
            { course: 'course-a', teacher: 'teacher-a' },
            { course: 'course-b', teacher: 'teacher-b' },
        ],
    });
});

test('teacher-scoped resources are visible only to the matching class slot', () => {
    const enrollmentTeachers = new Map([['course-a', 'teacher-a']]);

    assert.equal(
        resourceVisibleToStudent(
            { course: 'course-a', teacher: 'teacher-a', scope: 'teacher' },
            enrollmentTeachers
        ),
        true
    );
    assert.equal(
        resourceVisibleToStudent(
            { course: 'course-a', teacher: 'teacher-b', scope: 'teacher' },
            enrollmentTeachers
        ),
        false
    );
    assert.equal(
        resourceVisibleToStudent({ course: 'course-a', scope: 'course' }, enrollmentTeachers),
        true
    );
});
