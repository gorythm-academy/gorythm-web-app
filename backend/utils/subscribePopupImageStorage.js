const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { safeBasename } = require('./safeFilename');

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const SUBDIR = 'subscribe-popup-images';
const UPLOAD_ROOT = process.env.UPLOAD_ROOT
    ? path.resolve(process.env.UPLOAD_ROOT)
    : path.join(__dirname, '..', 'uploads');
const IMAGE_DIR = path.join(UPLOAD_ROOT, SUBDIR);

function ensureImageDir() {
    if (!fs.existsSync(IMAGE_DIR)) {
        fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }
}

function imagePublicPath(filename) {
    return `/api/uploads/${SUBDIR}/${filename}`;
}

function imageAbsolutePathFromPublic(publicPath) {
    if (!publicPath || typeof publicPath !== 'string') return null;
    const prefix = `/api/uploads/${SUBDIR}/`;
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
        .filter((name) => {
            if (name.startsWith('.')) return false;
            const ext = path.extname(name).toLowerCase();
            return ALLOWED_EXT.has(ext);
        });
}

function uniqueImageFilename(originalName) {
    const base = safeBasename(originalName || 'subscribe-popup.avif');
    const ext = path.extname(base).toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.avif';
    return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
}

module.exports = {
    SUBDIR,
    IMAGE_DIR,
    ALLOWED_EXT,
    ensureImageDir,
    imagePublicPath,
    imageAbsolutePathFromPublic,
    deleteImageFile,
    uniqueImageFilename,
    listImageFilenames,
};
