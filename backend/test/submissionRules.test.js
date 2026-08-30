const test = require('node:test');
const assert = require('node:assert/strict');
const {
    assignmentPastDue,
    buildSubmissionRevisionNotice,
    mapSubmissionForPortal,
} = require('../utils/lmsContentRules');

test('treats an assignment as past due only after its due-date day', () => {
    const assignment = { dueDate: new Date(2026, 7, 30) };

    assert.equal(assignmentPastDue(assignment, new Date(2026, 7, 30, 23, 59, 59)), false);
    assert.equal(assignmentPastDue(assignment, new Date(2026, 7, 31)), true);
});

test('marks edited submissions using revisionCount', () => {
    assert.equal(buildSubmissionRevisionNotice({ revisionCount: 0 }), null);
    assert.equal(buildSubmissionRevisionNotice({ revisionCount: 1 }), 'Edited');
    assert.equal(buildSubmissionRevisionNotice({ revisionCount: 3 }), 'Re-submitted');
});

test('maps submission documents without losing fields', () => {
    const submission = {
        toObject() {
            return {
                _id: 'submission-a',
                text: 'Updated work',
                attachments: ['/uploads/work.pdf'],
                revisionCount: 1,
            };
        },
    };

    assert.deepEqual(mapSubmissionForPortal(submission), {
        _id: 'submission-a',
        text: 'Updated work',
        attachments: ['/uploads/work.pdf'],
        revisionCount: 1,
        revisionNotice: 'Edited',
    });
});
