const activeLmsFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedLmsFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

const parseTrashQuery = (req) => req.query.trash === 'true' || req.query.trash === '1';

module.exports = { activeLmsFilter, trashedLmsFilter, parseTrashQuery };
