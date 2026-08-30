const test = require('node:test');
const assert = require('node:assert/strict');
const ParentStudentLink = require('../models/ParentStudentLink');
const {
    findConflictingParentLinkForStudent,
    assertStudentCanLinkToParent,
} = require('../utils/parentStudentLinkRules');

function stubExistingLink(existing, capturedFilter) {
    ParentStudentLink.findOne = (filter) => {
        capturedFilter.value = filter;
        return {
            select() {
                return this;
            },
            lean() {
                return Promise.resolve(existing);
            },
        };
    };
}

test('allows a parent to keep the same student link while editing it', async (t) => {
    const originalFindOne = ParentStudentLink.findOne;
    t.after(() => {
        ParentStudentLink.findOne = originalFindOne;
    });

    const capturedFilter = {};
    stubExistingLink(
        { _id: 'link-a', parent: 'parent-a', student: 'student-a' },
        capturedFilter
    );

    const conflict = await findConflictingParentLinkForStudent('student-a', {
        exceptLinkId: 'link-editing',
        allowParentId: 'parent-a',
    });

    assert.equal(conflict, null);
    assert.deepEqual(capturedFilter.value, {
        student: 'student-a',
        _id: { $ne: 'link-editing' },
    });
});

test('rejects linking a student who already belongs to another parent', async (t) => {
    const originalFindOne = ParentStudentLink.findOne;
    t.after(() => {
        ParentStudentLink.findOne = originalFindOne;
    });

    stubExistingLink(
        { _id: 'link-a', parent: 'parent-a', student: 'student-a' },
        {}
    );

    await assert.rejects(
        assertStudentCanLinkToParent('student-a', 'parent-b'),
        (error) =>
            error.status === 400 &&
            error.message ===
                'This student already has a parent linked. Remove the existing link first, or edit that link.'
    );
});
