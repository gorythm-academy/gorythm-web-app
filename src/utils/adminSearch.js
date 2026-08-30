/** Normalize admin list search input for case-insensitive matching. */
export function normalizeSearchQuery(query) {
    return String(query || '').trim().toLowerCase();
}

/** True when query is empty or any part contains the keyword substring. */
export function matchesKeywordSearch(query, parts) {
    const q = normalizeSearchQuery(query);
    if (!q) return true;
    const haystack = (Array.isArray(parts) ? parts : [parts])
        .flat()
        .filter((v) => v != null && v !== '')
        .map((v) => String(v).toLowerCase())
        .join(' ');
    return haystack.includes(q);
}

/** Client-side keyword filter for already-loaded rows. */
export function filterByKeywordSearch(items, query, getParts) {
    const list = Array.isArray(items) ? items : [];
    const q = normalizeSearchQuery(query);
    if (!q) return list;
    return list.filter((item) => matchesKeywordSearch(q, getParts(item)));
}
