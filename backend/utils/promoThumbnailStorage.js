const path = require('path');
const fs = require('fs');

const THUMB_SUBDIR = 'video-thumbnails';
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const THUMB_DIR = path.join(UPLOAD_ROOT, THUMB_SUBDIR);

function ensureThumbDir() {
    if (!fs.existsSync(THUMB_DIR)) {
        fs.mkdirSync(THUMB_DIR, { recursive: true });
    }
}

/** Public URL path stored in DB, e.g. /api/uploads/video-thumbnails/file.jpg */
function thumbPublicPath(filename) {
    return `/api/uploads/${THUMB_SUBDIR}/${filename}`;
}

function thumbAbsolutePathFromPublic(publicPath) {
    if (!publicPath || typeof publicPath !== 'string') return null;
    const prefix = `/api/uploads/${THUMB_SUBDIR}/`;
    if (!publicPath.startsWith(prefix)) return null;
    const filename = publicPath.slice(prefix.length);
    if (!filename || filename.includes('..') || filename.includes('/')) return null;
    return path.join(THUMB_DIR, filename);
}

function deleteThumbFile(publicPath) {
    const abs = thumbAbsolutePathFromPublic(publicPath);
    if (!abs || !fs.existsSync(abs)) return;
    try {
        fs.unlinkSync(abs);
    } catch {
        /* ignore */
    }
}

module.exports = {
    THUMB_SUBDIR,
    THUMB_DIR,
    ensureThumbDir,
    thumbPublicPath,
    thumbAbsolutePathFromPublic,
    deleteThumbFile,
};
