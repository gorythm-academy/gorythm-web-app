const activePromoVideoFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedPromoVideoFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

module.exports = { activePromoVideoFilter, trashedPromoVideoFilter };
