/**
 * One-time cleanup: prune orphan instructor ids, clear teachers on draft/quarantine,
 * and normalize legacy instructor → instructors[].
 *
 * Usage: node scripts/cleanupCourseInstructors.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const {
    applyInstructorsToCourse,
    teacherIdsOnCourse,
} = require('../utils/courseInstructors');
const { activeCourseFilter } = require('../utils/courseQuery');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const courses = await Course.find({});
    let pruned = 0;
    let clearedDraftOrTrash = 0;
    let normalized = 0;

    for (const course of courses) {
        const before = teacherIdsOnCourse(course);
        const isTrash = !!course.deletedAt;
        const isDraft = !course.isPublished;

        if (isTrash || isDraft) {
            if (before.length) {
                await applyInstructorsToCourse(course, [], { requireAll: false });
                await course.save();
                clearedDraftOrTrash += 1;
                console.log(`cleared teachers: ${course.title} (${isTrash ? 'quarantine' : 'draft'})`);
            }
            continue;
        }

        // Published + active: prune orphans and write instructors[] from valid ids
        const beforeJson = JSON.stringify({
            instructor: course.instructor ? String(course.instructor) : null,
            instructors: (course.instructors || []).map(String),
        });
        await applyInstructorsToCourse(course, before, { requireAll: false });
        const after = teacherIdsOnCourse(course);
        const afterJson = JSON.stringify({
            instructor: course.instructor ? String(course.instructor) : null,
            instructors: (course.instructors || []).map(String),
        });
        if (before.length !== after.length || before.some((id) => !after.includes(id))) {
            pruned += 1;
            console.log(`pruned orphans: ${course.title}`, { before, after });
        } else if (beforeJson !== afterJson) {
            normalized += 1;
            console.log(`normalized legacy→instructors: ${course.title}`);
        }
        await course.save();
    }

    // Sanity: active published courses only
    const activePublished = await Course.find({ isPublished: true, ...activeCourseFilter() })
        .select('title instructor instructors')
        .lean();
    console.log('\n=== Published active courses after cleanup ===');
    for (const c of activePublished) {
        console.log(
            JSON.stringify({
                title: c.title,
                instructor: c.instructor ? String(c.instructor) : null,
                instructors: (c.instructors || []).map(String),
            })
        );
    }

    console.log('\nDone', { pruned, clearedDraftOrTrash, normalized, total: courses.length });
    await mongoose.disconnect();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
