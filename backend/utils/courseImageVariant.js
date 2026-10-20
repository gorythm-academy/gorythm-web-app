const path = require('path');
const fs = require('fs');
const { IMAGE_DIR } = require('./courseImageStorage');

const ALLOWED_WIDTHS = new Set([480, 800, 1200]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

function resolveCourseVariant(requestPath, widthQuery) {
    const width = Number(widthQuery);
    if (!ALLOWED_WIDTHS.has(width)) return null;

    let rel = String(requestPath || '');
    try {
        rel = decodeURIComponent(rel);
    } catch {
        return null;
    }
    rel = rel.replace(/^\/+/, '');
    if (!rel || rel.includes('/') || rel.includes('\\') || rel.includes('\0') || rel.includes('..')) {
        return null;
    }
    if (rel !== path.basename(rel)) return null;

    const ext = path.extname(rel).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return null;
    return { filename: rel, width };
}

function variantFilePath(filename, width) {
    return path.join(IMAGE_DIR, 'variants', String(width), `${filename}.webp`);
}

function deleteCourseImageVariants(filename) {
    if (!filename || filename !== path.basename(filename)) return;
    const root = path.join(IMAGE_DIR, 'variants');
    if (!fs.existsSync(root)) return;
    for (const width of fs.readdirSync(root)) {
        const file = path.join(root, width, `${filename}.webp`);
        if (!fs.existsSync(file)) continue;
        try {
            fs.unlinkSync(file);
        } catch {
            /* ignore */
        }
    }
}

function courseImageVariant(req, res, next) {
    const variant = resolveCourseVariant(req.path, req.query.w);
    if (!variant) return next();

    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        return next();
    }

    const source = path.join(IMAGE_DIR, variant.filename);
    if (!fs.existsSync(source)) return next();

    const dest = variantFilePath(variant.filename, variant.width);

    const send = (file) => {
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.sendFile(file, (err) => {
            if (err) next(err);
        });
    };

    try {
        if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(source).mtimeMs) {
            return send(dest);
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = `${dest}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
        sharp(source)
            .rotate()
            .resize({ width: variant.width, withoutEnlargement: true })
            .webp({ quality: 68 })
            .toFile(tmp)
            .then(() => {
                fs.rmSync(dest, { force: true });
                fs.renameSync(tmp, dest);
                send(dest);
            })
            .catch(() => {
                fs.rmSync(tmp, { force: true });
                next();
            });
    } catch {
        return next();
    }
}

module.exports = {
    ALLOWED_WIDTHS,
    resolveCourseVariant,
    deleteCourseImageVariants,
    courseImageVariant,
};
