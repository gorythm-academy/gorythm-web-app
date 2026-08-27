/** Build URL variants stored in DB (relative vs absolute). */
function uploadUrlVariants(publicPath) {
    const path = String(publicPath || '').trim();
    if (!path) return [];
    const variants = new Set();
    variants.add(path);
    if (path.startsWith('/api/uploads/')) {
        variants.add(path.slice('/api/uploads/'.length));
    } else if (!path.startsWith('http')) {
        variants.add(`/api/uploads/${path.replace(/^\//, '')}`);
    }
    const base = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
    for (const v of [...variants]) {
        if (v.startsWith('/')) {
            if (base) variants.add(`${base}${v}`);
        }
    }
    return [...variants];
}

function normalizeUploadPublicPath(relOrFull) {
    const s = String(relOrFull || '').trim();
    if (!s) return null;
    if (s.startsWith('/api/uploads/')) return s.split('?')[0];
    if (s.includes('/api/uploads/')) {
        const idx = s.indexOf('/api/uploads/');
        return s.slice(idx).split('?')[0];
    }
    if (!s.startsWith('http') && !s.includes('..')) {
        return `/api/uploads/${s.replace(/^\//, '')}`.split('?')[0];
    }
    return null;
}

module.exports = { uploadUrlVariants, normalizeUploadPublicPath };
