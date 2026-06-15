const activePaymentFilter = () => ({
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
});

const trashedPaymentFilter = () => ({
    deletedAt: { $exists: true, $ne: null },
});

module.exports = { activePaymentFilter, trashedPaymentFilter };
