/**
 * Shared in-memory cache helpers for admin list tabs (Students, Users, etc.).
 */

export const buildListCacheKey = (params) => JSON.stringify(params);

export const createListCache = () => {
    const map = new Map();
    return {
        get(key) {
            return map.get(key);
        },
        set(key, value) {
            map.set(key, value);
        },
        has(key) {
            return map.has(key);
        },
        delete(key) {
            map.delete(key);
        },
        clear() {
            map.clear();
        },
    };
};

/** Client-side TTL cache for small read-mostly payloads (e.g. LMS sidebar badges). */
export const createTtlCache = (ttlMs = 45_000) => {
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
};
