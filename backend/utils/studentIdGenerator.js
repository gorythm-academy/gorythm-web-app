const User = require('../models/User');

const STUDENT_ID_REGEX = /^GRT-\d{4}-\d{3}$/;

/**
 * Next roll number: GRT-{year}-{###} (e.g. GRT-2026-001).
 * Editable afterward; uniqueness enforced by sparse unique index on User.studentId.
 */
async function generateNextStudentId(year = new Date().getFullYear()) {
    const y = Number(year) || new Date().getFullYear();
    const prefix = `GRT-${y}-`;
    const existing = await User.find({
        studentId: new RegExp(`^${prefix}\\d{3}$`),
    })
        .select('studentId')
        .lean();

    let max = 0;
    for (const row of existing) {
        const n = parseInt(String(row.studentId).slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > max) max = n;
    }

    const next = max + 1;
    if (next > 999) {
        throw new Error(`No free student IDs left for year ${y}`);
    }
    return `${prefix}${String(next).padStart(3, '0')}`;
}

/** Assign a roll number if the student has none. Returns the id used. */
async function ensureStudentId(userId) {
    if (!userId) return null;
    const user = await User.findById(userId).select('role studentId');
    if (!user || user.role !== 'student') return null;
    if (user.studentId && STUDENT_ID_REGEX.test(user.studentId)) {
        return user.studentId;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = await generateNextStudentId();
        try {
            user.studentId = candidate;
            await user.save();
            return candidate;
        } catch (err) {
            if (err?.code !== 11000) throw err;
        }
    }
    throw new Error('Could not assign a unique student ID');
}

function isValidStudentIdFormat(value) {
    if (!value) return true;
    return STUDENT_ID_REGEX.test(String(value).trim());
}

module.exports = {
    STUDENT_ID_REGEX,
    generateNextStudentId,
    ensureStudentId,
    isValidStudentIdFormat,
};
