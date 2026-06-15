const activeCourseFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedCourseFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

const isCourseTrashed = (course) => !!(course?.deletedAt);

module.exports = { activeCourseFilter, trashedCourseFilter, isCourseTrashed };
