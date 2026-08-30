const activeLmsFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedLmsFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

const parseTrashQuery = (req) => req.query.trash === 'true' || req.query.trash === '1';

/** Combine filters without clobbering duplicate keys like `$or`. */
function mergeMongoFilters(...filters) {
    const parts = filters.filter((f) => f && Object.keys(f).length);
    if (!parts.length) return {};
    if (parts.length === 1) return parts[0];
    return { $and: parts };
}

module.exports = { activeLmsFilter, trashedLmsFilter, parseTrashQuery, mergeMongoFilters };
