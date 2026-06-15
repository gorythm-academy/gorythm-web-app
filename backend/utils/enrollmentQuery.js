const activeEnrollmentFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedEnrollmentFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

module.exports = { activeEnrollmentFilter, trashedEnrollmentFilter };
