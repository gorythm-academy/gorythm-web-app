const { normalizeUploadPublicPath } = require('./uploadUrlMatch');

const ALLOWED_STUDENT_PREFIXES = [
    '/api/uploads/assignments/student/',
];

function validateStudentSubmissionAttachments(attachments) {
    if (!Array.isArray(attachments)) {
        return { ok: false, error: 'Invalid attachments' };
    }
    if (attachments.length > 5) {
        return { ok: false, error: 'Too many attachments (max 5)' };
    }
    const normalized = [];
    for (const raw of attachments) {
        const path = normalizeUploadPublicPath(raw);
        if (!path) {
            return { ok: false, error: 'Invalid attachment URL' };
        }
        if (!ALLOWED_STUDENT_PREFIXES.some((p) => path.startsWith(p))) {
            return {
                ok: false,
                error: 'Attachments must be files you uploaded for this assignment',
            };
        }
        if (path.includes('..')) {
            return { ok: false, error: 'Invalid attachment path' };
        }
        normalized.push(path);
    }
    return { ok: true, attachments: normalized };
}

module.exports = { validateStudentSubmissionAttachments };
