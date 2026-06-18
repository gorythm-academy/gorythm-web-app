const path = require('path');
const fs = require('fs');

const IMAGE_SUBDIR = 'research-images';
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const IMAGE_DIR = path.join(UPLOAD_ROOT, IMAGE_SUBDIR);

function ensureImageDir() {
    if (!fs.existsSync(IMAGE_DIR)) {
        fs.mkdirSync(IMAGE_DIR, { recursive: true });
    }
}

/** Public URL path stored in DB, e.g. /api/uploads/research-images/file.jpg */
function imagePublicPath(filename) {
    return `/api/uploads/${IMAGE_SUBDIR}/${filename}`;
}

function imageAbsolutePathFromPublic(publicPath) {
    if (!publicPath || typeof publicPath !== 'string') return null;

    const prefix = `/api/uploads/${IMAGE_SUBDIR}/`;
    if (publicPath.startsWith(prefix)) {
        const filename = publicPath.slice(prefix.length);
        if (!filename || filename.includes('..') || filename.includes('/')) return null;
        return path.join(IMAGE_DIR, filename);
    }

    // Legacy paths from brief use of uploads/research/
    const legacyResearchPrefix = '/api/uploads/research/';
    if (publicPath.startsWith(legacyResearchPrefix)) {
        const filename = publicPath.slice(legacyResearchPrefix.length);
        if (!filename || filename.includes('..') || filename.includes('/')) return null;
        const legacyAbs = path.join(UPLOAD_ROOT, 'research', filename);
        if (fs.existsSync(legacyAbs)) return legacyAbs;
    }

    return null;
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

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

function sanitizeResearchImageFilename(raw, fallbackExt = '.jpg') {
    let name = String(raw || '').trim();
    if (!name) return null;

    name = name.replace(/^.*[\\/]/, '');
    let ext = path.extname(name).toLowerCase();
    let base = name;

    if (ext && ALLOWED_EXT.has(ext)) {
        base = name.slice(0, -ext.length);
    } else {
        ext = ALLOWED_EXT.has(fallbackExt) ? fallbackExt : '.jpg';
    }

    base = base
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!base) return null;

    const full = `${base}${ext}`;
    if (full.length > 120) return null;
    return full;
}

function absolutePathForFilename(filename) {
    if (!filename || filename.includes('..') || filename.includes('/')) return null;
    return path.join(IMAGE_DIR, filename);
}

function renameImageFile(oldPublicPath, newFilename) {
    const oldAbs = imageAbsolutePathFromPublic(oldPublicPath);
    const newAbs = absolutePathForFilename(newFilename);
    if (!oldAbs || !newAbs || !fs.existsSync(oldAbs)) {
        throw new Error('Original image file not found.');
    }
    if (fs.existsSync(newAbs) && newAbs !== oldAbs) {
        throw new Error(`"${newFilename}" already exists. Choose a different name.`);
    }
    ensureImageDir();
    fs.renameSync(oldAbs, newAbs);
    return imagePublicPath(newFilename);
}

function publicPathForFilename(filename) {
    return imagePublicPath(filename);
}

module.exports = {
    IMAGE_SUBDIR,
    IMAGE_DIR,
    ALLOWED_EXT,
    ensureImageDir,
    imagePublicPath,
    imageAbsolutePathFromPublic,
    deleteImageFile,
    listImageFilenames,
    sanitizeResearchImageFilename,
    absolutePathForFilename,
    renameImageFile,
    publicPathForFilename,
};
