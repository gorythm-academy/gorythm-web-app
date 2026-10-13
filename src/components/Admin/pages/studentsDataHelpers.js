import { formatScheduleTimeLabel } from '../../../utils/formatScheduleLabel';
import { isUnsetPortalEmail } from '../../../utils/studentPortalEmail';
import { normalizeEnrollmentStatus } from '../../../utils/studentAdminValidation';
import { billingStatusLabel } from '../../../utils/billingLabels';

/** Allotted schedule teacher ONLY — never courseTeachers fallback. */
export const getEnrollmentTeacherItems = (enrollment) => {
    if (!enrollment) return [];
    const name = enrollment.assignedSchedule?.teacher?.name;
    return name ? [name] : [];
};

export const getEnrollmentTeacherLabel = (enrollment) => getEnrollmentTeacherItems(enrollment).join(', ');

export const getEnrollmentTimeslotLabel = (enrollment) =>
    formatScheduleTimeLabel(enrollment?.assignedSchedule);

export const summarizeLabels = (values, emptyLabel = '—') => {
    const cleaned = values.filter(Boolean);
    if (!cleaned.length) return emptyLabel;
    const unique = [...new Set(cleaned)];
    if (unique.length === 1) return unique[0];
    return 'Mixed';
};

export const buildCourseSummary = (rows) => {
    const titles = [];
    const seen = new Set();
    for (const row of rows) {
        const title = row?.course?.title;
        if (!title || seen.has(title)) continue;
        seen.add(title);
        titles.push(title);
    }
    if (!titles.length) return 'No course assigned';
    if (titles.length <= 2) return titles.join(', ');
    return `${titles.slice(0, 2).join(', ')} +${titles.length - 2} more`;
};

export const isPendingSetupStudent = (student) => {
    if (!student) return false;
    return isUnsetPortalEmail(student.email);
};

export const buildStudentCardsFromApi = (studentsPayload = []) =>
    studentsPayload.map((entry) => {
        const student = entry.student || {};
        const rows = entry.enrollments || [];
        const key = student._id ? String(student._id) : `student:${student.email || student.name}`;
        const statuses = rows.map((e) => normalizeEnrollmentStatus(e.status));
        const feeStatuses = rows.map((e) =>
            billingStatusLabel(e.displayFeeStatus || e.paymentStatus || 'pending')
        );
        return {
            key,
            student,
            enrollments: rows,
            parents: entry.parents || student.parents || [],
            courseSummary: buildCourseSummary(rows),
            courseCount: new Set(rows.map((e) => e.course?._id || e.course?.title).filter(Boolean)).size,
            statusLabel: summarizeLabels(statuses, rows.length ? 'inactive' : '—'),
            feeStatusLabel: summarizeLabels(feeStatuses, 'Pending'),
            enrollmentCount: rows.length,
            pendingSetup: entry.pendingSetup ?? isPendingSetupStudent(student),
        };
    });

/** Keep card order aligned with sort control even if API order is stale. */
export const sortStudentCards = (cards, sortBy, sortOrder) => {
    const dir = sortOrder === 'desc' ? -1 : 1;
    const byName = sortBy === 'student' || sortBy === 'name';
    const byNewest = sortBy === 'createdAt' || sortBy === 'joined';
    return [...cards].sort((a, b) => {
        if (byNewest) {
            const at = new Date(a.student?.createdAt || 0).getTime();
            const bt = new Date(b.student?.createdAt || 0).getTime();
            if (at !== bt) return (at - bt) * dir;
            return String(a.key).localeCompare(String(b.key)) * dir;
        }
        if (byName) {
            const an = String(a.student?.name || '').toLowerCase();
            const bn = String(b.student?.name || '').toLowerCase();
            const cmp = an.localeCompare(bn, undefined, { sensitivity: 'base' });
            if (cmp !== 0) return cmp * dir;
            return String(a.key).localeCompare(String(b.key));
        }
        const ar = String(a.student?.studentId || '').trim();
        const br = String(b.student?.studentId || '').trim();
        const aMissing = !ar;
        const bMissing = !br;
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        const cmp = ar.localeCompare(br, undefined, { numeric: true, sensitivity: 'base' });
        if (cmp !== 0) return cmp * dir;
        return String(a.key).localeCompare(String(b.key));
    });
};

export const buildListCacheKey = ({
    listTab,
    page,
    debouncedSearchTerm,
    filterStatus,
    filterFeeStatus,
    sortBy,
    sortOrder,
}) => JSON.stringify({
    listTab,
    page,
    debouncedSearchTerm,
    filterStatus,
    filterFeeStatus,
    sortBy,
    sortOrder,
});

export const buildOverlayCacheKey = (studentId, tab) => `${studentId}:${tab}`;
