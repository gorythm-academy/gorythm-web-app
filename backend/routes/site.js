const express = require('express');
const ResearchPost = require('../models/ResearchPost');
const Course = require('../models/Course');
const { getOrCreateSettings } = require('../services/settingsService');
const { serializeSubscribePopup } = require('../services/subscribePopupSettings');
const { activeLmsFilter } = require('../utils/lmsTrashQuery');

const router = express.Router();

const SITE_URL = (process.env.FRONTEND_URL || 'https://gorythmacademy.com').replace(/\/$/, '');

router.get('/subscribe-popup', async (req, res) => {
    try {
        const settings = await getOrCreateSettings();
        return res.json({
            success: true,
            popup: serializeSubscribePopup(settings.marketing || {}),
        });
    } catch (error) {
        req.log?.error?.('subscribe-popup config', { err: error });
        return res.status(500).json({ success: false, error: 'Failed to load popup settings' });
    }
});

router.get('/sitemap.xml', async (req, res) => {
    try {
        const [posts, courses] = await Promise.all([
            ResearchPost.find({ isPublished: { $ne: false }, ...activeLmsFilter() })
                .select('slug updatedAt publishedAt')
                .sort({ publishedAt: -1 })
                .lean(),
            Course.find({ isPublished: { $ne: false }, ...activeLmsFilter() })
                .select('slug updatedAt')
                .sort({ updatedAt: -1 })
                .lean(),
        ]);

        const staticPaths = [
            { loc: '/', priority: '1.0', changefreq: 'weekly' },
            { loc: '/courses', priority: '0.9', changefreq: 'weekly' },
            { loc: '/about', priority: '0.8', changefreq: 'monthly' },
            { loc: '/contact', priority: '0.8', changefreq: 'monthly' },
            { loc: '/research', priority: '0.9', changefreq: 'weekly' },
            { loc: '/mission/iq', priority: '0.6', changefreq: 'yearly' },
            { loc: '/mission/eq', priority: '0.6', changefreq: 'yearly' },
            { loc: '/mission/phq', priority: '0.6', changefreq: 'yearly' },
        ];

        const formatDate = (value) => {
            const d = value ? new Date(value) : new Date();
            return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
        };

        const urls = [
            ...staticPaths.map((item) => ({
                loc: `${SITE_URL}${item.loc === '/' ? '/' : item.loc}`,
                lastmod: formatDate(),
                changefreq: item.changefreq,
                priority: item.priority,
            })),
            ...courses.map((course) => ({
                loc: `${SITE_URL}/courses/${encodeURIComponent(course.slug)}`,
                lastmod: formatDate(course.updatedAt),
                changefreq: 'weekly',
                priority: '0.8',
            })),
            ...posts.map((post) => ({
                loc: `${SITE_URL}/research/${encodeURIComponent(post.slug)}`,
                lastmod: formatDate(post.updatedAt || post.publishedAt),
                changefreq: 'monthly',
                priority: '0.75',
            })),
        ];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
    .map(
        (u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    )
    .join('\n')}
</urlset>`;

        res.type('application/xml');
        return res.send(xml);
    } catch (error) {
        req.log?.error?.('sitemap', { err: error });
        return res.status(500).type('text/plain').send('Failed to generate sitemap');
    }
});

module.exports = router;
