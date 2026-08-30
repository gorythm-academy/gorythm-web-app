const activeCourseFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedCourseFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

const isCourseTrashed = (course) => !!(course?.deletedAt);

/** Active (non-quarantine) courses visible in LMS admin pickers. */
const publishedActiveCourseFilter = () => ({
    isPublished: true,
    ...activeCourseFilter(),
});

module.exports = {
    activeCourseFilter,
    trashedCourseFilter,
    publishedActiveCourseFilter,
    isCourseTrashed,
};
