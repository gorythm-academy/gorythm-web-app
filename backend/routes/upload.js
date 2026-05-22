const express = require('express');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

let multer;
try {
    multer = require('multer');
} catch (err) {
    router.post('/', authMiddleware, (_req, res) => {
        res.status(503).json({
            success: false,
            error: 'File upload is not available on the server. In the backend folder run: npm ci --omit=dev',
        });
    });
    module.exports = router;
    return;
}

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const safe = String(file.originalname || 'file')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 80);
        cb(null, `${Date.now()}-${safe}`);
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

router.post('/', authMiddleware, (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ success: false, error: err.message || 'Upload failed' });
        }
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }
            const url = `/api/uploads/${req.file.filename}`;
            res.status(201).json({
                success: true,
                url,
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
