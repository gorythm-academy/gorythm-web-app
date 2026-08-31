const Course = require('../../models/Course');
const { publishedActiveCourseFilter } = require('../../utils/courseQuery');

function parseListPagination(req, defaultLimit = 25) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
    return { page, limit, skip: (page - 1) * limit };
}

function parseMetaOnly(req) {
    return req.query.metaOnly === '1' || req.query.metaOnly === 'true';
}

function parseIncludeMeta(req) {
    return req.query.includeMeta === '1' || req.query.includeMeta === 'true';
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadActiveCoursesMeta() {
    return Course.find({ ...publishedActiveCourseFilter() })
        .select('title instructorName')
        .sort({ title: 1 })
        .lean();
}

module.exports = {
    parseListPagination,
    parseMetaOnly,
    parseIncludeMeta,
    escapeRegex,
    loadActiveCoursesMeta,
};
