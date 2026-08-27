const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');
const { activeUserFilter } = require('./userQuery');
const { activeCourseFilter } = require('./courseQuery');

const { normalizeEnrollmentStatus } = require('./enrollmentStatus');

const matchesEnrollmentSearch = (enrollment, search) => {
    if (!search) return true;
    const student = enrollment.student || {};
    const course = enrollment.course || {};
    const haystack = [
        student.name,
        student.email,
        student.personalEmail,
        student.phone,
        student.studentId,
        course.title,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes(search);
};

const isEnrollmentVisible = (enrollment, trash) => {
    if (trash) return true;
    if (enrollment.student?.deletedAt) return false;
    if (enrollment.course?.deletedAt) return false;
    return true;
};

async function buildVisibleListFilter(baseFilter, trash) {
    if (trash) return { ...baseFilter };

    const [activeStudentIds, activeCourseIds] = await Promise.all([
        User.find({ role: 'student', ...activeUserFilter() }).distinct('_id'),
        Course.find(activeCourseFilter()).distinct('_id'),
    ]);

    const visibility = {
        student: { $in: activeStudentIds },
        $or: [
            { course: null },
            { course: { $exists: false } },
            { course: { $in: activeCourseIds } },
        ],
    };

    // Combine with $and so this $or does not overwrite enrollment deletedAt filters.
    return { $and: [baseFilter, visibility] };
}

const getSortValue = (enrollment, sortBy) => {
    const student = enrollment.student || {};
    const course = enrollment.course || {};
    switch (sortBy) {
        case 'studentId':
            return (student.studentId || '').toLowerCase();
        case 'student':
            return (student.name || '').toLowerCase();
        case 'personalEmail':
            return (student.personalEmail || '').toLowerCase();
        case 'phone':
            return (student.phone || '').toLowerCase();
        case 'course':
            return (course.title || '').toLowerCase();
        case 'teachers': {
            const schedule = enrollment.assignedSchedule;
            if (schedule?.teacher?.name) return schedule.teacher.name.toLowerCase();
            if (Array.isArray(enrollment.courseTeachers) && enrollment.courseTeachers.length) {
                return enrollment.courseTeachers.map((t) => t?.name).filter(Boolean).join(', ').toLowerCase();
            }
            return '';
        }
        case 'enrollmentDate':
            return new Date(enrollment.enrollmentDate || 0).getTime();
        case 'addedAt':
            return new Date(student.createdAt || 0).getTime();
        case 'paymentStatus':
            return (enrollment.paymentStatus || 'pending').toLowerCase();
        case 'status':
            return normalizeEnrollmentStatus(enrollment.status);
        default:
            return new Date(enrollment.enrollmentDate || 0).getTime();
    }
};

const sortEnrollmentRows = (rows, sortBy, sortOrder) => {
    const mult = sortOrder === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const va = getSortValue(a, sortBy);
        const vb = getSortValue(b, sortBy);
        if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
        return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });
};

const NATIVE_SORT_FIELDS = new Set(['enrollmentDate', 'status', 'paymentStatus']);
const DATE_SORT_FIELDS = new Set(['addedAt', 'enrollmentDate']);

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Narrow enrollments by matching student/course fields in the database (no full-table load). */
async function appendSearchToFilter(listFilter, search) {
    const term = String(search || '').trim();
    if (!term) return listFilter;

    const regex = new RegExp(escapeRegex(term), 'i');
    const [studentIds, courseIds] = await Promise.all([
        User.find({
            role: 'student',
            $or: [
                { name: regex },
                { email: regex },
                { personalEmail: regex },
                { phone: regex },
                { studentId: regex },
            ],
        }).distinct('_id'),
        Course.find({
            title: regex,
            ...activeCourseFilter(),
        }).distinct('_id'),
    ]);

    const searchOr = [];
    if (studentIds.length) searchOr.push({ student: { $in: studentIds } });
    if (courseIds.length) searchOr.push({ course: { $in: courseIds } });

    if (!searchOr.length) {
        return { $and: [listFilter, { _id: { $in: [] } }] };
    }

    return { $and: [listFilter, { $or: searchOr }] };
}

function buildAggregationSortStages(sortBy) {
    const stages = [
        {
            $lookup: {
                from: 'users',
                localField: 'student',
                foreignField: '_id',
                as: 'studentDoc',
            },
        },
        { $unwind: { path: '$studentDoc', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'courses',
                localField: 'course',
                foreignField: '_id',
                as: 'courseDoc',
            },
        },
        { $unwind: { path: '$courseDoc', preserveNullAndEmptyArrays: true } },
    ];

    if (sortBy === 'teachers') {
        stages.push(
            {
                $lookup: {
                    from: 'classschedules',
                    localField: 'assignedSchedule',
                    foreignField: '_id',
                    as: 'scheduleDoc',
                },
            },
            { $unwind: { path: '$scheduleDoc', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'scheduleDoc.teacher',
                    foreignField: '_id',
                    as: 'scheduleTeacher',
                },
            },
            { $unwind: { path: '$scheduleTeacher', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'courseDoc.instructor',
                    foreignField: '_id',
                    as: 'courseInstructor',
                },
            },
            {
                $addFields: {
                    sortKey: {
                        $toLower: {
                            $ifNull: [
                                '$scheduleTeacher.name',
                                { $arrayElemAt: ['$courseInstructor.name', 0] },
                                '',
                            ],
                        },
                    },
                },
            },
        );
        return stages;
    }

    let sortKeyPath = '$enrollmentDate';
    switch (sortBy) {
        case 'studentId':
            sortKeyPath = '$studentDoc.studentId';
            break;
        case 'student':
            sortKeyPath = '$studentDoc.name';
            break;
        case 'personalEmail':
            sortKeyPath = '$studentDoc.personalEmail';
            break;
        case 'phone':
            sortKeyPath = '$studentDoc.phone';
            break;
        case 'addedAt':
            sortKeyPath = '$studentDoc.createdAt';
            break;
        case 'course':
            sortKeyPath = '$courseDoc.title';
            break;
        default:
            sortKeyPath = '$enrollmentDate';
    }

    stages.push({
        $addFields: {
            sortKey: DATE_SORT_FIELDS.has(sortBy)
                ? { $ifNull: [sortKeyPath, new Date(0)] }
                : { $toLower: { $ifNull: [sortKeyPath, ''] } },
        },
    });

    return stages;
}

async function fetchSortedEnrollmentIds(listFilter, sortBy, sortOrder, skip, limit) {
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const pipeline = [
        { $match: listFilter },
        ...buildAggregationSortStages(sortBy),
        { $sort: { sortKey: sortDir, _id: 1 } },
        {
            $facet: {
                meta: [{ $count: 'total' }],
                data: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 1 } }],
            },
        },
    ];

    const [result] = await Enrollment.aggregate(pipeline);
    const total = result?.meta?.[0]?.total ?? 0;
    const ids = (result?.data || []).map((row) => row._id);
    return { total, ids };
}

async function orderEnrollmentsByIds(ids, queryFactory) {
    if (!ids.length) return [];
    const rows = await queryFactory(Enrollment.find({ _id: { $in: ids } }));
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/**
 * Paginated admin list: DB-level search + sort (only one page loaded into memory).
 */
async function queryEnrollmentsAdminList({
    listFilter,
    search,
    sortBy,
    sortOrder,
    skip,
    limit,
    queryFactory,
}) {
    const matchFilter = await appendSearchToFilter(listFilter, search);

    if (NATIVE_SORT_FIELDS.has(sortBy)) {
        const sortObj = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
        const [total, enrollments] = await Promise.all([
            Enrollment.countDocuments(matchFilter),
            queryFactory(
                Enrollment.find(matchFilter).sort(sortObj).skip(skip).limit(limit),
            ),
        ]);
        return { total, enrollments };
    }

    const { total, ids } = await fetchSortedEnrollmentIds(
        matchFilter,
        sortBy,
        sortOrder,
        skip,
        limit,
    );
    const enrollments = await orderEnrollmentsByIds(ids, queryFactory);
    return { total, enrollments };
}

async function fetchEnrollmentIdsForList(listFilter) {
    return Enrollment.find(listFilter).select('_id').lean();
}

module.exports = {
    normalizeEnrollmentStatusInput: normalizeEnrollmentStatus,
    normalizeEnrollmentStatus,
    NATIVE_SORT_FIELDS,
    matchesEnrollmentSearch,
    isEnrollmentVisible,
    buildVisibleListFilter,
    appendSearchToFilter,
    queryEnrollmentsAdminList,
    getSortValue,
    sortEnrollmentRows,
    fetchEnrollmentIdsForList,
};
