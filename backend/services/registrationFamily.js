const crypto = require('crypto');
const User = require('../models/User');
const ParentStudentLink = require('../models/ParentStudentLink');
const { activeUserFilter } = require('../utils/userQuery');
const { distinctParentEmail } = require('../utils/studentPortalEmail');

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

/**
 * When the registration includes a different parent email, create that parent if needed
 * and link the student. An existing link to another parent is left as it is.
 */
async function ensureParentLinkedToStudent(student, parentEmail) {
    const email = distinctParentEmail(student?.email, parentEmail);
    if (!email || !student?._id) return null;

    const existingLink = await ParentStudentLink.findOne({ student: student._id }).select('parent');
    if (existingLink) {
        const linked = await User.findOne({
            _id: existingLink.parent,
            role: 'parent',
            ...activeUserFilter(),
        }).select('_id email');
        if (linked && normalizeEmail(linked.email) === email) return linked;
        return null;
    }

    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let parent = await User.findOne({
        $and: [
            activeUserFilter(),
            {
                $or: [
                    { email },
                    { personalEmail: new RegExp(`^${escaped}$`, 'i') },
                ],
            },
        ],
    });
    if (parent && parent.role !== 'parent') {
        const err = new Error('This parent email is already in use. Please enter a different email.');
        err.status = 400;
        throw err;
    }
    if (!parent) {
        const studentName = String(student.name || '').trim() || 'the student';
        parent = new User({
            name: `Parent of ${studentName}`,
            email,
            personalEmail: '',
            password: crypto.randomBytes(18).toString('hex'),
            role: 'parent',
            status: 'active',
            isActive: true,
            canLogin: true,
            mustChangePassword: true,
        });
        await parent.save();
    }

    try {
        await ParentStudentLink.create({
            parent: parent._id,
            student: student._id,
            relation: 'guardian',
        });
    } catch (err) {
        if (err?.code !== 11000) throw err;
    }
    return parent;
}

module.exports = {
    ensureParentLinkedToStudent,
};
