import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import AddStudentUnifiedModal from './AddStudentUnifiedModal';
import EnrollStudentModal from './EnrollStudentModal';
import EditEnrollmentModal from './EditEnrollmentModal';
import StudentDetailOverlay from './StudentDetailOverlay';
import { useAdminDialog } from '../AdminDialogContext';
import { formatScheduleTimeLabel } from '../../../utils/formatScheduleLabel';
import { portalEmailDisplayLabel, isUnsetPortalEmail } from '../../../utils/studentPortalEmail';
import {
    normalizeEnrollmentStatus,
    getEnrollmentStatusIcon,
    FEE_STATUS_VALUES,
} from '../../../utils/studentAdminValidation';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_COURSES_LABEL, QUARANTINE_STUDENTS_LABEL } from '../../../utils/adminListLabels';
import './StudentsData.scss';

const PAGE_SIZE = 9;
const CSV_EXPORT_PAGE_SIZE = 5000;
const DETAIL_FETCH_LIMIT = 100;

/** Allotted schedule teacher ONLY — never courseTeachers fallback. */
const getEnrollmentTeacherItems = (enrollment) => {
    if (!enrollment) return [];
    const name = enrollment.assignedSchedule?.teacher?.name;
    return name ? [name] : [];
};

const getEnrollmentTeacherLabel = (enrollment) => getEnrollmentTeacherItems(enrollment).join(', ');

const getEnrollmentTimeslotLabel = (enrollment) =>
    formatScheduleTimeLabel(enrollment?.assignedSchedule);

const getStudentKey = (enrollment) => {
    const s = enrollment?.student;
    if (s?._id) return String(s._id);
    if (s?.studentId) return `sid:${s.studentId}`;
    if (s?.email) return `email:${String(s.email).toLowerCase()}`;
    return `enr:${enrollment?._id}`;
};

const summarizeLabels = (values, emptyLabel = '—') => {
    const cleaned = values.filter(Boolean);
    if (!cleaned.length) return emptyLabel;
    const unique = [...new Set(cleaned)];
    if (unique.length === 1) return unique[0];
    return 'Mixed';
};

const buildCourseSummary = (rows) => {
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

const isPendingSetupStudent = (student) => {
    if (!student) return false;
    return isUnsetPortalEmail(student.email);
};

const buildStudentCards = (enrollments) => {
    const map = new Map();
    for (const enrollment of enrollments) {
        const key = getStudentKey(enrollment);
        if (!map.has(key)) {
            map.set(key, {
                key,
                student: enrollment.student || {},
                enrollments: [],
            });
        }
        const card = map.get(key);
        card.enrollments.push(enrollment);
        if (enrollment.student?._id && !card.student?._id) {
            card.student = enrollment.student;
        }
    }

    return Array.from(map.values()).map((card) => {
        const statuses = card.enrollments.map((e) => normalizeEnrollmentStatus(e.status));
        const feeStatuses = card.enrollments.map((e) => {
            const fee = (e.paymentStatus || 'pending').toLowerCase();
            return fee.charAt(0).toUpperCase() + fee.slice(1);
        });
        const primaryStatus = summarizeLabels(statuses, 'active');
        return {
            ...card,
            courseSummary: buildCourseSummary(card.enrollments),
            courseCount: new Set(
                card.enrollments.map((e) => e.course?._id || e.course?.title).filter(Boolean)
            ).size,
            statusLabel: primaryStatus,
            feeStatusLabel: summarizeLabels(feeStatuses, 'Pending'),
            enrollmentCount: card.enrollments.length,
            pendingSetup: isPendingSetupStudent(card.student),
        };
    });
};

const buildStudentCardsFromApi = (studentsPayload = []) =>
    studentsPayload.map((entry) => {
        const student = entry.student || {};
        const rows = entry.enrollments || [];
        const key = student._id ? String(student._id) : `student:${student.email || student.name}`;
        const statuses = rows.map((e) => normalizeEnrollmentStatus(e.status));
        const feeStatuses = rows.map((e) => {
            const fee = (e.paymentStatus || 'pending').toLowerCase();
            return fee.charAt(0).toUpperCase() + fee.slice(1);
        });
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
const sortStudentCards = (cards, sortBy, sortOrder) => {
    const dir = sortOrder === 'desc' ? -1 : 1;
    const byName = sortBy === 'student' || sortBy === 'name';
    return [...cards].sort((a, b) => {
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

const buildListCacheKey = ({
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

const buildOverlayCacheKey = (studentId, tab) => `${studentId}:${tab}`;

const StudentsData = () => {
    const [searchParams] = useSearchParams();
    const { showAlert, showConfirm } = useAdminDialog();

    const [studentCards, setStudentCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterFeeStatus, setFilterFeeStatus] = useState('all');
    const [editingEnrollment, setEditingEnrollment] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollPreselectedStudent, setEnrollPreselectedStudent] = useState(null);
    const [courses, setCourses] = useState([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [listTab, setListTab] = useState('active');
    const [trashCount, setTrashCount] = useState(0);
    const [trashStudentsCount, setTrashStudentsCount] = useState(0);
    const [trashBusy, setTrashBusy] = useState(false);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState({
        totalRows: 0,
        uniqueStudents: 0,
        totalStudentAccounts: 0,
        activeRows: 0,
        inactiveRows: 0,
        completedRows: 0,
    });
    const [sortBy, setSortBy] = useState('studentId');
    const [sortOrder, setSortOrder] = useState('asc');

    const [detailStudent, setDetailStudent] = useState(null);
    const [detailTab, setDetailTab] = useState('active');
    const [detailEnrollments, setDetailEnrollments] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailRefreshing, setDetailRefreshing] = useState(false);
    const [detailQuarantineCount, setDetailQuarantineCount] = useState(0);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

    const enrollments = useMemo(
        () => studentCards.flatMap((card) =>
            (card.enrollments || []).map((row) => ({
                ...row,
                student: row.student || card.student,
            }))
        ),
        [studentCards]
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 400);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        const emailFromQuery = searchParams.get('email');
        if (emailFromQuery) setSearchTerm(emailFromQuery);
    }, [searchParams]);

    const prevFiltersRef = useRef({
        debouncedSearchTerm: '',
        filterStatus: 'all',
        filterFeeStatus: 'all',
        listTab: 'active',
        sortBy: 'studentId',
        sortOrder: 'asc',
    });
    const pageRef = useRef(page);
    pageRef.current = page;
    const fetchEnrollmentsRef = useRef(() => {});
    const detailStudentRef = useRef(null);
    detailStudentRef.current = detailStudent;
    const detailTabRef = useRef(detailTab);
    detailTabRef.current = detailTab;
    const listCacheRef = useRef(new Map());
    const overlayCacheRef = useRef(new Map());
    const isFirstListLoadRef = useRef(true);
    const detailEnrollmentsRef = useRef([]);
    detailEnrollmentsRef.current = detailEnrollments;

    const invalidateStudentsCaches = useCallback(() => {
        listCacheRef.current.clear();
        overlayCacheRef.current.clear();
    }, []);

    const fetchStats = useCallback(async () => {
        if (listTab !== 'active') return;
        try {
            const token = getAuthToken();
            if (!token) throw new Error('No authentication token found');

            const response = await axios.get(`${API_BASE_URL}/api/enrollments/stats`, {
                params: {
                    search: debouncedSearchTerm || undefined,
                    status: filterStatus,
                    feeStatus: filterFeeStatus !== 'all' ? filterFeeStatus : undefined,
                },
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.data?.success) {
                setStats({
                    totalRows: Number(response.data?.stats?.totalRows) || 0,
                    uniqueStudents: Number(response.data?.stats?.uniqueStudents)
                        || Number(response.data?.stats?.totalStudentAccounts) || 0,
                    totalStudentAccounts: Number(response.data?.stats?.totalStudentAccounts) || 0,
                    activeRows: Number(response.data?.stats?.activeRows) || 0,
                    inactiveRows: Number(response.data?.stats?.inactiveRows) || 0,
                    completedRows: Number(response.data?.stats?.completedRows) || 0,
                });
            }
        } catch (error) {
            console.error('Error fetching enrollment stats:', error);
        }
    }, [listTab, debouncedSearchTerm, filterStatus, filterFeeStatus]);

    const fetchEnrollments = useCallback(async (options = {}) => {
        const effectivePage = options.page ?? pageRef.current;
        const cacheParams = {
            listTab,
            page: effectivePage,
            debouncedSearchTerm,
            filterStatus,
            filterFeeStatus,
            sortBy,
            sortOrder,
        };
        const cacheKey = buildListCacheKey(cacheParams);

        if (!options.force && listCacheRef.current.has(cacheKey)) {
            const cached = listCacheRef.current.get(cacheKey);
            setStudentCards(cached.cards);
            setTotal(cached.total);
            setLoading(false);
            setHasLoadedOnce(true);
            return;
        }

        try {
            if (!options.force) {
                setStudentCards([]);
            }
            setLoading(true);
            setErrorMessage('');

            const token = getAuthToken();
            if (!token) throw new Error('No authentication token found');

            const inQuarantineCourses = listTab === 'trash';
            const inQuarantineStudents = listTab === 'trashStudents';
            const inAnyQuarantine = inQuarantineCourses || inQuarantineStudents;

            const response = await axios.get(`${API_BASE_URL}/api/enrollments/students`, {
                params: {
                    page: effectivePage,
                    limit: PAGE_SIZE,
                    trash: inQuarantineCourses ? 1 : 0,
                    trashStudents: inQuarantineStudents ? 1 : 0,
                    search: debouncedSearchTerm || undefined,
                    status: inAnyQuarantine ? 'all' : filterStatus,
                    feeStatus: inAnyQuarantine || filterFeeStatus === 'all' ? undefined : filterFeeStatus,
                    sortBy,
                    sortOrder,
                    includeCounts: options.includeCounts ? 1 : 0,
                },
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.data?.success) {
                throw new Error(response.data?.message || 'Failed to fetch students');
            }

            const cards = sortStudentCards(
                buildStudentCardsFromApi(response.data.students || []),
                sortBy,
                sortOrder
            );
            const apiTotal = Number(response.data.totalStudents) || 0;
            const maxPage = Math.max(1, Math.ceil(apiTotal / PAGE_SIZE));
            const resolvedPage = Math.min(effectivePage, maxPage);

            listCacheRef.current.set(cacheKey, { cards, total: apiTotal });
            setStudentCards(cards);
            setTotal(apiTotal);
            if (options.includeCounts) {
                if (typeof response.data.trashStudentCount === 'number') {
                    setTrashCount(response.data.trashStudentCount);
                } else if (typeof response.data.trashCount === 'number') {
                setTrashCount(response.data.trashCount);
                }
                if (typeof response.data.trashStudentsAccountCount === 'number') {
                    setTrashStudentsCount(response.data.trashStudentsAccountCount);
                }
            }
            if (options.page !== undefined) {
                setPage(resolvedPage);
            } else if (pageRef.current > maxPage) {
                setPage(maxPage);
            }
            setHasLoadedOnce(true);
        } catch (error) {
            console.error('Error fetching enrollments:', error);
            setErrorMessage(
                error.response?.data?.error
                    || error.response?.data?.message
                    || error.message
                    || 'Failed to load students'
            );
        } finally {
            setLoading(false);
        }
    }, [debouncedSearchTerm, filterStatus, filterFeeStatus, listTab, sortBy, sortOrder]);

    fetchEnrollmentsRef.current = fetchEnrollments;

    // Instantly rearrange the visible page when sort changes (API refetch still corrects pagination).
    useEffect(() => {
        setStudentCards((prev) => (prev.length ? sortStudentCards(prev, sortBy, sortOrder) : prev));
    }, [sortBy, sortOrder]);

    // List loader: cache hits skip network; counts only on first load, tab change, refresh, mutation.
    useEffect(() => {
        const prev = prevFiltersRef.current;
        const tabChanged = prev.listTab !== listTab;
        const filtersChanged =
            prev.debouncedSearchTerm !== debouncedSearchTerm
            || prev.filterStatus !== filterStatus
            || prev.filterFeeStatus !== filterFeeStatus
            || prev.listTab !== listTab
            || prev.sortBy !== sortBy
            || prev.sortOrder !== sortOrder;

        const includeCounts = isFirstListLoadRef.current || tabChanged;

        if (filtersChanged) {
            prevFiltersRef.current = {
                debouncedSearchTerm,
                filterStatus,
                filterFeeStatus,
                listTab,
                sortBy,
                sortOrder,
            };
            if (isFirstListLoadRef.current) {
                isFirstListLoadRef.current = false;
            }
            if (pageRef.current !== 1) {
                setPage(1);
                return;
            }
            fetchEnrollmentsRef.current({ page: 1, includeCounts });
            return;
        }

        if (isFirstListLoadRef.current) {
            isFirstListLoadRef.current = false;
        }
        fetchEnrollmentsRef.current({ page, includeCounts });
    }, [page, debouncedSearchTerm, filterStatus, filterFeeStatus, listTab, sortBy, sortOrder]);

    const fetchStudentDetailEnrollments = useCallback(async (student, tab = 'active', options = {}) => {
        if (!student) return;

        const studentUserId = student._id ? String(student._id) : '';
        if (!studentUserId) {
            setDetailEnrollments([]);
            setDetailLoading(false);
            setDetailRefreshing(false);
            return;
        }

        const cacheKey = buildOverlayCacheKey(studentUserId, tab);
        if (!options.force && overlayCacheRef.current.has(cacheKey)) {
            const cached = overlayCacheRef.current.get(cacheKey);
            setDetailEnrollments(cached.enrollments);
            setDetailQuarantineCount(cached.quarantineCount);
            setDetailLoading(false);
            setDetailRefreshing(false);
            return;
        }

        const hasSeed = detailEnrollmentsRef.current.length > 0;
        if (hasSeed && !options.force) {
            setDetailRefreshing(true);
        } else {
            setDetailLoading(true);
        }

        try {
            const token = getAuthToken();
            if (!token) throw new Error('No authentication token found');

            const trash = tab === 'trash' ? 1 : 0;
            const response = await axios.get(
                `${API_BASE_URL}/api/enrollments/student/${studentUserId}`,
                {
                    params: { trash },
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            if (response.data?.success) {
                const rows = response.data.enrollments || [];
                const qCount = Number(response.data.quarantineCount) || 0;
                overlayCacheRef.current.set(cacheKey, {
                    enrollments: rows,
                    quarantineCount: qCount,
                });
                setDetailEnrollments(rows);
                setDetailQuarantineCount(qCount);
                if (response.data.student || response.data.parents) {
                    setDetailStudent((prev) => (prev ? {
                        ...prev,
                        ...(response.data.student || {}),
                        parents: response.data.parents
                            || response.data.student?.parents
                            || prev.parents
                            || [],
                        lastLogin: response.data.student?.lastLogin ?? prev.lastLogin,
                    } : prev));
                }
                return;
            }

            throw new Error(response.data?.message || 'Failed to load student courses');
        } catch (error) {
            console.error('Error fetching student enrollments:', error);
            showAlert(
                error.response?.data?.message || error.message || 'Failed to load student courses',
                'error'
            );
        } finally {
            setDetailLoading(false);
            setDetailRefreshing(false);
        }
    }, [showAlert]);

    const reloadAfterMutation = useCallback(async (opts = {}) => {
        invalidateStudentsCaches();
        await fetchEnrollments({
            force: true,
            includeCounts: true,
            page: opts.page ?? pageRef.current,
        });
        if (listTab === 'active') {
            await fetchStats();
        }
        const student = detailStudentRef.current;
        if (student?._id) {
            overlayCacheRef.current.delete(
                buildOverlayCacheKey(String(student._id), detailTabRef.current)
            );
            await fetchStudentDetailEnrollments(student, detailTabRef.current, { force: true });
        }
    }, [fetchEnrollments, fetchStats, fetchStudentDetailEnrollments, invalidateStudentsCaches, listTab]);

    const handleManualRefresh = useCallback(() => {
        invalidateStudentsCaches();
        fetchEnrollments({ force: true, includeCounts: true });
        if (listTab === 'active') {
            fetchStats();
        }
    }, [fetchEnrollments, fetchStats, invalidateStudentsCaches, listTab]);

    const refreshDetailIfOpen = useCallback(async () => {
        const student = detailStudentRef.current;
        if (!student?._id) return;
        overlayCacheRef.current.delete(
            buildOverlayCacheKey(String(student._id), detailTabRef.current)
        );
        await fetchStudentDetailEnrollments(student, detailTabRef.current, { force: true });
    }, [fetchStudentDetailEnrollments]);

    const fetchCourses = useCallback(async () => {
        try {
            const token = getAuthToken();
            const response = await axios.get(`${API_BASE_URL}/api/courses`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.data.courses) {
                setCourses(response.data.courses);
            }
        } catch (error) {
            console.error('Error fetching courses:', error);
            setCourses([]);
        }
    }, []);

    useEffect(() => {
        if (listTab === 'active') {
            fetchStats();
        }
    }, [listTab, debouncedSearchTerm, filterStatus, filterFeeStatus, fetchStats]);

    useEffect(() => {
        if (!detailStudent?._id) return;

        const cacheKey = buildOverlayCacheKey(String(detailStudent._id), detailTab);
        if (overlayCacheRef.current.has(cacheKey)) {
            const cached = overlayCacheRef.current.get(cacheKey);
            setDetailEnrollments(cached.enrollments);
            setDetailQuarantineCount(cached.quarantineCount);
            setDetailLoading(false);
            setDetailRefreshing(false);
            return;
        }

        const hasSeed = detailEnrollmentsRef.current.length > 0;
        fetchStudentDetailEnrollments(detailStudent, detailTab, { silent: hasSeed });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailStudent?._id, detailTab, fetchStudentDetailEnrollments]);

    const openStudentDetail = (card) => {
        const student = card.student || {};
        const openOnTrash = listTab === 'trash' || listTab === 'trashStudents';
        const initialTab = openOnTrash ? 'trash' : 'active';
        const cacheKey = student._id
            ? buildOverlayCacheKey(String(student._id), initialTab)
            : null;
        const cached = cacheKey ? overlayCacheRef.current.get(cacheKey) : null;

        setDetailTab(initialTab);
        setDetailStudent({
            _id: student._id,
            name: student.name || 'Student',
            studentId: student.studentId || '',
            email: student.email || '',
            personalEmail: student.personalEmail || '',
            phone: student.phone || '',
            createdAt: student.createdAt,
            lastLogin: student.lastLogin,
            parents: card.parents || student.parents || [],
            deletedAt: student.deletedAt,
            pendingSetup: card.pendingSetup,
        });
        setDetailEnrollments(cached?.enrollments || card.enrollments || []);
        setDetailQuarantineCount(
            cached?.quarantineCount
            ?? (openOnTrash ? (card.enrollments?.length || 0) : 0)
        );
        setDetailLoading(!cached && !(card.enrollments?.length));
        setDetailRefreshing(false);
    };

    const closeStudentDetail = () => {
        setDetailStudent(null);
        setDetailEnrollments([]);
        detailEnrollmentsRef.current = [];
        setDetailQuarantineCount(0);
        setDetailTab('active');
        setDetailLoading(false);
        setDetailRefreshing(false);
    };

    const handleAddCourseToStudent = () => {
        if (!detailStudent) return;
        if (!courses.length) fetchCourses();
        setEnrollPreselectedStudent(detailStudent);
        setShowEnrollModal(true);
    };

    const updateEnrollmentStatus = async (enrollment, newStatus) => {
        try {
            const token = getAuthToken();
            await axios.put(
                `${API_BASE_URL}/api/enrollments/${enrollment._id}`,
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setStudentCards((prev) => prev.map((card) => {
                const enrollments = (card.enrollments || []).map((row) => (
                    row._id === enrollment._id ? { ...row, status: newStatus } : row
                ));
                return { ...card, enrollments, statusLabel: summarizeLabels(
                    enrollments.map((e) => normalizeEnrollmentStatus(e.status)),
                    card.statusLabel
                ) };
            }));
            setDetailEnrollments((prev) => prev.map((row) => (
                row._id === enrollment._id
                    ? { ...row, status: newStatus }
                    : row
            )));
            invalidateStudentsCaches();
            if (detailStudentRef.current?._id) {
                overlayCacheRef.current.delete(
                    buildOverlayCacheKey(String(detailStudentRef.current._id), detailTabRef.current)
                );
            }
            await fetchStats();
            setSuccessMessage('Enrollment status updated successfully');
            setTimeout(() => setSuccessMessage(''), 2500);
        } catch (error) {
            setErrorMessage(error.response?.data?.message || 'Failed to update status');
        }
    };

    const handleEditEnrollment = (enrollment) => {
        setEditingEnrollment(enrollment);
        setShowEditModal(true);
    };

    const handleQuarantineEnrollment = async (enrollment) => {
        const studentName = enrollment.student?.name || detailStudent?.name || 'this student';
        const courseTitle = enrollment.course?.title || 'this course';
        const confirmed = await showConfirm({
            title: `Move course to ${QUARANTINE_COURSES_LABEL}?`,
            message: `Move ${studentName} — "${courseTitle}" to ${QUARANTINE_COURSES_LABEL}? You can restore or permanently delete from that tab.`,
            confirmLabel: `Move course to ${QUARANTINE_COURSES_LABEL}`,
        });
        if (!confirmed) return;

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/enrollments/${enrollment._id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            setSuccessMessage(`Moved course to ${QUARANTINE_COURSES_LABEL}`);
            setTimeout(() => setSuccessMessage(''), 2500);
        } catch (error) {
            const message = error.response?.data?.message || error.response?.data?.error || `Failed to move to ${QUARANTINE_COURSES_LABEL}`;
            setErrorMessage(message);
            showAlert(message, 'error');
        }
    };

    const handleQuarantineStudent = async (studentOrCard) => {
        const student = studentOrCard?.student || studentOrCard || detailStudent;
        const studentId = student?._id;
        if (!studentId) return;

        const confirmed = await showConfirm({
            title: `Move student to ${QUARANTINE_STUDENTS_LABEL}?`,
            message: `Move "${student.name || 'this student'}" to ${QUARANTINE_STUDENTS_LABEL}? All of their courses will be quarantined and they will leave Active Records. You can restore them later.`,
            confirmLabel: `Move to ${QUARANTINE_STUDENTS_LABEL}`,
        });
        if (!confirmed) return;

        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${studentId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            closeStudentDetail();
            await reloadAfterMutation();
            setSuccessMessage(`Moved student to ${QUARANTINE_STUDENTS_LABEL}`);
            setTimeout(() => setSuccessMessage(''), 2500);
        } catch (error) {
            const message = error.response?.data?.message || error.response?.data?.error || `Failed to move to ${QUARANTINE_STUDENTS_LABEL}`;
            setErrorMessage(message);
            showAlert(message, 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handleRestoreStudent = async (studentOrCard) => {
        const student = studentOrCard?.student || studentOrCard || detailStudent;
        const studentId = student?._id;
        if (!studentId || trashBusy) return;

        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/users/${studentId}/restore`, null, {
                headers: { Authorization: `Bearer ${token}` },
            });
            closeStudentDetail();
            await reloadAfterMutation();
            showAlert('Student restored to Active Records (courses restored where possible).', 'success');
        } catch (error) {
            showAlert(error.response?.data?.message || error.response?.data?.error || 'Failed to restore student.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handlePermanentDeleteStudent = async (studentOrCard) => {
        const student = studentOrCard?.student || studentOrCard || detailStudent;
        const studentId = student?._id;
        if (!studentId || trashBusy) return;

        const confirmed = await showConfirm({
            title: 'Delete student forever?',
            message: 'This cannot be undone. The student account and quarantined course enrollments will be permanently removed. Payment records are kept for accounting.',
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;

        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${studentId}/permanent`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            closeStudentDetail();
            await reloadAfterMutation();
            showAlert('Student permanently deleted.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.message || error.response?.data?.error || 'Failed to delete student permanently.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handleRestoreEnrollment = async (enrollmentId) => {
        if (trashBusy) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/enrollments/${enrollmentId}/restore`, null, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            showAlert('Course restored.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.message || 'Failed to restore enrollment.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handlePermanentDelete = async (enrollmentId) => {
        if (trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete forever?',
            message:
                'This cannot be undone. The enrollment row will be permanently removed. Payment records are kept for accounting.',
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;

        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/enrollments/${enrollmentId}/permanent`, {
                    headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            showAlert('Enrollment permanently deleted.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.message || 'Failed to delete permanently.', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const handleAddStudent = () => {
        if (!courses.length) fetchCourses();
        setShowAddModal(true);
    };

    const handleAddStudentSuccess = async (newEnrollment) => {
        const courseName = newEnrollment?.course?.title || 'a course';
        setShowAddModal(false);
        setPage(1);
        await reloadAfterMutation({ page: 1 });
        setSuccessMessage(`Successfully enrolled ${newEnrollment?.student?.name || 'student'} in ${courseName}!`);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const handleEnrollExistingSuccess = async (newEnrollment) => {
        const courseName = newEnrollment?.course?.title || 'a course';
        setShowEnrollModal(false);
        setEnrollPreselectedStudent(null);
        await reloadAfterMutation();
        setSuccessMessage(`Successfully enrolled ${newEnrollment?.student?.name || 'student'} in ${courseName}!`);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const handleEditSaved = async () => {
        await reloadAfterMutation();
    };

    const downloadStudentsDataCsv = async () => {
        try {
            const token = getAuthToken();
            if (!token) {
                showAlert('Admin session expired. Please sign in again.', 'error');
                return;
            }

            const rows = [];
            let exportPage = 1;
            let exportTotal = 0;

            do {
                const response = await axios.get(`${API_BASE_URL}/api/enrollments`, {
                    params: {
                        page: exportPage,
                        limit: CSV_EXPORT_PAGE_SIZE,
                        trash: listTab === 'trash' || listTab === 'trashStudents' ? 1 : 0,
                        search: debouncedSearchTerm || undefined,
                        status: listTab === 'trash' || listTab === 'trashStudents' ? 'all' : filterStatus,
                        feeStatus: listTab === 'trash' || listTab === 'trashStudents' || filterFeeStatus === 'all'
                            ? undefined
                            : filterFeeStatus,
                        sortBy,
                        sortOrder,
                    },
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!response.data?.success) {
                    throw new Error(response.data?.message || 'Failed to fetch rows for CSV');
                }

                const batch = response.data.enrollments || [];
                exportTotal = Number(response.data.total) || batch.length;
                rows.push(...batch);
                if (batch.length === 0 || rows.length >= exportTotal) break;
                exportPage += 1;
            } while (rows.length < exportTotal);

            if (exportTotal > rows.length) {
                showAlert(
                    `Exported ${rows.length} of ${exportTotal} matching rows. Narrow filters to export the rest.`,
                    'warning'
                );
            }

            const data = rows.map((enrollment) => {
                const student = enrollment.student || {};
                const course = enrollment.course || {};
                return {
                    studentId: student.studentId || '',
                    name: student.name || '',
                    portalEmail: portalEmailDisplayLabel(student.email),
                    personalEmail: student.personalEmail || '',
                    phone: student.phone || '',
                    course: course.title || '',
                    timeslot: getEnrollmentTimeslotLabel(enrollment),
                    teachers: getEnrollmentTeacherLabel(enrollment),
                    enrollmentDate: enrollment.enrollmentDate
                        ? new Date(enrollment.enrollmentDate).toISOString().slice(0, 10)
                        : '',
                    addedAt: student.createdAt ? new Date(student.createdAt).toISOString() : '',
                    feeStatus: (enrollment.paymentStatus || 'pending').charAt(0).toUpperCase()
                        + (enrollment.paymentStatus || 'pending').slice(1),
                    status: normalizeEnrollmentStatus(enrollment.status),
                };
            });

            const columns = [
                ['studentId', 'Student ID'],
                ['name', 'Name'],
                ['portalEmail', 'Portal email'],
                ['personalEmail', 'Personal email'],
                ['phone', 'Phone'],
                ['course', 'Course'],
                ['timeslot', 'Timeslot'],
                ['teachers', 'Teachers'],
                ['enrollmentDate', 'Enrollment date'],
                ['addedAt', 'Added'],
                ['feeStatus', 'Fee status'],
                ['status', 'Status'],
            ];

            const esc = (value) => {
                const s = String(value ?? '');
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };

            const csv = [
                columns.map((c) => esc(c[1])).join(','),
                ...data.map((row) => columns.map((c) => esc(row[c[0]])).join(',')),
            ].join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gorythm-students-data-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            showAlert(error.response?.data?.message || error.message || 'Failed to download CSV', 'error');
        }
    };

    if (loading && !hasLoadedOnce && !studentCards.length && !detailStudent) {
        return (
            <div className="students-data-page">
                <div className="page-header">
                    <div className="header-left">
                        <h1><i className="fas fa-user-graduate"></i> Students</h1>
                        <p>Accounts, enrollments, fee status, and course assignments in one place</p>
                    </div>
                </div>
                <div className="students-cards-grid students-cards-grid--skeleton" aria-hidden>
                    {Array.from({ length: PAGE_SIZE }, (_, i) => (
                        <div key={i} className="student-card-skeleton" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="students-data-page">
            <AddStudentUnifiedModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSuccess={handleAddStudentSuccess}
                courses={courses}
            />

            <EnrollStudentModal
                isOpen={showEnrollModal}
                onClose={() => {
                    setShowEnrollModal(false);
                    setEnrollPreselectedStudent(null);
                }}
                onEnrollSuccess={handleEnrollExistingSuccess}
                courses={courses}
                preselectedStudent={enrollPreselectedStudent}
                defaultsFromEnrollment={
                    enrollPreselectedStudent
                        ? (detailEnrollments.find((e) => e.course?._id) || detailEnrollments[0] || null)
                        : null
                }
            />

            <EditEnrollmentModal
                isOpen={showEditModal}
                enrollment={editingEnrollment}
                onClose={() => {
                    setShowEditModal(false);
                    setEditingEnrollment(null);
                }}
                onSaved={handleEditSaved}
            />

            <StudentDetailOverlay
                student={detailStudent}
                detailTab={detailTab}
                onDetailTabChange={setDetailTab}
                enrollments={detailEnrollments}
                loading={detailLoading}
                refreshing={detailRefreshing}
                trashBusy={trashBusy}
                quarantineCount={detailQuarantineCount}
                studentQuarantined={Boolean(detailStudent?.deletedAt) || listTab === 'trashStudents'}
                onClose={closeStudentDetail}
                onAddCourse={handleAddCourseToStudent}
                onEditEnrollment={handleEditEnrollment}
                onQuarantineEnrollment={handleQuarantineEnrollment}
                onQuarantineStudent={() => handleQuarantineStudent(detailStudent)}
                onRestoreStudent={() => handleRestoreStudent(detailStudent)}
                onPermanentDeleteStudent={() => handlePermanentDeleteStudent(detailStudent)}
                onRestoreEnrollment={handleRestoreEnrollment}
                onPermanentDelete={handlePermanentDelete}
                onUpdateStatus={updateEnrollmentStatus}
                blockEscape={showEnrollModal || showEditModal}
            />

            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-user-graduate"></i> Students</h1>
                    <p>
                        Accounts, enrollments, fee status, and course assignments in one place
                        {listTab === 'active'
                            ? ` · ${stats.uniqueStudents || stats.totalStudentAccounts || 0} students`
                            : listTab === 'trashStudents'
                                ? ` · ${QUARANTINE_STUDENTS_LABEL}`
                                : ` · ${QUARANTINE_COURSES_LABEL}`}
                    </p>
                    <small>
                        <i className="fas fa-database" aria-hidden="true" />
                        Data stored in MongoDB | {listTab === 'active'
                            ? `${stats.totalRows} enrolled courses`
                            : listTab === 'trashStudents'
                                ? `${trashStudentsCount} quarantined students`
                                : `${trashCount} students with quarantined courses`}
                    </small>
                </div>
                {listTab === 'active' ? (
                    <div className="header-right">
                        <button type="button" className="btn-primary btn-add" onClick={handleAddStudent}>
                            <i className="fas fa-user-plus"></i> Add new student
                        </button>
                    </div>
                ) : null}
            </div>

            {errorMessage && (
                <div className="alert alert-error">
                    <i className="fas fa-exclamation-circle"></i>
                    {errorMessage}
                    <button onClick={() => setErrorMessage('')} className="alert-close">×</button>
                </div>
            )}

            {successMessage && (
                <div className="alert alert-success">
                    <i className="fas fa-check-circle"></i>
                    {successMessage}
                    <button onClick={() => setSuccessMessage('')} className="alert-close">×</button>
                </div>
            )}

            {listTab === 'active' && (
                <div className="stats-grid">
                    <div className="stat-card total">
                        <div className="stat-icon">
                            <i className="fas fa-user-graduate"></i>
                        </div>
                        <div className="stat-info">
                            <h3>{stats.uniqueStudents || stats.totalStudentAccounts || 0}</h3>
                            <p>Students</p>
                        </div>
                    </div>
                    <div className="stat-card active">
                        <div className="stat-icon">
                            <i className="fas fa-table"></i>
                        </div>
                        <div className="stat-info">
                            <h3>{stats.totalRows}</h3>
                            <p>Enrolled courses</p>
                        </div>
                    </div>
                    <div className="stat-card inactive">
                        <div className="stat-icon">
                            <i className="fas fa-chart-line"></i>
                        </div>
                        <div className="stat-info">
                            <h3>{stats.activeRows}</h3>
                            <p>Active enrolled courses</p>
                        </div>
                    </div>
                    <div className="stat-card completed">
                        <div className="stat-icon">
                            <i className="fas fa-pause-circle"></i>
                        </div>
                        <div className="stat-info">
                            <h3>{stats.inactiveRows}</h3>
                            <p>Inactive enrolled courses</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="students-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => setListTab('active')}
                >
                    <i className="fas fa-list" /> {ACTIVE_RECORDS_LABEL}
                </button>
                <button
                    type="button"
                    className={`students-list-tab students-list-tab--trash ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setFilterStatus('all');
                        setFilterFeeStatus('all');
                        setListTab('trash');
                    }}
                >
                    <i className="fas fa-book" /> {QUARANTINE_COURSES_LABEL} ({trashCount})
                </button>
                <button
                    type="button"
                    className={`students-list-tab students-list-tab--trash ${listTab === 'trashStudents' ? 'active' : ''}`}
                    onClick={() => {
                        setFilterStatus('all');
                        setFilterFeeStatus('all');
                        setListTab('trashStudents');
                    }}
                >
                    <i className="fas fa-user-slash" /> {QUARANTINE_STUDENTS_LABEL} ({trashStudentsCount})
                </button>
            </div>

            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search by student name, Student ID, email, phone, or course..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="filter-controls">
                    <select
                        className="status-filter"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="completed">Completed</option>
                    </select>

                    <select
                        className="status-filter"
                        value={filterFeeStatus}
                        onChange={(e) => setFilterFeeStatus(e.target.value)}
                        aria-label="Filter by fee status"
                    >
                        <option value="all">All fee status</option>
                        {FEE_STATUS_VALUES.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>

                    <select
                        className="status-filter students-sort-select"
                        value={`${sortBy}:${sortOrder}`}
                        onChange={(e) => {
                            const [nextBy, nextOrder] = String(e.target.value).split(':');
                            setSortBy(nextBy === 'student' ? 'student' : 'studentId');
                            setSortOrder(nextOrder === 'desc' ? 'desc' : 'asc');
                        }}
                        aria-label="Sort students"
                        title="Rearrange student cards"
                    >
                        <option value="studentId:asc">Roll number ↑</option>
                        <option value="studentId:desc">Roll number ↓</option>
                        <option value="student:asc">Name A–Z</option>
                        <option value="student:desc">Name Z–A</option>
                    </select>

                    <button className="refresh-btn" onClick={handleManualRefresh} type="button" title="Refresh" aria-label="Refresh">
                        <i className="fas fa-sync-alt"></i>
                            </button>

                    <button className="btn-secondary download-btn" onClick={downloadStudentsDataCsv}>
                        <i className="fas fa-file-export"></i> Download CSV
                    </button>
                </div>
            </div>

            {loading && studentCards.length > 0 ? (
                <div className="students-cards-loading" aria-live="polite">
                    <i className="fas fa-spinner fa-spin" aria-hidden /> Refreshing…
                </div>
            ) : null}

            {studentCards.length > 0 ? (
                <div className="students-cards-grid">
                    {studentCards.map((card) => {
                        const statusKey = String(card.statusLabel || 'active').toLowerCase();
                        const feeKey = String(card.feeStatusLabel || 'pending').toLowerCase();
                                return (
                            <button
                                type="button"
                                key={card.key}
                                className={`student-card${card.pendingSetup ? ' student-card--pending-setup' : ''}`}
                                onClick={() => openStudentDetail(card)}
                            >
                                <div className="student-card__header">
                                    <div className="student-card__avatar" aria-hidden>
                                        {(card.student.name || '?').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="student-card__identity">
                                        <div className="student-card__name-row">
                                            <strong className="student-card__name">
                                                {card.student.name || 'Unknown Student'}
                                            </strong>
                                            {card.student.studentId ? (
                                                <span className="student-id-cell">{card.student.studentId}</span>
                                            ) : (
                                                <span className="student-id-cell no-id">—</span>
                                            )}
                                        </div>
                                        <span className="student-card__email">
                                            <span className="student-card__email-label">Portal</span>
                                            <span className="student-card__email-value">
                                                {portalEmailDisplayLabel(card.student.email)}
                                            </span>
                                                    </span>
                                                </div>
                                            </div>

                                <div className="student-card__courses">
                                    <span className="student-card__section-label">
                                        {card.courseCount > 0
                                            ? `${card.courseCount} course${card.courseCount === 1 ? '' : 's'}`
                                            : 'Courses'}
                                            </span>
                                    <span className="student-card__courses-text" title={card.courseSummary}>
                                        {card.courseSummary}
                                    </span>
                                                    </div>

                                <div className="student-card__status">
                                    <div className="student-card__status-pair">
                                        <span className="student-card__section-label">Status</span>
                                        <span className={`student-card__status-value is-${statusKey}`}>
                                            <i
                                                className={`fas fa-${getEnrollmentStatusIcon(statusKey === 'mixed' ? 'active' : statusKey)}`}
                                                aria-hidden
                                            />
                                            {card.statusLabel}
                                        </span>
                                                </div>
                                    <div className="student-card__status-pair">
                                        <span className="student-card__section-label">Fee</span>
                                        <span className={`student-card__status-value is-fee-${feeKey}`}>
                                            {card.feeStatusLabel}
                                        </span>
                                                </div>
                                    {card.pendingSetup ? (
                                        <span className="student-card__setup-flag">Pending setup</span>
                                    ) : null}
                                </div>

                                <div className="student-card__footer">
                                    <span className="student-card__enrollments">
                                        {card.enrollmentCount} enrollment{card.enrollmentCount === 1 ? '' : 's'}
                                            </span>
                                    <span className="student-card__cta">
                                        View courses <i className="fas fa-arrow-right" aria-hidden />
                                            </span>
                                            </div>
                                                        </button>
                        );
                    })}
                </div>
            ) : loading ? (
                <div className="students-cards-grid students-cards-grid--skeleton" aria-hidden>
                    {Array.from({ length: PAGE_SIZE }, (_, i) => (
                        <div key={i} className="student-card-skeleton" />
                    ))}
                </div>
            ) : (
                <div className="students-cards-empty">
                    <i className="fas fa-user-graduate" aria-hidden />
                    <p><strong>No students found.</strong></p>
                                        <p className="no-data-hint">
                        {listTab === 'trash'
                            ? 'No students with quarantined courses.'
                            : listTab === 'trashStudents'
                                ? 'No quarantined students. Use Quarantine student from a student card to archive a whole account.'
                                : 'Use Add new student to create a record. Add more courses from a student card.'}
                                        </p>
                                        {listTab === 'active' ? (
                                            <div className="no-data-actions">
                            <button type="button" className="btn-primary btn-add" onClick={handleAddStudent}>
                                <i className="fas fa-user-plus"></i> Add new student
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                        )}

            <nav className="pagination-controls" aria-label="Students pagination">
                <button
                    type="button"
                    className="pagination-controls__nav"
                    disabled={page <= 1 || loading || total === 0}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    aria-label="Previous page"
                >
                    <i className="fas fa-chevron-left" aria-hidden />
                    <span>Prev</span>
                </button>

                <div className="pagination-controls__center">
                    <div className="pagination-controls__pages" aria-live="polite">
                        <span className="pagination-controls__current">
                            {total === 0 ? 0 : page}
                </span>
                        <span className="pagination-controls__divider" aria-hidden>/</span>
                        <span className="pagination-controls__total-pages">
                            {total === 0 ? 0 : totalPages}
                        </span>
                    </div>
                    <span className="pagination-controls__count">
                        {total} student{total === 1 ? '' : 's'}
                    </span>
                </div>

                <button
                    type="button"
                    className="pagination-controls__nav"
                    disabled={page >= totalPages || loading || total === 0}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    aria-label="Next page"
                >
                    <span>Next</span>
                    <i className="fas fa-chevron-right" aria-hidden />
                </button>
            </nav>

            <div className="database-info">
                <div className="info-card">
                    <i className="fas fa-database"></i>
                    <div>
                        <h4>MongoDB Storage</h4>
                        <p>All student records are stored permanently in MongoDB</p>
                        <small>
                            Enrollment rows: {stats.totalRows} | Unique students: {stats.uniqueStudents}
                        </small>
                    </div>
                </div>
                <div className="info-card">
                    <i className="fas fa-sync-alt"></i>
                    <div>
                        <h4>Auto Refresh</h4>
                        <p>Data persists after page refresh</p>
                        <small>Changes saved to database</small>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentsData;
