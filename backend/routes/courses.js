const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { validate, rules } = require('../middleware/validate');
const { activeCourseFilter, trashedCourseFilter } = require('../utils/courseQuery');
const { activeEnrollmentFilter } = require('../utils/enrollmentQuery');
const authMiddleware = require('../middleware/auth');
const { validateSessionUser } = require('../middleware/validateSessionUser');
const { allowRoles } = require('../middleware/authorize');
const {
    deleteCourseMediaFiles,
    permanentlyDeleteCourseRelations,
    softTrashCourseEnrollments,
    restoreCourseEnrollments,
} = require('../services/trashCleanup');
const {
    normalizeInstructorIdList,
    applyInstructorsToCourse,
    instructorIdsFromCourse,
    formatInstructorNames,
} = require('../utils/courseInstructors');

const COURSE_TRASH_UNSET_TEACHERS = {
    instructors: [],
    instructor: null,
    instructorName: '',
};

const COURSE_CATEGORIES = [
    'Quranic Arabic', 'Tajweed', 'Islamic Studies', 'STEM', 'Memorization (Hifz)',
    'Fiqh', 'Hadith', 'Seerah', 'Aqeedah', 'Other',
];
// Category order for listing: Quran, Tajweed, Islamic Studies, Seerah, STEM, then rest
const PUBLIC_CATEGORY_ORDER = [
    'Quranic Arabic', 'Tajweed', 'Islamic Studies', 'Seerah', 'STEM',
    'Memorization (Hifz)', 'Fiqh', 'Hadith', 'Aqeedah', 'Other'
];
const getCategorySortIndex = (category) => {
    const i = PUBLIC_CATEGORY_ORDER.indexOf(category || '');
    return i === -1 ? PUBLIC_CATEGORY_ORDER.length : i;
};

function parseDisplayOrder(value, fallback = 9999) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n < 0) return null;
    return Math.floor(n);
}

function parseMasonryColumn(value) {
    return [1, 2, 3].includes(Number(value)) ? Number(value) : null;
}

function mapPublicCourse(course) {
    return {
        _id: course._id,
        title: course.title,
        description: course.description,
        category: course.category,
        price: course.price,
        duration: course.duration,
        level: course.level,
        instructorName: formatInstructorNames(course) || course.instructorName || '',
        homepageImage: course.homepageImage || '',
        imageUrl: course.imageUrl || '',
        displayOrder: Number.isFinite(Number(course.displayOrder)) ? Number(course.displayOrder) : 9999,
        masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? Number(course.masonryColumn) : null,
        slug: course.slug || '',
        isPublished: course.isPublished,
        createdAt: course.createdAt,
    };
}

// Get published courses only (public, no auth) – for homepage & All Courses
router.get('/public', async (req, res) => {
    try {
        // Short CDN/browser cache for public catalog.
        res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

        const raw = await Course.find({ isPublished: true, ...activeCourseFilter() })
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
            course = await Course.findOne({
                _id: param,
                isPublished: true,
                ...activeCourseFilter(),
            }).populate('instructor', 'name').populate('instructors', 'name');
        }
        if (!course && param) {
            course = await Course.findOne({ slug: param, isPublished: true, ...activeCourseFilter() })
                .populate('instructor', 'name')
                .populate('instructors', 'name');
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
            course: mapPublicCourse(course),
        });
    } catch (error) {
        req.log.error('Error fetching course', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch course' });
    }
});

router.use(authMiddleware);
router.use(validateSessionUser);
router.use(allowRoles('manager', 'super-admin'));

// Get all courses (admin)
router.get('/', async (req, res) => {
    try {
        const trash = req.query.trash === 'true' || req.query.trash === '1';
        const includeCounts = req.query.includeCounts === 'true' || req.query.includeCounts === '1';
        const courseFilter = trash ? trashedCourseFilter() : activeCourseFilter();

        const courseListSelect = [
            'title',
            'description',
            'category',
            'price',
            'duration',
            'level',
            'instructor',
            'instructors',
            'instructorName',
            'homepageImage',
            'displayOrder',
            'masonryColumn',
            'slug',
            'isPublished',
            'createdAt',
            'deletedAt',
        ].join(' ');

        const [courses, enrollmentStats] = await Promise.all([
            Course.find(courseFilter)
                .select(courseListSelect)
                .populate('instructor', 'name email')
                .populate('instructors', 'name email')
                .sort(trash ? { deletedAt: -1 } : { createdAt: -1 })
                .lean(),
            Enrollment.aggregate([
                {
                    $match: {
                        course: { $ne: null },
                        student: { $ne: null },
                        ...activeEnrollmentFilter(),
                    },
                },
                {
                    $group: {
                        _id: '$course',
                        studentIds: { $addToSet: '$student' },
                    },
                },
            ]),
        ]);

        let trashCount;
        if (includeCounts) {
            trashCount = await Course.countDocuments(trashedCourseFilter());
        }

        const byCourseStudentCount = new Map();
        const uniqueStudentIdSet = new Set();
        enrollmentStats.forEach((row) => {
            const ids = row.studentIds || [];
            byCourseStudentCount.set(String(row._id), ids.length);
            ids.forEach((id) => uniqueStudentIdSet.add(String(id)));
        });

        const mappedCourses = courses.map((course) => ({
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
            instructorName: formatInstructorNames(course) || course.instructorName || '',
            instructors: course.instructors || [],
            instructorIds: instructorIdsFromCourse(course),
            homepageImage: course.homepageImage || '',
            displayOrder: Number.isFinite(Number(course.displayOrder)) ? Number(course.displayOrder) : 9999,
            masonryColumn: [1, 2, 3].includes(Number(course.masonryColumn)) ? Number(course.masonryColumn) : null,
            slug: course.slug || '',
            createdAt: course.createdAt,
            deletedAt: course.deletedAt || null,
        }));

        res.json({
            success: true,
            courses: mappedCourses,
            totalUniqueStudents: uniqueStudentIdSet.size,
            ...(includeCounts ? { trashCount } : {}),
        });
    } catch (error) {
        req.log.error('Error fetching courses', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch courses' });
    }
});

/** Lightweight published courses for Teachers-tab assignment UI (no enrollment stats). */
router.get('/assignable', async (req, res) => {
    try {
        const courses = await Course.find({
            isPublished: true,
            $and: [activeCourseFilter()],
        })
            .select('title category')
            .sort({ title: 1 })
            .lean();
        res.json({
            success: true,
            courses: courses.map((c) => ({
                _id: c._id,
                title: c.title,
                category: c.category,
            })),
        });
    } catch (error) {
        req.log.error('Error fetching assignable courses', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch assignable courses' });
    }
});

// Admin preview — draft or published, including trashed courses still in DB
router.get('/preview/:id', async (req, res) => {
    try {
        const param = req.params.id;
        let course = null;
        if (mongoose.isValidObjectId(param)) {
            course = await Course.findById(param).populate('instructor', 'name');
        }
        if (!course && param) {
            course = await Course.findOne({ slug: param }).populate('instructor', 'name');
        }
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }
        res.set('Cache-Control', 'no-store');
        res.json({
            success: true,
            course: {
                ...mapPublicCourse(course),
                preview: true,
            },
        });
    } catch (error) {
        req.log.error('Error fetching course preview', { err: error });
        res.status(500).json({ success: false, error: 'Failed to fetch course preview' });
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
        rules.enum('category', 'Category', COURSE_CATEGORIES),
    ]),
    async (req, res) => {
    try {
        req.log.info('Creating course', {
            title: req.body?.title,
            category: req.body?.category,
            status: req.body?.status,
        });

        const displayOrder = parseDisplayOrder(req.body.displayOrder);
        if (displayOrder === null) {
            return res.status(400).json({ success: false, error: 'Display order must be 0 or greater' });
        }

        const isPublished = req.body.status === 'published';
        const instructorIds = normalizeInstructorIdList(req.body);
        if (!isPublished && instructorIds.length) {
            return res.status(400).json({
                success: false,
                error: 'Teachers can only be assigned to published courses',
            });
        }

        const requestedSlug = (req.body.slug && String(req.body.slug).trim()) || slugFromTitle(req.body.title);
        const uniqueSlug = await buildUniqueSlug(requestedSlug);
        
        const course = new Course({
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            price: req.body.price,
            duration: req.body.duration || '8 weeks',
            level: req.body.level || 'beginner',
            instructor: null,
            instructorName: '',
            instructors: [],
            students: [],
            homepageImage: (req.body.homepageImage && String(req.body.homepageImage).trim()) || '',
            displayOrder,
            masonryColumn: parseMasonryColumn(req.body.masonryColumn),
            slug: uniqueSlug,
            isPublished
        });

        try {
            await applyInstructorsToCourse(course, instructorIds, { requireAll: true });
        } catch (err) {
            if (err.status === 400) {
                return res.status(400).json({ success: false, error: err.message });
            }
            throw err;
        }

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
        rules.enum('category', 'Category', COURSE_CATEGORIES),
    ]),
    async (req, res) => {
    try {
        req.log.info('Updating course', {
            courseId: req.params.id,
            fields: Object.keys(req.body || {}),
        });

        const course = await Course.findOne({ _id: req.params.id, ...activeCourseFilter() });
        if (!course) {
            req.log.warn('Course not found for update', { courseId: req.params.id });
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        if (req.body.displayOrder !== undefined) {
            const displayOrder = parseDisplayOrder(req.body.displayOrder);
            if (displayOrder === null) {
                return res.status(400).json({ success: false, error: 'Display order must be 0 or greater' });
            }
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
        const nextPublished = req.body.status === 'published';
        course.isPublished = nextPublished;
        const hasInstructorIds = Object.prototype.hasOwnProperty.call(req.body, 'instructorIds');
        const hasInstructorId = Object.prototype.hasOwnProperty.call(req.body, 'instructorId');
        if (!nextPublished) {
            // Drafts cannot keep teachers (Teachers tab only shows published assignments).
            await applyInstructorsToCourse(course, []);
        } else if (hasInstructorIds || hasInstructorId) {
            try {
                await applyInstructorsToCourse(course, normalizeInstructorIdList(req.body), {
                    requireAll: true,
                });
            } catch (err) {
                if (err.status === 400) {
                    return res.status(400).json({ success: false, error: err.message });
                }
                throw err;
            }
        } else if (req.body.instructorName !== undefined && !(course.instructors || []).length) {
            course.instructorName = req.body.instructorName || '';
        }
        if (req.body.homepageImage !== undefined) course.homepageImage = String(req.body.homepageImage || '').trim();
        if (req.body.displayOrder !== undefined) {
            course.displayOrder = parseDisplayOrder(req.body.displayOrder);
        }
        if (req.body.masonryColumn !== undefined) {
            course.masonryColumn = parseMasonryColumn(req.body.masonryColumn);
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
        const course = await Course.findOne({ _id: req.params.id, ...activeCourseFilter() });
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        course.isPublished = req.body.status === 'published';
        if (!course.isPublished) {
            await applyInstructorsToCourse(course, []);
        }
        await course.save();

        res.json({
            success: true,
            message: `Course ${course.isPublished ? 'published' : 'set to draft'}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update course' });
    }
});

// Soft-delete course (move to trash)
router.delete('/:id', async (req, res) => {
    try {
        req.log.info('Trashing course', { courseId: req.params.id });

        const course = await Course.findOneAndUpdate(
            { _id: req.params.id, ...activeCourseFilter() },
            {
                $set: {
                    deletedAt: new Date(),
                    isPublished: false,
                    students: [],
                    ...COURSE_TRASH_UNSET_TEACHERS,
                },
            },
            { new: true }
        );

        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found' });
        }

        await softTrashCourseEnrollments(course._id);

        res.json({
            success: true,
            message: 'Course moved to trash',
        });
    } catch (error) {
        req.log.error('Error trashing course', { err: error });
        res.status(500).json({ success: false, error: 'Failed to move course to trash' });
    }
});

// Restore course from trash
router.patch('/:id/restore', async (req, res) => {
    try {
        const course = await Course.findOneAndUpdate(
            { _id: req.params.id, ...trashedCourseFilter() },
            { $set: { deletedAt: null } },
            { new: true }
        );
        if (!course) {
            return res.status(404).json({ success: false, error: 'Course not found in trash' });
        }
        await restoreCourseEnrollments(course._id);
        res.json({ success: true, message: 'Course restored (still draft — publish when ready)' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restore course' });
    }
});

// Permanently delete course (must be in trash)
router.delete('/:id/permanent', async (req, res) => {
    try {
        const course = await Course.findOne({
            _id: req.params.id,
            ...trashedCourseFilter(),
        });

        if (!course) {
            return res.status(404).json({
                success: false,
                error: 'Course must be in trash before permanent delete',
            });
        }

        await permanentlyDeleteCourseRelations(course._id);
        deleteCourseMediaFiles(course);
        await Course.findByIdAndDelete(course._id);

        res.json({
            success: true,
            message: 'Course permanently deleted',
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to permanently delete course' });
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

        const result = await Course.updateMany(
            { _id: { $in: ids }, ...activeCourseFilter() },
            {
                $set: {
                    deletedAt: new Date(),
                    isPublished: false,
                    students: [],
                    ...COURSE_TRASH_UNSET_TEACHERS,
                },
            }
        );

        for (const id of ids) {
            await softTrashCourseEnrollments(id);
        }

        req.log.info('Bulk trash courses completed', { modifiedCount: result.modifiedCount });

        res.json({
            success: true,
            message: `${result.modifiedCount} course(s) moved to trash`,
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

        const published = status === 'published';
        const update = { isPublished: published };
        if (!published) {
            Object.assign(update, COURSE_TRASH_UNSET_TEACHERS);
        }

        const result = await Course.updateMany(
            { _id: { $in: courseIds }, ...activeCourseFilter() },
            { $set: update }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} course(s) set to ${status}`
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update courses' });
    }
});

router.post(
    '/bulk-restore',
    validate([rules.arrayNonEmpty('ids', 'Course IDs')]),
    async (req, res) => {
        try {
            const { ids } = req.body;
            const result = await Course.updateMany(
                { _id: { $in: ids }, ...trashedCourseFilter() },
                { $set: { deletedAt: null } }
            );
            for (const id of ids) {
                await restoreCourseEnrollments(id);
            }
            res.json({
                success: true,
                message: `${result.modifiedCount} course(s) restored (still draft — publish when ready)`,
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to restore courses' });
        }
    }
);

router.post(
    '/bulk-permanent',
    validate([rules.arrayNonEmpty('ids', 'Course IDs')]),
    async (req, res) => {
        try {
            const { ids } = req.body;
            const courses = await Course.find({ _id: { $in: ids }, ...trashedCourseFilter() });
            if (!courses.length) {
                return res.status(404).json({ success: false, error: 'No trashed courses found to delete' });
            }
            for (const course of courses) {
                await permanentlyDeleteCourseRelations(course._id);
                deleteCourseMediaFiles(course);
                await Course.findByIdAndDelete(course._id);
            }
            res.json({
                success: true,
                message: `${courses.length} course(s) permanently deleted`,
            });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Failed to permanently delete courses' });
        }
    }
);

module.exports = router;