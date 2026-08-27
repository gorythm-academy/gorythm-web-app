const mongoose = require('mongoose');

function parseObjectIdList(ids, { max = 500 } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) {
        return { ok: false, error: 'No IDs provided', ids: [] };
    }
    if (ids.length > max) {
        return { ok: false, error: `Too many IDs (max ${max})`, ids: [] };
    }
    const normalized = [];
    for (const raw of ids) {
        const id = String(raw || '').trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return { ok: false, error: 'Invalid ID in selection', ids: [] };
        }
        normalized.push(id);
    }
    return { ok: true, ids: normalized };
}

module.exports = { parseObjectIdList };
