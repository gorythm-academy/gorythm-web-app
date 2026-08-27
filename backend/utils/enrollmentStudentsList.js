const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const { activeEnrollmentFilter, trashedEnrollmentFilter } = require('./enrollmentQuery');
const { activeUserFilter, trashedUserFilter } = require('./userQuery');
const { normalizeEnrollmentStatusInput } = require('./enrollmentStatus');
const { isUnsetPortalEmail } = require('./studentPortalEmail');

const ALLOWED_FEE_STATUSES = ['paid', 'pending', 'failed', 'refunded'];
const STUDENT_LIST_SELECT = 'name email personalEmail phone avatar studentId isActive canLogin createdAt deletedAt status lastLogin';

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyStudentSearchFilter(userFilter, search) {
    if (!search) return userFilter;
    const regex = new RegExp(escapeRegex(search), 'i');
    userFilter.$or = [
        { name: regex },
        { email: regex },
        { personalEmail: regex },
        { phone: regex },
        { studentId: regex },
    ];
    return userFilter;
}

function buildEnrollmentMatchForStudentIds(studentIds, { trash, statusFilter, feeStatusFilter }) {
    const filter = trash ? trashedEnrollmentFilter() : activeEnrollmentFilter();
    filter.student = { $in: studentIds };

    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'inactive') {
            filter.status = { $in: ['inactive', 'pending', null] };
        } else if (['active', 'completed'].includes(statusFilter)) {
            filter.status = statusFilter;
        }
    }
    if (feeStatusFilter && feeStatusFilter !== 'all' && ALLOWED_FEE_STATUSES.includes(feeStatusFilter)) {
        if (feeStatusFilter === 'pending') {
            filter.paymentStatus = { $in: ['pending', null] };
        } else {
            filter.paymentStatus = feeStatusFilter;
        }
    }
    return filter;
}

/** Pending admin setup = placeholder portal email (not merely canLogin false). */
function isPendingSetup(user) {
    if (!user) return false;
    return isUnsetPortalEmail(user.email);
}

/**
 * Parse list sort: sortBy=studentId|student (name), sortOrder=asc|desc.
 * Missing roll numbers sort last when ascending, first when descending.
 */
function resolveStudentListSort(sortByRaw, sortOrderRaw) {
    const sortBy = String(sortByRaw || 'studentId').toLowerCase();
    const sortOrder = String(sortOrderRaw || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
    const direction = sortOrder === 'desc' ? -1 : 1;
    const byRoll = sortBy === 'studentid' || sortBy === 'roll' || sortBy === 'rollnumber';
    return {
        field: byRoll ? 'studentId' : 'name',
        sortOrder,
        direction,
    };
}

async function findSortedStudentUsers(userFilter, { skip, limit, sortBy, sortOrder }) {
    const { field, direction } = resolveStudentListSort(sortBy, sortOrder);

    if (field === 'name') {
        return User.find(userFilter)
            .select(STUDENT_LIST_SELECT)
            .sort({ name: direction, _id: 1 })
            .skip(skip)
            .limit(limit)
            .lean();
    }

    // Roll sort: missing/empty studentId always last; numeric year/seq when GRT-YYYY-NNN.
    const rows = await User.aggregate([
        { $match: userFilter },
        {
            $addFields: {
                _rollParts: {
                    $cond: [
                        {
                            $and: [
                                { $ne: [{ $ifNull: ['$studentId', ''] }, ''] },
                                { $ne: ['$studentId', null] },
                            ],
                        },
                        { $split: ['$studentId', '-'] },
                        [],
                    ],
                },
            },
        },
        {
            $addFields: {
                _hasRoll: {
                    $cond: [{ $gt: [{ $size: '$_rollParts' }, 0] }, 0, 1],
                },
                _rollYear: {
                    $convert: {
                        input: { $arrayElemAt: ['$_rollParts', 1] },
                        to: 'int',
                        onError: 0,
                        onNull: 0,
                    },
                },
                _rollSeq: {
                    $convert: {
                        input: { $arrayElemAt: ['$_rollParts', 2] },
                        to: 'int',
                        onError: 0,
                        onNull: 0,
                    },
                },
            },
        },
        {
            $sort: {
                _hasRoll: 1,
                _rollYear: direction,
                _rollSeq: direction,
                studentId: direction,
                name: 1,
                _id: 1,
            },
        },
        { $skip: skip },
        { $limit: limit },
        { $project: { _hasRoll: 0, _rollParts: 0, _rollYear: 0, _rollSeq: 0 } },
    ]);

    // Keep the same shape as .select(STUDENT_LIST_SELECT).lean()
    const allow = new Set(STUDENT_LIST_SELECT.split(/\s+/).filter(Boolean).concat(['_id']));
    return rows.map((row) => {
        const out = {};
        for (const key of Object.keys(row)) {
            if (allow.has(key)) out[key] = row[key];
        }
        return out;
    });
}

/**
 * Active list: all non-trashed student Users.
 * Quarantine courses (trash): non-trashed students who have ≥1 soft-deleted enrollment.
 * Quarantine students (trashStudents): soft-deleted student User accounts.
 */
async function countStudentsWithTrashedEnrollments() {
    const studentIds = await Enrollment.distinct('student', trashedEnrollmentFilter());
    if (!studentIds.length) return 0;
    return User.countDocuments({
        role: 'student',
        ...activeUserFilter(),
        _id: { $in: studentIds },
    });
}

async function countTrashedStudentUsers() {
    return User.countDocuments({
        role: 'student',
        ...trashedUserFilter(),
    });
}

async function queryStudentUsers({ search, skip, limit, trash, trashStudents, sortBy, sortOrder }) {
    if (trashStudents) {
        const userFilter = applyStudentSearchFilter(
            {
                role: 'student',
                ...trashedUserFilter(),
            },
            search
        );

        const [total, users] = await Promise.all([
            User.countDocuments(userFilter),
            findSortedStudentUsers(userFilter, { skip, limit, sortBy, sortOrder }),
        ]);
        return { total, users };
    }

    if (trash) {
        const studentIdsWithTrashedEnrollments = await Enrollment.distinct(
            'student',
            trashedEnrollmentFilter()
        );
        if (!studentIdsWithTrashedEnrollments.length) {
            return { total: 0, users: [] };
        }

        const userFilter = applyStudentSearchFilter(
            {
                role: 'student',
                ...activeUserFilter(),
                _id: { $in: studentIdsWithTrashedEnrollments },
            },
            search
        );

        const [total, users] = await Promise.all([
            User.countDocuments(userFilter),
            findSortedStudentUsers(userFilter, { skip, limit, sortBy, sortOrder }),
        ]);
        return { total, users };
    }

    const userFilter = applyStudentSearchFilter(
        { role: 'student', ...activeUserFilter() },
        search
    );

    const [total, users] = await Promise.all([
        User.countDocuments(userFilter),
        findSortedStudentUsers(userFilter, { skip, limit, sortBy, sortOrder }),
    ]);
    return { total, users };
}

async function countEnrollmentStats(matchFilter) {
    const pipeline = [
        { $match: matchFilter },
        {
            $group: {
                _id: null,
                totalRows: { $sum: 1 },
                activeRows: {
                    $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
                },
                completedRows: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
        inactiveRows: {
            $sum: {
                $cond: [
                    { $in: ['$status', ['active', 'completed']] },
                    0,
                    1,
                ],
            },
        },
                studentIds: { $addToSet: '$student' },
            },
        },
    ];

    const [result] = await Enrollment.aggregate(pipeline);
    if (!result) {
        const uniqueStudents = await User.countDocuments({ role: 'student', ...activeUserFilter() });
        return {
            totalRows: 0,
            uniqueStudents,
            activeRows: 0,
            inactiveRows: 0,
            completedRows: 0,
        };
    }

    return {
        totalRows: result.totalRows || 0,
        uniqueStudents: (result.studentIds || []).length,
        activeRows: result.activeRows || 0,
        inactiveRows: result.inactiveRows || 0,
        completedRows: result.completedRows || 0,
    };
}

module.exports = {
    ALLOWED_FEE_STATUSES,
    STUDENT_LIST_SELECT,
    buildEnrollmentMatchForStudentIds,
    isPendingSetup,
    queryStudentUsers,
    countStudentsWithTrashedEnrollments,
    countTrashedStudentUsers,
    countEnrollmentStats,
    normalizeEnrollmentStatusInput,
};
