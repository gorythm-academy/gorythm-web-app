const path = require('path');
const fs = require('fs');
const { resolveStoredFilename } = require('./safeFilename');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

/** admin / teacher / student subfolders under these */
const ROLE_SUBDIR_CATEGORIES = new Set(['assignments', 'quizzes']);

/** Single shared folder (no role subfolders) */
const FLAT_LMS_CATEGORIES = new Set(['content/books']);

const LMS_CATEGORIES = new Set([...ROLE_SUBDIR_CATEGORIES, ...FLAT_LMS_CATEGORIES]);

const PORTAL_UPLOAD_ROLES = new Set(['manager', 'teacher', 'student']);

const CATEGORY_DIRS = {
    books: 'content/books',
    'content/books': 'content/books',
    research: 'research-images',
    'research-images': 'research-images',
    courses: 'courses-images',
    'courses-images': 'courses-images',
    videos: 'video-thumbnails',
    'video-thumbnails': 'video-thumbnails',
};

const ALLOWED_CATEGORIES = new Set([
    'assignments',
    'quizzes',
    'content/books',
    'research-images',
    'courses-images',
    'video-thumbnails',
]);

function normalizeCategory(raw) {
    const key = String(raw || '').trim().toLowerCase();
    if (key === 'books') return 'content/books';
    if (key === 'research') return 'research-images';
    if (key === 'courses') return 'courses-images';
    if (key === 'videos') return 'video-thumbnails';
    if (ALLOWED_CATEGORIES.has(key)) return key;
    return null;
}

function normalizeUploaderRole(user) {
    const role = String(user?.role || '').toLowerCase();
    if (role === 'super-admin' || role === 'manager') return 'admin';
    if (role === 'teacher') return 'teacher';
    if (role === 'student') return 'student';
    if (role === 'parent') return 'student';
    return null;
}

/** assignments/admin … or flat content/books */
function subdirForCategoryAndRole(category, uploaderRole) {
    const normalized = normalizeCategory(category);
    if (!normalized || !LMS_CATEGORIES.has(normalized)) return null;

    if (FLAT_LMS_CATEGORIES.has(normalized)) {
        return 'content/books';
    }

    if (!ROLE_SUBDIR_CATEGORIES.has(normalized) || !PORTAL_UPLOAD_ROLES.has(uploaderRole)) {
        return null;
    }
    return `${normalized}/${uploaderRole}`;
}

function ensureDir(subdir) {
    if (!subdir) return null;
    const abs = path.join(UPLOAD_ROOT, subdir);
    if (!fs.existsSync(abs)) {
        fs.mkdirSync(abs, { recursive: true });
    }
    return abs;
}

function ensureCategoryDir(category, uploaderRole) {
    const subdir = subdirForCategoryAndRole(category, uploaderRole);
    return ensureDir(subdir);
}

function ensureAllCategoryDirs() {
    for (const role of PORTAL_UPLOAD_ROLES) {
        ensureDir(`assignments/${role}`);
        ensureDir(`quizzes/${role}`);
    }
    ensureDir('content/books');
    ensureDir('research-images');
    ensureDir('courses-images');
    ensureDir('video-thumbnails');
    ensureDir('payment-proofs');
}

function categoryPublicPath(category, uploaderRole, filename) {
    const subdir = subdirForCategoryAndRole(category, uploaderRole);
    if (!subdir || !filename) return null;
    return `/api/uploads/${subdir}/${filename}`;
}

function categoryAbsolutePathFromPublic(publicPath) {
    if (!publicPath || typeof publicPath !== 'string') return null;
    if (!publicPath.startsWith('/api/uploads/')) return null;

    const relative = publicPath.slice('/api/uploads/'.length);
    if (!relative || relative.includes('..')) return null;

    const abs = path.join(UPLOAD_ROOT, ...relative.split('/'));
    const normalizedRoot = path.normalize(UPLOAD_ROOT);
    const normalizedAbs = path.normalize(abs);
    if (!normalizedAbs.startsWith(normalizedRoot)) return null;
    return normalizedAbs;
}

function resolveCategoryUploadFilename({ category, uploaderRole, originalName, overrideName, replacePath }) {
    const normalized = normalizeCategory(category);
    const destDir = ensureCategoryDir(category, uploaderRole);
    if (!destDir) {
        if (FLAT_LMS_CATEGORIES.has(normalized)) {
            throw new Error('Invalid books upload path.');
        }
        throw new Error(
            'Invalid upload. Use assignments or quizzes (admin/teacher/student) or content/books.'
        );
    }
    return resolveStoredFilename({
        destDir,
        originalName,
        overrideName,
        replacePath,
        publicPathFor: (filename) => categoryPublicPath(category, uploaderRole, filename),
    });
}

module.exports = {
    UPLOAD_ROOT,
    ALLOWED_CATEGORIES,
    LMS_CATEGORIES,
    ROLE_SUBDIR_CATEGORIES,
    FLAT_LMS_CATEGORIES,
    PORTAL_UPLOAD_ROLES,
    normalizeCategory,
    normalizeUploaderRole,
    subdirForCategoryAndRole,
    ensureCategoryDir,
    ensureAllCategoryDirs,
    categoryPublicPath,
    categoryAbsolutePathFromPublic,
    resolveCategoryUploadFilename,
};
