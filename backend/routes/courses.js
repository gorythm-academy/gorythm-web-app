const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { validate, rules } = require('../middleware/validate');

// Get all courses (admin)
router.get('/', async (req, res) => {
    try {
        const courses = await Course.find()
            .populate('instructor', 'name email')
            .sort({ createdAt: -1 });

        // Source of truth for membership: enrollments linked to People students.
        const enrollmentStats = await Enrollment.aggregate([
            {
                $match: {
                    course: { $ne: null },
                    student: { $ne: null },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'student',
                    foreignField: '_id',
                    as: 'studentDoc',
                },
            },
            { $unwind: '$studentDoc' },
            { $match: { 'studentDoc.role': 'student' } },
            {
                $group: {
                    _id: '$course',
                    studentIds: { $addToSet: '$student' },
                },
            },
        ]);

        const byCourseStudentCount = new Map();
        const uniqueStudentIdSet = new Set();
        enrollmentStats.forEach((row) => {
            const ids = row.studentIds || [];
            byCourseStudentCount.set(String(row._id), ids.length);
            ids.forEach((id) => uniqueStudentIdSet.add(String(id)));
        });

        const mappedCourses = courses.map((course) => {
            return {
                _id: course._id,
                title: course.title,
                description: course.description,
                category: course.category,
                price: course.price,
                duration: course.duration,
                level: course.level,
                students: byCourseStudentCount.get(String(course._id)) || 0,
                status: course.isPublished ? 'published' : 'draft',
                instructor: course.instructor,
                instructorName: course.instructorName || '',
                homepageImage: course.homepageImage || '',
                displayOrder: Number.isFinite(Number(course.displayOrder)) ? Number(course.displayOrder) : 9999,
                masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? Number(course.masonryColumn) : null,
                slug: course.slug || '',
                createdAt: course.createdAt
            };
        });

        res.json({
            success: true,
            courses: mappedCourses,
            totalUniqueStudents: uniqueStudentIdSet.size
        });
    } catch (error) {
        req.log.error('Error fetching courses', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch courses' });
    }
});

// Category order for listing: Quran, Tajweed, Islamic Studies, Seerah, STEM, then rest
const PUBLIC_CATEGORY_ORDER = [
    'Quranic Arabic', 'Tajweed', 'Islamic Studies', 'Seerah', 'STEM',
    'Memorization (Hifz)', 'Fiqh', 'Hadith', 'Aqeedah', 'Other'
];
const getCategorySortIndex = (category) => {
    const i = PUBLIC_CATEGORY_ORDER.indexOf(category || '');
    return i === -1 ? PUBLIC_CATEGORY_ORDER.length : i;
};

// Get published courses only (public, no auth) – for homepage & All Courses
router.get('/public', async (req, res) => {
    try {
        // Short CDN/browser cache for public catalog to improve page load on Vercel.
        res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

        const raw = await Course.find({ isPublished: true })
            .select('title description category price duration level homepageImage displayOrder masonryColumn slug _id');
        const courses = raw
            .map(course => ({
                _id: course._id,
                title: course.title,
                description: course.description,
                category: course.category,
                price: course.price,
                duration: course.duration,
                level: course.level,
                homepageImage: course.homepageImage || '',
                displayOrder: Number.isFinite(Number(course.displayOrder)) ? Number(course.displayOrder) : 9999,
                masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? Number(course.masonryColumn) : null,
                slug: course.slug || ''
            }))
            .sort((a, b) => {
                const orderA = Number.isFinite(Number(a.displayOrder)) ? Number(a.displayOrder) : 9999;
                const orderB = Number.isFinite(Number(b.displayOrder)) ? Number(b.displayOrder) : 9999;
                if (orderA !== orderB) return orderA - orderB;
                const catA = getCategorySortIndex(a.category);
                const catB = getCategorySortIndex(b.category);
                if (catA !== catB) return catA - catB;
                return (a.title || '').localeCompare(b.title || '');
            });
        res.json({ success: true, courses });
    } catch (error) {
        req.log.error('Error fetching public courses', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch courses' });
    }
});

// Get single course by Mongo id or by slug (public) – for SingleCourse page
router.get('/:id', async (req, res) => {
    try {
        const param = req.params.id;
        let course = null;
        if (mongoose.isValidObjectId(param)) {
            course = await Course.findById(param).populate('instructor', 'name email');
        }
        if (!course && param) {
            course = await Course.findOne({ slug: param, isPublished: true }).populate('instructor', 'name email');
        }
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }
        if (course.isPublished) {
            res.set('Cache-Control', 'public, max-age=60, s-maxage=180, stale-while-revalidate=300');
        } else {
            res.set('Cache-Control', 'no-store');
        }
        res.json({
            success: true,
            course: {
                _id: course._id,
                title: course.title,
                description: course.description,
                category: course.category,
                price: course.price,
                duration: course.duration,
                level: course.level,
                instructorName: course.instructorName || (course.instructor && course.instructor.name) || '',
                homepageImage: course.homepageImage || '',
                imageUrl: course.imageUrl || '',
                displayOrder: Number.isFinite(Number(course.displayOrder)) ? Number(course.displayOrder) : 9999,
                masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? Number(course.masonryColumn) : null,
                slug: course.slug || '',
                modules: course.modules || [],
                students: course.students?.length ?? 0,
                isPublished: course.isPublished,
                createdAt: course.createdAt
            }
        });
    } catch (error) {
        req.log.error('Error fetching course', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch course' });
    }
});

function slugFromTitle(title) {
    if (!title || typeof title !== 'string') return '';
    return title.toLowerCase().trim()
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

// Create new course
router.post(
    '/',
    validate([
        rules.requiredString('title', 'Title'),
        rules.requiredString('description', 'Description'),
        rules.requiredString('category', 'Category'),
    ]),
    async (req, res) => {
    try {
        req.log.info('Creating course', {
            title: req.body?.title,
            category: req.body?.category,
            status: req.body?.status,
        });
        const requestedSlug = (req.body.slug && String(req.body.slug).trim()) || slugFromTitle(req.body.title);
        const uniqueSlug = await buildUniqueSlug(requestedSlug);
        
        const course = new Course({
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            price: req.body.price,
            duration: req.body.duration || '8 weeks',
            level: req.body.level || 'beginner',
            instructor: req.body.instructorId || '65a1b2c3d4e5f67890123456', // Default admin ID
            instructorName: req.body.instructorName || '',
            modules: [],
            students: [],
            homepageImage: (req.body.homepageImage && String(req.body.homepageImage).trim()) || '',
            displayOrder: Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : 9999,
            masonryColumn: [1, 2, 3].includes(Number(req.body.masonryColumn)) ? Number(req.body.masonryColumn) : null,
            slug: uniqueSlug,
            isPublished: req.body.status === 'published'
        });

        await course.save();

        req.log.info('Course created', { courseId: String(course._id) });

        res.json({
            success: true,
            message: 'Course created successfully',
            course: course
        });
    } catch (error) {
        req.log.error('Error creating course', { err: error });
        res.status(500).json({ success: false, error: 'Failed to create course: ' + error.message });
    }
});

// Update entire course
router.put(
    '/:id',
    validate([
        rules.requiredString('title', 'Title'),
        rules.requiredString('description', 'Description'),
        rules.requiredString('category', 'Category'),
    ]),
    async (req, res) => {
    try {
        req.log.info('Updating course', {
            courseId: req.params.id,
            fields: Object.keys(req.body || {}),
        });

        const course = await Course.findById(req.params.id);
        if (!course) {
            req.log.warn('Course not found for update', { courseId: req.params.id });
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        const previousTitle = course.title;
        const hasExplicitSlug = Object.prototype.hasOwnProperty.call(req.body, 'slug');

        // Update all fields
        course.title = req.body.title || course.title;
        course.description = req.body.description || course.description;
        course.category = req.body.category || course.category;
        course.price = req.body.price !== undefined ? req.body.price : course.price;
        course.duration = req.body.duration || course.duration;
        course.level = req.body.level || course.level;
        course.isPublished = req.body.status === 'published';
        if (req.body.instructorId) course.instructor = req.body.instructorId;
        if (req.body.instructorName !== undefined) course.instructorName = req.body.instructorName || '';
        if (req.body.homepageImage !== undefined) course.homepageImage = String(req.body.homepageImage || '').trim();
        if (req.body.displayOrder !== undefined) {
            course.displayOrder = Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : 9999;
        }
        if (req.body.masonryColumn !== undefined) {
            course.masonryColumn = [1, 2, 3].includes(Number(req.body.masonryColumn)) ? Number(req.body.masonryColumn) : null;
        }
        if (hasExplicitSlug) {
            const requestedSlug = String(req.body.slug || '').trim() || slugFromTitle(course.title);
            course.slug = await buildUniqueSlug(requestedSlug, course._id);
        } else if (!course.slug || course.title !== previousTitle) {
            course.slug = await buildUniqueSlug(course.title, course._id);
        }

        await course.save();

        req.log.info('Course updated', { courseId: String(course._id) });

        res.json({
            success: true,
            message: 'Course updated successfully',
            course: course
        });
    } catch (error) {
        req.log.error('Error updating course', { err: error });
        res.status(500).json({ success: false, error: 'Failed to update course: ' + error.message });
    }
});

// Update course status only
router.patch(
    '/:id/status',
    validate([rules.enum('status', 'Status', ['published', 'draft'])]),
    async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        course.isPublished = req.body.status === 'published';
        await course.save();

        res.json({
            success: true,
            message: `Course ${course.isPublished ? 'published' : 'set to draft'}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update course' });
    }
});

// Delete course
router.delete('/:id', async (req, res) => {
    try {
        req.log.info('Deleting course', { courseId: req.params.id });

        const course = await Course.findByIdAndDelete(req.params.id);
        
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        res.json({
            success: true,
            message: 'Course deleted successfully'
        });
    } catch (error) {
        req.log.error('Error deleting course', { err: error });
        res.status(500).json({ success: false, error: 'Failed to delete course' });
    }
});

// FIXED: Bulk delete courses - ADD THIS ROUTE
router.post(
    '/bulk-delete',
    validate([rules.arrayNonEmpty('ids', 'Course IDs')]),
    async (req, res) => {
    try {
        const { ids } = req.body;
        req.log.info('Bulk delete courses', { count: Array.isArray(ids) ? ids.length : 0 });
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No course IDs provided' });
        }

        const result = await Course.deleteMany({ _id: { $in: ids } });

        req.log.info('Bulk delete courses completed', { deletedCount: result.deletedCount });

        res.json({
            success: true,
            message: `${result.deletedCount} course(s) deleted successfully`
        });
    } catch (error) {
        req.log.error('Error bulk deleting courses', { err: error });
        res.status(500).json({ success: false, error: 'Failed to delete courses' });
    }
});

// Bulk update status
router.patch(
    '/bulk-status',
    validate([
        rules.arrayNonEmpty('courseIds', 'Course IDs'),
        rules.enum('status', 'Status', ['published', 'draft']),
    ]),
    async (req, res) => {
    try {
        const { courseIds, status } = req.body;
        
        if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No course IDs provided' });
        }

        if (!['published', 'draft'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        await Course.updateMany(
            { _id: { $in: courseIds } },
            { isPublished: status === 'published' }
        );

        res.json({
            success: true,
            message: `${courseIds.length} course(s) set to ${status}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update courses' });
    }
});

module.exports = router;