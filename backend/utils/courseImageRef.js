/**
 * Course photos must be files we host (an upload or a path under /images).
 * Full links to Unsplash and other outside sites are rejected.
 */
function localCourseImagePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return { ok: true, value: '' };

    if (/unsplash\.com/i.test(raw)) {
        return { ok: false, error: 'Course photos must be uploaded files, not an Unsplash link.' };
    }

    if (/^https?:\/\//i.test(raw)) {
        let pathname = '';
        try {
            pathname = new URL(raw).pathname || '';
        } catch {
            pathname = '';
        }
        const owned = pathname.startsWith('/api/uploads/') || pathname.startsWith('/images/');
        if (!owned) {
            return { ok: false, error: 'Course photos must be uploaded files, not an outside image link.' };
        }
    }

    return { ok: true, value: raw };
}

function assertLocalCourseImage(value) {
    const result = localCourseImagePath(value);
    if (!result.ok) {
        const err = new Error(result.error);
        err.status = 400;
        throw err;
    }
    return result.value;
}

module.exports = {
    localCourseImagePath,
    assertLocalCourseImage,
};
