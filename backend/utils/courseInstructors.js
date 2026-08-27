const mongoose = require('mongoose');
const User = require('../models/User');
const { activeUserFilter } = require('./userQuery');

/** Normalize incoming teacher ids (instructorIds / instructorId) into unique ObjectId strings. */
function normalizeInstructorIdList(body = {}) {
    const raw = [];
    if (Array.isArray(body.instructorIds)) {
        raw.push(...body.instructorIds);
    }
    if (body.instructorId) {
        raw.push(body.instructorId);
    }
    return [
        ...new Set(
            raw
                .map((id) => String(id || '').trim())
                .filter((id) => id && mongoose.isValidObjectId(id))
        ),
    ];
}

/** All teacher ids linked to a course document (instructors + legacy instructor). */
function teacherIdsOnCourse(course) {
    if (!course) return [];
    const ids = new Set();
    if (course.instructor) ids.add(String(course.instructor._id || course.instructor));
    for (const t of course.instructors || []) {
        ids.add(String(t._id || t));
    }
    return [...ids].filter(Boolean);
}

/** Stable id list for API/UI (prefer instructors, fall back to legacy instructor). */
function instructorIdsFromCourse(course) {
    return teacherIdsOnCourse(course);
}

function clearInstructorsOnCourse(course) {
    if (!course) return;
    course.instructors = [];
    course.instructor = null;
    course.instructorName = '';
}

/**
 * Apply a teacher id list onto a course doc (mutates).
 * `instructors` is source of truth; `instructor` / `instructorName` mirror first teacher for legacy readers.
 *
 * @param {object} options
 * @param {boolean} [options.requireAll=false] If true, fail when any requested id is missing/trashed/not a teacher.
 *   If false, silently drop invalid ids (used when merging assignments / cleaning stale data).
 */
async function applyInstructorsToCourse(course, instructorIds, options = {}) {
    const { requireAll = false } = options;
    const ids = [
        ...new Set((instructorIds || []).map(String).filter((id) => mongoose.isValidObjectId(id))),
    ];

    let teachers = [];
    if (ids.length) {
        teachers = await User.find({
            _id: { $in: ids },
            role: 'teacher',
            ...activeUserFilter(),
        }).select('_id name');

        const found = new Set(teachers.map((t) => String(t._id)));
        const missing = ids.filter((id) => !found.has(id));
        if (missing.length && requireAll) {
            const err = new Error(
                'One or more selected teachers were not found, are quarantined, or are not teacher accounts'
            );
            err.status = 400;
            err.missingIds = missing;
            throw err;
        }
        // Preserve requested order; drop invalid when not requireAll
        const byId = new Map(teachers.map((t) => [String(t._id), t]));
        teachers = ids.map((id) => byId.get(id)).filter(Boolean);
    }

    course.instructors = teachers.map((t) => t._id);
    if (teachers.length) {
        course.instructor = teachers[0]._id;
        course.instructorName = teachers[0].name || '';
    } else {
        course.instructor = null;
        course.instructorName = '';
    }
    return teachers;
}

function formatInstructorNames(course) {
    const fromList = (course.instructors || [])
        .map((t) => (typeof t === 'object' ? t?.name : null))
        .filter(Boolean);
    if (fromList.length) return fromList.join(', ');
    return course.instructorName || course.instructor?.name || '';
}

module.exports = {
    normalizeInstructorIdList,
    teacherIdsOnCourse,
    instructorIdsFromCourse,
    clearInstructorsOnCourse,
    applyInstructorsToCourse,
    formatInstructorNames,
};
