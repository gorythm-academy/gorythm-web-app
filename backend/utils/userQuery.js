const activeUserFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedUserFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

const isUserTrashed = (user) => !!(user?.deletedAt);

module.exports = { activeUserFilter, trashedUserFilter, isUserTrashed };
