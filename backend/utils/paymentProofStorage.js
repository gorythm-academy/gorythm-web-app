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
    if (!publicPath.startsWith(prefix)) return null;
    const filename = publicPath.slice(prefix.length);
    if (!filename || filename.includes('..') || filename.includes('/')) return null;
    return path.join(PROOF_DIR, filename);
}

module.exports = {
    PROOF_SUBDIR,
    PROOF_DIR,
    ensureProofDir,
    proofPublicPath,
    proofAbsolutePathFromPublic,
};
