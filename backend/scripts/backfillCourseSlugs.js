const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Course = require('../models/Course');
const logger = require('../utils/logger');

function slugFromTitle(title) {
    if (!title || typeof title !== 'string') return '';
    return title
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

async function buildUniqueSlug(raw, excludeId = null) {
    const base = slugFromTitle(raw);
    if (!base) return '';

    let candidate = base;
    let suffix = 2;
    while (true) {
        const query = { slug: candidate };
        if (excludeId) query._id = { $ne: excludeId };
        const existing = await Course.findOne(query).select('_id').lean();
        if (!existing) return candidate;
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
}

async function backfillCourseSlugs() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in backend/.env');
        }

        logger.info('Connecting to MongoDB');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: 'gorythm_academy',
        });
        logger.info('MongoDB connected');

        const courses = await Course.find().select('_id title slug').sort({ createdAt: 1 }).lean();
        let updated = 0;
        let skipped = 0;

        for (const course of courses) {
            const nextSlug = await buildUniqueSlug(course.slug || course.title, course._id);
            if (!nextSlug) {
                skipped += 1;
                continue;
            }

            if (course.slug === nextSlug) {
                skipped += 1;
                continue;
            }

            await Course.updateOne({ _id: course._id }, { $set: { slug: nextSlug } });
            updated += 1;
            logger.info('Course slug updated', { title: course.title, slug: nextSlug });
        }

        // Ensure DB has the latest indexes from the model (including unique slug index).
        await Course.syncIndexes();

        logger.info('Backfill course slugs done', { updated, skipped });
        process.exitCode = 0;
    } catch (error) {
        logger.error('Failed to backfill course slugs', { err: error });
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            logger.info('MongoDB connection closed');
        }
    }
}

backfillCourseSlugs();
