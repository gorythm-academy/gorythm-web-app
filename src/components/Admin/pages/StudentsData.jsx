import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { useAdminDialog } from '../AdminDialogContext';
import { portalEmailDisplayLabel } from '../../../utils/studentPortalEmail';
import {
    normalizeEnrollmentStatus,
} from '../../../utils/studentAdminValidation';
import { billingStatusLabel, formatFeeSummaryMessage } from '../../../utils/billingLabels';
import { QUARANTINE_COURSES_LABEL, QUARANTINE_STUDENTS_LABEL } from '../../../utils/adminListLabels';
import './StudentsData.scss';
import { StudentsDataView } from './StudentsDataView';
import {
    getEnrollmentTeacherLabel,
    getEnrollmentTimeslotLabel,
    summarizeLabels,
    buildStudentCardsFromApi,
    sortStudentCards,
    buildListCacheKey,
    buildOverlayCacheKey,
} from './studentsDataHelpers';

const PAGE_SIZE = 9;
const CSV_EXPORT_PAGE_SIZE = 5000;

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
    const [editMode, setEditMode] = useState('course');
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
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState('desc');

    const [detailStudent, setDetailStudent] = useState(null);
    const [detailTab, setDetailTab] = useState('active');
    const [detailEnrollments, setDetailEnrollments] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailRefreshing, setDetailRefreshing] = useState(false);
    const [detailQuarantineCount, setDetailQuarantineCount] = useState(0);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

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
        sortBy: 'createdAt',
        sortOrder: 'desc',
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
        if (cacheKey) overlayCacheRef.current.delete(cacheKey);

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
        setDetailEnrollments(card.enrollments || []);
        setDetailQuarantineCount(openOnTrash ? (card.enrollments?.length || 0) : 0);
        setDetailLoading(true);
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
            const payload = { status: newStatus };
            if (newStatus === 'completed' && normalizeEnrollmentStatus(enrollment.status) !== 'completed') {
                try {
                    const preview = await axios.get(
                        `${API_BASE_URL}/api/enrollments/${enrollment._id}/fee-summary`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
                    const summary = preview.data?.feeSummary;
                    if (summary?.needsCompleteConfirm) {
                        const ok = await showConfirm({
                            title: 'Complete with unpaid fees?',
                            message: formatFeeSummaryMessage(summary),
                            confirmLabel: 'Complete anyway',
                        });
                        if (!ok) return;
                        payload.confirmComplete = true;
                    }
                } catch {
                    payload.confirmComplete = true;
                }
            }
            if (normalizeEnrollmentStatus(enrollment.status) === 'completed' && newStatus !== 'completed') {
                const ok = await showConfirm({
                    title: 'Start billing again?',
                    message: 'Un-completing this course will start fee due dates again if fees are still unpaid.',
                    confirmLabel: 'Continue',
                });
                if (!ok) return;
            }
            await axios.put(
                `${API_BASE_URL}/api/enrollments/${enrollment._id}`,
                payload,
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
        setEditMode('course');
        setEditingEnrollment(enrollment);
        setShowEditModal(true);
    };

    const handleEditAccount = (enrollment) => {
        setEditMode('account');
        const rowStudent = enrollment?.student && typeof enrollment.student === 'object'
            ? enrollment.student
            : null;
        const studentId = rowStudent?._id
            || rowStudent?.id
            || (typeof enrollment?.student === 'string' ? enrollment.student : '')
            || detailStudent?._id
            || '';
        setEditingEnrollment({
            ...(enrollment || {}),
            student: {
                ...(rowStudent || {}),
                ...(detailStudent || {}),
                _id: studentId,
                name: rowStudent?.name || detailStudent?.name || '',
                studentId: rowStudent?.studentId || detailStudent?.studentId || '',
                email: rowStudent?.email || detailStudent?.email || '',
                personalEmail: rowStudent?.personalEmail || detailStudent?.personalEmail || '',
                phone: rowStudent?.phone || detailStudent?.phone || '',
            },
        });
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
                    feeStatus: billingStatusLabel(enrollment.displayFeeStatus || enrollment.paymentStatus || 'pending'),
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
                ['feeStatus', 'Fee Status'],
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
        <StudentsDataView
            state={{
                showAddModal,
                setShowAddModal,
                handleAddStudentSuccess,
                courses,
                showEnrollModal,
                setShowEnrollModal,
                setEnrollPreselectedStudent,
                handleEnrollExistingSuccess,
                enrollPreselectedStudent,
                detailEnrollments,
                showEditModal,
                editMode,
                editingEnrollment,
                setShowEditModal,
                setEditingEnrollment,
                handleEditSaved,
                detailStudent,
                detailTab,
                setDetailTab,
                detailLoading,
                detailRefreshing,
                trashBusy,
                detailQuarantineCount,
                listTab,
                closeStudentDetail,
                handleAddCourseToStudent,
                handleEditEnrollment,
                handleEditAccount,
                handleQuarantineEnrollment,
                handleQuarantineStudent,
                handleRestoreStudent,
                handlePermanentDeleteStudent,
                handleRestoreEnrollment,
                handlePermanentDelete,
                updateEnrollmentStatus,
                stats,
                trashStudentsCount,
                trashCount,
                handleAddStudent,
                errorMessage,
                setErrorMessage,
                successMessage,
                setSuccessMessage,
                setListTab,
                setFilterStatus,
                setFilterFeeStatus,
                searchTerm,
                setSearchTerm,
                filterStatus,
                filterFeeStatus,
                sortBy,
                setSortBy,
                sortOrder,
                setSortOrder,
                handleManualRefresh,
                downloadStudentsDataCsv,
                loading,
                studentCards,
                openStudentDetail,
                page,
                setPage,
                total,
                totalPages,
                PAGE_SIZE,
            }}
        />
    );
};

export default StudentsData;
