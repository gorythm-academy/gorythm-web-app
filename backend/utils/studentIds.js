const User = require('../models/User');

/**
 * Next GRT-{year}-{3-digit-seq} ID (e.g. GRT-2026-001).
 * Sequence is max existing GRT-{year}-### for that year + 1.
 */
async function generateStudentId() {
    const year = new Date().getFullYear();
    const prefix = `GRT-${year}-`;
    const regex = new RegExp(`^GRT-${year}-(\\d{3})$`);

    const students = await User.find({
        role: 'student',
        studentId: { $regex: new RegExp(`^GRT-${year}-`) },
    })
        .select('studentId')
        .lean();

    let maxSeq = 0;
    for (const u of students) {
        const m = u.studentId && u.studentId.match(regex);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }

    let seq = maxSeq + 1;
    let id = `${prefix}${String(seq).padStart(5, '0')}`;
    let attempts = 0;
    while ((await User.findOne({ studentId: id })) && attempts < 500) {
        seq += 1;
        id = `${prefix}${String(seq).padStart(3, '0')}`;
        attempts += 1;
    }
    return id;
}

/** Assign GRT-* studentId to students who have none (legacy / imported rows). */
async function backfillMissingStudentIds() {
    const missing = await User.find({
        role: 'student',
        $or: [{ studentId: { $exists: false } }, { studentId: null }, { studentId: '' }],
    }).select('_id');

    for (const row of missing) {
        const user = await User.findById(row._id);
        if (!user || user.studentId) continue;
        user.studentId = await generateStudentId();
        await user.save();
    }
}

module.exports = { generateStudentId, backfillMissingStudentIds };
