const path = require('path');
const fs = require('fs');

const PROOF_SUBDIR = 'payment-proofs';
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const PROOF_DIR = path.join(UPLOAD_ROOT, PROOF_SUBDIR);

function ensureProofDir() {
    if (!fs.existsSync(PROOF_DIR)) {
        fs.mkdirSync(PROOF_DIR, { recursive: true });
    }
}

/** Public URL path stored in DB, e.g. /api/uploads/payment-proofs/file.jpg */
function proofPublicPath(filename) {
    return `/api/uploads/${PROOF_SUBDIR}/${filename}`;
}

function proofAbsolutePathFromPublic(publicPath) {
    if (!publicPath || typeof publicPath !== 'string') return null;

    const prefix = `/api/uploads/${PROOF_SUBDIR}/`;
    if (publicPath.startsWith(prefix)) {
        const filename = publicPath.slice(prefix.length);
        if (!filename || filename.includes('..') || filename.includes('/')) return null;
        return path.join(PROOF_DIR, filename);
    }

    // Legacy URL only — folder is no longer created
    const legacyPaymentsPrefix = '/api/uploads/payments/';
    if (publicPath.startsWith(legacyPaymentsPrefix)) {
        const filename = publicPath.slice(legacyPaymentsPrefix.length);
        if (!filename || filename.includes('..') || filename.includes('/')) return null;
        const legacyAbs = path.join(UPLOAD_ROOT, 'payments', filename);
        if (fs.existsSync(legacyAbs)) return legacyAbs;
    }

    return null;
}

function createProofUpload() {
    let multer;
    try {
        multer = require('multer');
    } catch {
        return null;
    }
    const { resolveStoredFilename } = require('./safeFilename');
    ensureProofDir();
    return multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => {
                ensureProofDir();
                cb(null, PROOF_DIR);
            },
            filename: (_req, file, cb) => {
                try {
                    const name = resolveStoredFilename({
                        destDir: PROOF_DIR,
                        originalName: file.originalname,
                        publicPathFor: proofPublicPath,
                    });
                    cb(null, name);
                } catch (err) {
                    cb(err);
                }
            },
        }),
        limits: { fileSize: 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
            if (allowed.has(file.mimetype)) return cb(null, true);
            cb(new Error('Use JPG, PNG, WebP, or PDF for payment proof.'));
        },
    });
}

module.exports = {
    PROOF_SUBDIR,
    PROOF_DIR,
    ensureProofDir,
    proofPublicPath,
    proofAbsolutePathFromPublic,
    createProofUpload,
};
