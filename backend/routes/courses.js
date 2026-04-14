const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Course = require('../models/Course');

// Get all courses (admin)
router.get('/', async (req, res) => {
    try {
        const courses = await Course.find()
            .populate('instructor', 'name email')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            courses: courses.map(course => ({
                _id: course._id,
                title: course.title,
                description: course.description,
                category: course.category,
                price: course.price,
                duration: course.duration,
                level: course.level,
                students: course.students.length,
                status: course.isPublished ? 'published' : 'draft',
                instructor: course.instructor,
                instructorName: course.instructorName || '',
                homepageImage: course.homepageImage || '',
                slug: course.slug || '',
                createdAt: course.createdAt
            }))
        });
    } catch (error) {
        console.error('Error fetching courses:', error);
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
            .select('title description category price duration level homepageImage slug _id');
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
                slug: course.slug || ''
            }))
            .sort((a, b) => {
                const catA = getCategorySortIndex(a.category);
                const catB = getCategorySortIndex(b.category);
                if (catA !== catB) return catA - catB;
                return (a.title || '').localeCompare(b.title || '');
            });
        res.json({ success: true, courses });
    } catch (error) {
        console.error('Error fetching public courses:', error);
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
                slug: course.slug || '',
                modules: course.modules || [],
                students: course.students?.length ?? 0,
                isPublished: course.isPublished,
                createdAt: course.createdAt
            }
        });
    } catch (error) {
        console.error('Error fetching course:', error);
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
router.post('/', async (req, res) => {
    try {
        console.log('Creating course with data:', req.body);
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
            slug: uniqueSlug,
            isPublished: req.body.status === 'published'
        });

        await course.save();
        
        console.log('Course created successfully:', course._id);
        
        res.json({
            success: true,
            message: 'Course created successfully',
            course: course
        });
    } catch (error) {
        console.error('Error creating course:', error);
        res.status(500).json({ success: false, error: 'Failed to create course: ' + error.message });
    }
});

// Update entire course
router.put('/:id', async (req, res) => {
    try {
        console.log('Updating course ID:', req.params.id);
        console.log('Update data:', req.body);
        
        const course = await Course.findById(req.params.id);
        if (!course) {
            console.log('Course not found with ID:', req.params.id);
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
        if (hasExplicitSlug) {
            const requestedSlug = String(req.body.slug || '').trim() || slugFromTitle(course.title);
            course.slug = await buildUniqueSlug(requestedSlug, course._id);
        } else if (!course.slug || course.title !== previousTitle) {
            course.slug = await buildUniqueSlug(course.title, course._id);
        }

        await course.save();

        console.log('Course updated successfully:', course._id);
        
        res.json({
            success: true,
            message: 'Course updated successfully',
            course: course
        });
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).json({ success: false, error: 'Failed to update course: ' + error.message });
    }
});

// Update course status only
router.patch('/:id/status', async (req, res) => {
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
        console.log('Deleting course ID:', req.params.id);
        
        const course = await Course.findByIdAndDelete(req.params.id);
        
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        res.json({
            success: true,
            message: 'Course deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting course:', error);
        res.status(500).json({ success: false, error: 'Failed to delete course' });
    }
});

// FIXED: Bulk delete courses - ADD THIS ROUTE
router.post('/bulk-delete', async (req, res) => {
    try {
        console.log('Bulk delete request:', req.body);
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No course IDs provided' });
        }

        const result = await Course.deleteMany({ _id: { $in: ids } });

        console.log(`Bulk deleted ${result.deletedCount} courses`);
        
        res.json({
            success: true,
            message: `${result.deletedCount} course(s) deleted successfully`
        });
    } catch (error) {
        console.error('Error bulk deleting courses:', error);
        res.status(500).json({ success: false, error: 'Failed to delete courses' });
    }
});

// Bulk update status
router.patch('/bulk-status', async (req, res) => {
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