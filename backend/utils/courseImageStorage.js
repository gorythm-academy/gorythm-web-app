const path = require('path');
const fs = require('fs');

const IMAGE_SUBDIR = 'courses-images';
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const IMAGE_DIR = path.join(UPLOAD_ROOT, IMAGE_SUBDIR);

function ensureImageDir() {
    if (!fs.existsSync(IMAGE_DIR)) {
        fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }
}

/** Public URL path stored in DB, e.g. /api/uploads/courses-images/file.jpg */
function imagePublicPath(filename) {
    return `/api/uploads/${IMAGE_SUBDIR}/${filename}`;
}

function imageAbsolutePathFromPublic(publicPath) {
    if (!publicPath || typeof publicPath !== 'string') return null;
    const prefix = `/api/uploads/${IMAGE_SUBDIR}/`;
    if (!publicPath.startsWith(prefix)) return null;
    const filename = publicPath.slice(prefix.length);
    if (!filename || filename.includes('..') || filename.includes('/')) return null;
    return path.join(IMAGE_DIR, filename);
}

function deleteImageFile(publicPath) {
    const abs = imageAbsolutePathFromPublic(publicPath);
    if (!abs || !fs.existsSync(abs)) return;
    try {
        fs.unlinkSync(abs);
    } catch {
        /* ignore */
    }
}

function listImageFilenames() {
    ensureImageDir();
    return fs
        .readdirSync(IMAGE_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith('.'));
}

module.exports = {
    IMAGE_SUBDIR,
    IMAGE_DIR,
    ensureImageDir,
    imagePublicPath,
    imageAbsolutePathFromPublic,
    deleteImageFile,
    listImageFilenames,
};
