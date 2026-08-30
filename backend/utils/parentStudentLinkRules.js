const ParentStudentLink = require('../models/ParentStudentLink');

/**
 * One parent per student; one parent may link many students.
 * Returns an existing conflicting link, or null if the student is free / same link.
 */
async function findConflictingParentLinkForStudent(studentId, { exceptLinkId = null, allowParentId = null } = {}) {
    if (!studentId) return null;
    const filter = { student: studentId };
    if (exceptLinkId) {
        filter._id = { $ne: exceptLinkId };
    }
    const existing = await ParentStudentLink.findOne(filter).select('_id parent student').lean();
    if (!existing) return null;
    if (allowParentId && String(existing.parent) === String(allowParentId)) {
        return null;
    }
    return existing;
}

async function assertStudentCanLinkToParent(studentId, parentId, { exceptLinkId = null } = {}) {
    const conflict = await findConflictingParentLinkForStudent(studentId, {
        exceptLinkId,
        allowParentId: parentId,
    });
    if (!conflict) return;
    const err = new Error(
        'This student already has a parent linked. Remove the existing link first, or edit that link.'
    );
    err.status = 400;
    throw err;
}

module.exports = {
    findConflictingParentLinkForStudent,
    assertStudentCanLinkToParent,
};
