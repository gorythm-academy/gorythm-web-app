const path = require('path');
const Course = require('../models/Course');
const PromoVideo = require('../models/PromoVideo');
const ResearchPost = require('../models/ResearchPost');
const { activeCourseFilter } = require('../utils/courseQuery');
const {
    listImageFilenames: listCourseFilenames,
    imagePublicPath: coursePublicPath,
    deleteImageFile: deleteCourseFile,
} = require('../utils/courseImageStorage');
const {
    listThumbFilenames,
    thumbPublicPath,
    deleteThumbFile,
} = require('../utils/promoThumbnailStorage');
const {
    listImageFilenames: listSubscribePopupFilenames,
    imagePublicPath: subscribePopupPublicPath,
    deleteImageFile: deleteSubscribePopupFile,
} = require('../utils/subscribePopupImageStorage');
const {
    listImageFilenames: listResearchFilenames,
    publicPathForFilename: researchPublicPath,
    deleteImageFile: deleteResearchFile,
} = require('../utils/researchImageStorage');
const { getOrCreateSettings } = require('./settingsService');

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

const MEDIA_CATEGORIES = {
    'courses-images': {
        label: 'Course images',
        listFilenames: listCourseFilenames,
        publicPathForFilename: coursePublicPath,
        deleteFile: deleteCourseFile,
        pathPrefix: '/api/uploads/courses-images/',
        async loadReferences() {
            return Course.find({
                homepageImage: { $exists: true, $ne: '' },
                ...activeCourseFilter(),
            })
                .select('title homepageImage _id')
                .lean();
        },
        getPath: (row) => row.homepageImage,
        getTitle: (row) => row.title || 'Untitled',
        async detachPath(publicPath) {
            await Course.updateMany(
                { homepageImage: publicPath, ...activeCourseFilter() },
                { $set: { homepageImage: '' } }
            );
        },
        async countReferences(publicPath, { excludeCourseId = null } = {}) {
            const filter = { homepageImage: publicPath, ...activeCourseFilter() };
            if (excludeCourseId) filter._id = { $ne: excludeCourseId };
            return Course.countDocuments(filter);
        },
    },
    'video-thumbnails': {
        label: 'Video thumbnails',
        listFilenames: listThumbFilenames,
        publicPathForFilename: thumbPublicPath,
        deleteFile: deleteThumbFile,
        pathPrefix: '/api/uploads/video-thumbnails/',
        async loadReferences() {
            return PromoVideo.find({ thumbnailPath: { $exists: true, $ne: '' } })
                .select('name thumbnailPath')
                .lean();
        },
        getPath: (row) => row.thumbnailPath,
        getTitle: (row) => row.name || 'Untitled',
        async detachPath(publicPath) {
            await PromoVideo.updateMany({ thumbnailPath: publicPath }, { $set: { thumbnailPath: '' } });
        },
        async countReferences(publicPath) {
            return PromoVideo.countDocuments({ thumbnailPath: publicPath });
        },
    },
    'research-images': {
        label: 'Research images',
        listFilenames: listResearchFilenames,
        publicPathForFilename: researchPublicPath,
        deleteFile: deleteResearchFile,
        pathPrefix: '/api/uploads/research-images/',
        async loadReferences() {
            return ResearchPost.find({ imagePath: { $exists: true, $ne: '' } })
                .select('title imagePath')
                .lean();
        },
        getPath: (row) => row.imagePath,
        getTitle: (row) => row.title || 'Untitled',
        async detachPath(publicPath) {
            await ResearchPost.updateMany({ imagePath: publicPath }, { $set: { imagePath: '' } });
        },
        async countReferences(publicPath) {
            return ResearchPost.countDocuments({ imagePath: publicPath });
        },
    },
    'subscribe-popup-images': {
        label: 'Subscribe popup images',
        listFilenames: listSubscribePopupFilenames,
        publicPathForFilename: subscribePopupPublicPath,
        deleteFile: deleteSubscribePopupFile,
        pathPrefix: '/api/uploads/subscribe-popup-images/',
        async loadReferences() {
            const settings = await getOrCreateSettings();
            const path = settings.marketing?.subscribePopupImagePath;
            return path ? [{ title: 'Subscribe popup', imagePath: path }] : [];
        },
        getPath: (row) => row.imagePath,
        getTitle: (row) => row.title || 'Subscribe popup',
        async detachPath(publicPath) {
            const settings = await getOrCreateSettings();
            if (settings.marketing?.subscribePopupImagePath === publicPath) {
                settings.marketing = { ...settings.marketing, subscribePopupImagePath: '' };
                await settings.save();
            }
        },
        async countReferences(publicPath) {
            const settings = await getOrCreateSettings();
            return settings.marketing?.subscribePopupImagePath === publicPath ? 1 : 0;
        },
    },
};

function normalizeCategory(raw) {
    const category = String(raw || '').trim();
    if (!MEDIA_CATEGORIES[category]) {
        throw new Error(
            `Invalid category. Use one of: ${Object.keys(MEDIA_CATEGORIES).join(', ')}`
        );
    }
    return category;
}

function filterImageFilenames(filenames) {
    return filenames.filter((name) => {
        if (!name || name.startsWith('.')) return false;
        return ALLOWED_IMAGE_EXT.has(path.extname(name).toLowerCase());
    });
}

function assertPathInCategory(category, publicPath) {
    const cfg = MEDIA_CATEGORIES[category];
    const normalized = String(publicPath || '').trim();
    if (!normalized.startsWith(cfg.pathPrefix)) {
        throw new Error('Path does not belong to this media category');
    }
    const filename = normalized.slice(cfg.pathPrefix.length);
    if (!filename || filename.includes('..') || filename.includes('/')) {
        throw new Error('Invalid media path');
    }
    return normalized;
}

function buildUsageMap(rows, cfg) {
    const usageByPath = new Map();
    rows.forEach((row) => {
        const key = cfg.getPath(row);
        if (!key) return;
        if (!usageByPath.has(key)) usageByPath.set(key, []);
        usageByPath.get(key).push(cfg.getTitle(row));
    });
    return usageByPath;
}

async function buildGallery(categoryKey) {
    const category = normalizeCategory(categoryKey);
    const cfg = MEDIA_CATEGORIES[category];
    const filenames = filterImageFilenames(cfg.listFilenames());
    const pathsOnDisk = new Set(filenames.map((name) => cfg.publicPathForFilename(name)));
    const references = await cfg.loadReferences();
    const usageByPath = buildUsageMap(references, cfg);

    const images = filenames
        .map((filename) => {
            const imagePath = cfg.publicPathForFilename(filename);
            const usedByTitles = usageByPath.get(imagePath) || [];
            const item = {
                category,
                filename,
                path: imagePath,
                usedBy: usedByTitles.length,
                usedByTitles,
                onDisk: true,
            };
            if (category === 'courses-images') {
                item.usedByCourseIds = references
                    .filter((row) => cfg.getPath(row) === imagePath)
                    .map((row) => String(row._id));
            }
            return item;
        })
        .sort((a, b) => b.filename.localeCompare(a.filename));

    const broken = [];
    usageByPath.forEach((usedByTitles, imagePath) => {
        if (pathsOnDisk.has(imagePath)) return;
        broken.push({
            category,
            filename: imagePath.split('/').pop() || imagePath,
            path: imagePath,
            usedBy: usedByTitles.length,
            usedByTitles,
            onDisk: false,
        });
    });

    return [...images, ...broken];
}

async function cleanupOrphan(categoryKey, publicPath) {
    const category = normalizeCategory(categoryKey);
    const cfg = MEDIA_CATEGORIES[category];
    const normalized = assertPathInCategory(category, publicPath);
    const inUse = await cfg.countReferences(normalized);
    if (inUse === 0) cfg.deleteFile(normalized);
}

async function deleteMedia(categoryKey, publicPath, { force = false, excludeCourseId = null } = {}) {
    const category = normalizeCategory(categoryKey);
    const cfg = MEDIA_CATEGORIES[category];
    const normalized = assertPathInCategory(category, publicPath);

    const countOpts = excludeCourseId ? { excludeCourseId } : {};
    const inUse = await cfg.countReferences(normalized, countOpts);

    if (inUse > 0 && !force) {
        const references = await cfg.loadReferences();
        const titles = references
            .filter((row) => cfg.getPath(row) === normalized)
            .filter((row) => !excludeCourseId || String(row._id) !== String(excludeCourseId))
            .map((row) => cfg.getTitle(row));
        const error = new Error(
            titles.length
                ? `File is used by ${inUse} record(s): ${titles.join(', ')}.`
                : `File is used by ${inUse} record(s).`
        );
        error.statusCode = 409;
        error.inUse = true;
        error.usedByTitles = titles;
        throw error;
    }

    if (inUse > 0 && force) {
        await cfg.detachPath(normalized);
    }

    if (excludeCourseId && category === 'courses-images') {
        await Course.updateMany(
            { _id: excludeCourseId, homepageImage: normalized, ...activeCourseFilter() },
            { $set: { homepageImage: '' } }
        );
    }

    cfg.deleteFile(normalized);
    return { detachedRecords: force ? inUse : 0 };
}

module.exports = {
    MEDIA_CATEGORIES,
    MEDIA_CATEGORY_KEYS: Object.keys(MEDIA_CATEGORIES),
    normalizeCategory,
    buildGallery,
    cleanupOrphan,
    deleteMedia,
};
