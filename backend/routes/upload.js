const express = require('express');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const {
    normalizeCategory,
    normalizeUploaderRole,
    ensureCategoryDir,
    ensureAllCategoryDirs,
    categoryPublicPath,
    resolveCategoryUploadFilename,
    LMS_CATEGORIES,
    FLAT_LMS_CATEGORIES,
} = require('../utils/uploadStorage');

const router = express.Router();

let multer;
try {
    multer = require('multer');
} catch (err) {
    router.post('/', authMiddleware, validateSessionUser, (_req, res) => {
        res.status(503).json({
            success: false,
            error: 'File upload is not available on the server. In the backend folder run: npm ci --omit=dev',
        });
    });
    module.exports = router;
    return;
}

ensureAllCategoryDirs();

const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function uploadContext(req) {
    const category = normalizeCategory(req.body?.category) || 'assignments';
    if (!LMS_CATEGORIES.has(category)) {
        throw new Error(`Invalid category. Use one of: ${[...LMS_CATEGORIES].join(', ')}`);
    }
    const uploaderRole = normalizeUploaderRole(req.user);
    if (FLAT_LMS_CATEGORIES.has(category)) {
        if (!req.user?.userId) {
            throw new Error('Login required to upload files.');
        }
        return { category, uploaderRole: uploaderRole || 'shared' };
    }
    if (!uploaderRole) {
        throw new Error('Only admin, teacher, or student accounts can upload here.');
    }
    return { category, uploaderRole };
}

const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        try {
            const { category, uploaderRole } = uploadContext(req);
            const dir = ensureCategoryDir(category, uploaderRole);
            cb(null, dir);
        } catch (err) {
            cb(err);
        }
    },
    filename: (req, file, cb) => {
        try {
            const { category, uploaderRole } = uploadContext(req);
            const name = resolveCategoryUploadFilename({
                category,
                uploaderRole,
                originalName: file.originalname,
                overrideName: req.body?.filename,
                replacePath: req.body?.replacePath,
            });
            cb(null, name);
        } catch (err) {
            cb(err);
        }
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
        cb(new Error('File type not allowed. Use PDF, Word, or images.'));
    },
});

router.post('/', authMiddleware, validateSessionUser, (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
        }
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }
            const { category, uploaderRole } = uploadContext(req);
            const url = categoryPublicPath(category, uploaderRole, req.file.filename);
            if (!url) {
                return res.status(400).json({ success: false, error: 'Invalid upload path' });
            }
            res.status(201).json({
                success: true,
                url,
                category,
                uploaderRole,
                filename: req.file.filename,
                originalName: req.file.originalname,
                size: req.file.size,
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message || 'Upload failed' });
        }
    });
});

module.exports = router;
