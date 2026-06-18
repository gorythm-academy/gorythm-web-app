const { activeLmsFilter, trashedLmsFilter } = require('../utils/lmsTrashQuery');

async function softDeleteMany(Model, ids, extraFilter = {}) {
    if (!ids?.length) return 0;
    const result = await Model.updateMany(
        { _id: { $in: ids }, ...activeLmsFilter(), ...extraFilter },
        { $set: { deletedAt: new Date() } }
    );
    return result.modifiedCount;
}

async function restoreMany(Model, ids, extraFilter = {}) {
    if (!ids?.length) return 0;
    const result = await Model.updateMany(
        { _id: { $in: ids }, ...trashedLmsFilter(), ...extraFilter },
        { $set: { deletedAt: null } }
    );
    return result.modifiedCount;
}

async function permanentDeleteMany(Model, ids, extraFilter = {}) {
    if (!ids?.length) return 0;
    const result = await Model.deleteMany({ _id: { $in: ids }, ...trashedLmsFilter(), ...extraFilter });
    return result.deletedCount;
}

async function countTrashed(Model, baseFilter = {}) {
    return Model.countDocuments({ ...baseFilter, ...trashedLmsFilter() });
}

module.exports = { softDeleteMany, restoreMany, permanentDeleteMany, countTrashed };
