/**
 * Simple in-process TTL cache for read-mostly admin endpoints.
 */

function createShortTtlCache(ttlMs = 45_000) {
    let entry = null;
    return {
        get() {
            if (!entry) return null;
            if (Date.now() - entry.at > ttlMs) {
                entry = null;
                return null;
            }
            return entry.value;
        },
        set(value) {
            entry = { value, at: Date.now() };
        },
        invalidate() {
            entry = null;
        },
    };
}

module.exports = { createShortTtlCache };
