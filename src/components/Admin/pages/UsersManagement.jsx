import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { UsersManagementView } from './UsersManagementView';
import axios from 'axios';
import { getAuthToken, parseAuthUser } from '../../../utils/authStorage';
import { API_BASE_URL, PROTECTED_SUPER_ADMIN_EMAIL } from '../../../config/constants';
import { useAdminDialog } from '../AdminDialogContext';
import { formatLoginEmailNotice, validatePasswordPair } from '../../../utils/studentAdminValidation';
import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { lmsAdminGet } from '../../../utils/lmsAdminApi';
import { buildListCacheKey, createListCache } from '../../../utils/adminListCache';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';
import { useAdminSearch } from '../../../hooks/useAdminSearch';
import { USER_STATUS_OPTIONS, normalizeStaffStatus } from './usersManagementShared';
import './UsersManagement.scss';

const USERS_PAGE_SIZE = 25;
const PARENT_LINK_STUDENT_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

const STAFF_ROLE_SLUGS = ['manager', 'super-admin', 'accountant'];

const VARIANT_CONFIG = {
    staff: {
        roles: STAFF_ROLE_SLUGS,
        segment: 'staff',
        pageTitle: 'Staff accounts (Users)',
        addLabel: 'Add staff user',
        icon: 'fa-users-cog',
        defaultRole: 'manager',
        fixedRole: null,
        showEnroll: false,
    },
    teachers: {
        roles: ['teacher'],
        segment: 'teachers',
        pageTitle: 'Teachers',
        addLabel: 'Add teacher',
        icon: 'fa-chalkboard-teacher',
        defaultRole: 'teacher',
        fixedRole: 'teacher',
        showEnroll: false,
    },
    parents: {
        roles: ['parent'],
        segment: 'parents',
        pageTitle: 'Parents',
        addLabel: 'Add parent',
        icon: 'fa-people-roof',
        defaultRole: 'parent',
        fixedRole: 'parent',
        showEnroll: false,
    },
};

const PEOPLE_ROLE_OPTIONS = [
    { value: 'student', label: 'Student', icon: 'fa-user-graduate' },
    { value: 'teacher', label: 'Teacher/Instructor', icon: 'fa-chalkboard-teacher' },
    { value: 'parent', label: 'Parent/Guardian', icon: 'fa-people-roof' },
];

const COLUMN_DEFS = ['checkbox', 'user', 'role', 'status', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'];
const DEFAULT_COLUMN_WIDTHS = [60, 220, 160, 140, 150, 250, 250, 130, 180, 1];
const COLUMN_MIN_WIDTHS = [50, 140, 110, 100, 110, 140, 140, 100, 120, 90];
const COLUMN_MAX_WIDTHS = [90, 360, 260, 240, 280, 420, 420, 220, 320, 320];

const TABLE_LAYOUT = {
    staff: {
        keys: COLUMN_DEFS,
        widths: DEFAULT_COLUMN_WIDTHS,
        mins: COLUMN_MIN_WIDTHS,
        maxs: COLUMN_MAX_WIDTHS,
    },
    teachers: {
        keys: ['checkbox', 'user', 'status', 'assignedCourses', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'],
        widths: [60, 240, 160, 260, 150, 250, 250, 130, 180, 1],
        mins: [50, 160, 120, 160, 110, 140, 140, 100, 120, 90],
        maxs: [90, 380, 260, 420, 280, 420, 420, 220, 320, 320],
    },
    parents: {
        keys: ['checkbox', 'user', 'status', 'children', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'],
        widths: [60, 240, 140, 260, 150, 250, 250, 130, 180, 1],
        mins: [50, 160, 100, 160, 110, 140, 140, 100, 120, 90],
        maxs: [90, 380, 240, 420, 280, 420, 420, 220, 320, 320],
    },
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GORYTHM_EMAIL_REGEX = /^[^\s@]+@gorythmacademy\.com$/i;
const PERSONAL_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const UsersManagement = ({ variant = 'staff', embedded = false }) => {
    const { showAlert, showConfirm } = useAdminDialog();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const {
        searchTerm,
        setSearchTerm,
        debouncedSearch: debouncedSearchTerm,
        flushSearch: flushUserSearch,
    } = useAdminSearch('', SEARCH_DEBOUNCE_MS);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [listStats, setListStats] = useState(null);
    const [filterRole, setFilterRole] = useState('all');
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [listTab, setListTab] = useState('active');
    const [trashCount, setTrashCount] = useState(0);
    const [trashBusy, setTrashBusy] = useState(false);
    
    // Modal states
    const [showUserModal, setShowUserModal] = useState(false);
    const [viewUser, setViewUser] = useState(null);
    const [editingUser, setEditingUser] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [teacherSlots, setTeacherSlots] = useState([]);
    const [teacherSlotsLoading, setTeacherSlotsLoading] = useState(false);
    const [viewTeacherSlots, setViewTeacherSlots] = useState([]);
    const [viewTeacherSlotsLoading, setViewTeacherSlotsLoading] = useState(false);

    const [allCourses, setAllCourses] = useState([]);
    const [teacherCoursesById, setTeacherCoursesById] = useState({});
    const [teacherSlotsById, setTeacherSlotsById] = useState({});
    const [parentChildrenById, setParentChildrenById] = useState({});
    const [allStudentsForLink, setAllStudentsForLink] = useState([]);
    const [parentStudentSearch, setParentStudentSearch] = useState('');
    const [parentStudentsLoading, setParentStudentsLoading] = useState(false);
    const [linkStudentPick, setLinkStudentPick] = useState('');
    const [linkRelation, setLinkRelation] = useState('guardian');
    const [parentLinksInModal, setParentLinksInModal] = useState([]);
    const [pendingParentLinks, setPendingParentLinks] = useState([]);

    const tableContainerRef = useRef(null);
    const dragStateRef = useRef({
        isDragging: false,
        startX: 0,
        startScrollLeft: 0,
    });
    const [isTableDragging, setIsTableDragging] = useState(false);
    const tableLayout = TABLE_LAYOUT[variant] || TABLE_LAYOUT.staff;
    const tableColumnKeys = tableLayout.keys;
    const [columnWidths, setColumnWidths] = useState(tableLayout.widths);
    const [sortBy, setSortBy] = useState('joined');
    const [sortOrder, setSortOrder] = useState('desc');

    const listCacheRef = useRef(createListCache());
    const isFirstListLoadRef = useRef(true);
    const pageRef = useRef(page);
    pageRef.current = page;
    const fetchUsersRef = useRef(() => {});
    const prevFiltersRef = useRef({
        debouncedSearchTerm: '',
        filterRole: 'all',
        listTab: 'active',
        sortBy: 'joined',
        sortOrder: 'desc',
        variant,
    });

    const invalidateUsersCache = useCallback(() => {
        listCacheRef.current.clear();
    }, []);

    const startTableDragScroll = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, label')) return;

        const el = tableContainerRef.current;
        if (!el) return;

        dragStateRef.current = {
            isDragging: true,
            startX: e.clientX,
            startScrollLeft: el.scrollLeft,
        };
        setIsTableDragging(true);
    };

    const onTableDragScroll = (e) => {
        const el = tableContainerRef.current;
        const dragState = dragStateRef.current;
        if (!el || !dragState.isDragging) return;

        const deltaX = e.clientX - dragState.startX;
        el.scrollLeft = dragState.startScrollLeft - deltaX;
    };

    const stopTableDragScroll = () => {
        if (!dragStateRef.current.isDragging) return;
        dragStateRef.current.isDragging = false;
        setIsTableDragging(false);
    };

    const startColumnResize = (e, colIndex) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = columnWidths[colIndex];
        const minWidth = tableLayout.mins[colIndex] ?? 80;
        const maxWidth = tableLayout.maxs[colIndex] ?? 600;
        let rafId = null;
        let latestWidth = startWidth;

        const onPointerMove = (ev) => {
            latestWidth = clamp(startWidth + (ev.clientX - startX), minWidth, maxWidth);
            if (rafId) return;
            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                setColumnWidths((prev) => {
                    const next = [...prev];
                    next[colIndex] = latestWidth;
                    return next;
                });
            });
        };

        const stop = () => {
            window.removeEventListener('pointermove', onPointerMove);
            if (rafId) window.cancelAnimationFrame(rafId);
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stop, { once: true });
        window.addEventListener('pointercancel', stop, { once: true });
        document.body.style.cursor = 'col-resize';
    };

    const resetColumnWidth = (colIndex) => {
        setColumnWidths((prev) => {
            const next = [...prev];
            next[colIndex] = tableLayout.widths[colIndex];
            return next;
        });
    };

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(column);
            setSortOrder(column === 'joined' || column === 'lastLogin' ? 'desc' : 'asc');
        }
    };

    const currentUser = parseAuthUser() || {};
    const isSuperAdmin = currentUser.role === 'super-admin';
    const isManagerViewer = currentUser.role === 'manager';

    const variantConfig = VARIANT_CONFIG[variant] || VARIANT_CONFIG.staff;
    const isStaffTab = variant === 'staff';

    const staffRoleOptions = useMemo(() => [
        { value: 'manager', label: 'Manager', icon: 'fa-user-cog' },
        { value: 'accountant', label: 'Accountant', icon: 'fa-calculator' },
    ], []);

    const isLearnerTab = ['teachers', 'parents'].includes(variant);
    const roleOptions = isLearnerTab
        ? PEOPLE_ROLE_OPTIONS.filter((o) => variantConfig.roles.includes(o.value))
        : staffRoleOptions;

    const canCreateLearner = isLearnerTab && (isSuperAdmin || isManagerViewer);
    const canCreateStaff = variant === 'staff' && isSuperAdmin;
    const showAddButton = canCreateLearner || canCreateStaff;

    const isRowActionsLocked = (user) => {
        const email = String(user?.email || '').trim().toLowerCase();
        if (email === PROTECTED_SUPER_ADMIN_EMAIL.toLowerCase()) return true;
        if (user?.role === 'super-admin') return true;
        if (
            isManagerViewer &&
            (user?.role === 'manager' || user?.role === 'accountant')
        ) {
            return true;
        }
        return false;
    };

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        personalEmail: '',
        password: '',
        confirmPassword: '',
        role: 'teacher',
        phone: '',
        status: 'active',
        mustChangePassword: true,
        assignedCourseIds: [],
    });

    const assignedTeacherSlots = useMemo(() => {
        if (variant !== 'teachers' || !editingUser) return teacherSlots;
        const assigned = new Set((formData.assignedCourseIds || []).map(String));
        return teacherSlots.filter((slot) =>
            assigned.has(String(slot.course?._id || slot.course))
        );
    }, [variant, editingUser, teacherSlots, formData.assignedCourseIds]);

    const fetchUsers = useCallback(async (options = {}) => {
        const effectivePage = options.page ?? pageRef.current;
        const effectiveSearch = options.search !== undefined
            ? String(options.search || '').trim()
            : debouncedSearchTerm;
        const cacheKey = buildListCacheKey({
            variant,
            listTab,
            page: effectivePage,
            debouncedSearchTerm: effectiveSearch,
            filterRole,
            sortBy,
            sortOrder,
        });

        if (!options.force && listCacheRef.current.has(cacheKey)) {
            const cached = listCacheRef.current.get(cacheKey);
            setUsers(cached.users);
            setTotal(cached.total);
            if (cached.stats) setListStats(cached.stats);
            if (typeof cached.trashCount === 'number') setTrashCount(cached.trashCount);
            setLoading(false);
            setHasLoadedOnce(true);
            return;
        }

        try {
            if (!options.force) {
                setUsers([]);
            }
            setLoading(true);
            const token = getAuthToken();
            const segment = variantConfig.segment;
            const includeCounts = options.includeCounts
                || isFirstListLoadRef.current
                || prevFiltersRef.current.listTab !== listTab;
            const includeStats = listTab === 'active' && !effectiveSearch && filterRole === 'all';

            const response = await axios.get(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    segment,
                    page: effectivePage,
                    limit: USERS_PAGE_SIZE,
                    search: effectiveSearch || undefined,
                    sortBy,
                    sortOrder,
                    ...(isStaffTab && filterRole !== 'all' ? { role: filterRole } : {}),
                    ...(listTab === 'trash' ? { trash: '1' } : {}),
                    ...(includeCounts ? { includeCounts: 1 } : {}),
                    ...(includeStats ? { includeStats: 1 } : {}),
                },
            });

            if (response.data.success) {
                const raw = response.data.users || [];
                const allowed = variantConfig.roles;
                const nextUsers = raw.filter((u) => allowed.includes(u.role));
                const apiTotal = Number(response.data.total) || 0;
                const maxPage = Math.max(1, Math.ceil(apiTotal / USERS_PAGE_SIZE));
                const resolvedPage = Math.min(effectivePage, maxPage);

                listCacheRef.current.set(cacheKey, {
                    users: nextUsers,
                    total: apiTotal,
                    stats: response.data.stats || null,
                    trashCount: response.data.trashCount,
                });
                setUsers(nextUsers);
                setTotal(apiTotal);
                if (response.data.stats) setListStats(response.data.stats);
                if (typeof response.data.trashCount === 'number') {
                    setTrashCount(response.data.trashCount);
                }
                if (options.page !== undefined) {
                    setPage(resolvedPage);
                } else if (pageRef.current > maxPage) {
                    setPage(maxPage);
                }
                setHasLoadedOnce(true);
            } else {
                showAlert('Failed to load users', 'error');
                setUsers([]);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
            showAlert('Failed to load users. Check backend connection.', 'error');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, [
        debouncedSearchTerm,
        filterRole,
        isStaffTab,
        listTab,
        showAlert,
        sortBy,
        sortOrder,
        variant,
        variantConfig.roles,
        variantConfig.segment,
    ]);

    fetchUsersRef.current = fetchUsers;

    const reloadAfterMutation = useCallback(async () => {
        invalidateUsersCache();
        await fetchUsers({
            force: true,
            includeCounts: true,
            page: pageRef.current,
        });
    }, [fetchUsers, invalidateUsersCache]);

    const handleManualRefresh = useCallback(() => {
        invalidateUsersCache();
        fetchUsers({ force: true, includeCounts: true });
    }, [fetchUsers, invalidateUsersCache]);

    const loadTeacherCourseMap = useCallback(async (token) => {
        try {
            const [res, slotsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/users/teachers/course-assignments`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                lmsAdminGet('/schedules').catch(() => ({ success: false, schedules: [] })),
            ]);
            setAllCourses(res.data.courses || []);
            setTeacherCoursesById(res.data.assignmentsByTeacherId || {});

            const byTeacher = {};
            for (const slot of slotsRes.schedules || []) {
                const tid = String(slot.teacher?._id || slot.teacher || '');
                if (!tid) continue;
                if (!byTeacher[tid]) byTeacher[tid] = [];
                byTeacher[tid].push(slot);
            }
            setTeacherSlotsById(byTeacher);
        } catch (err) {
            console.error('Failed to load teacher course assignments', err);
            setAllCourses([]);
            setTeacherCoursesById({});
            setTeacherSlotsById({});
        }
    }, []);

    const loadParentChildrenMap = useCallback(async (token) => {
        const res = await axios.get(`${API_BASE_URL}/api/lms-admin/parent-links`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { linksOnly: '1' },
        });
        if (!res.data.success) return;
        const map = {};
        for (const link of res.data.links || []) {
            const pid = link.parent?._id || link.parent;
            if (!pid) continue;
            const key = String(pid);
            if (!map[key]) map[key] = [];
            map[key].push(link);
        }
        setParentChildrenById(map);
    }, []);

    const patchParentChildrenMap = useCallback((parentId, updater) => {
        const key = String(parentId);
        setParentChildrenById((prev) => {
            const current = prev[key] || [];
            const next = typeof updater === 'function' ? updater(current) : updater;
            return { ...prev, [key]: next };
        });
    }, []);

    const fetchStudentsForParentLink = useCallback(async (search = '') => {
        const token = getAuthToken();
        if (!token) return;
        setParentStudentsLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    segment: 'students',
                    limit: PARENT_LINK_STUDENT_LIMIT,
                    search: search.trim() || undefined,
                    sortBy: 'student',
                    sortOrder: 'asc',
                    unlinkedOnly: 1,
                },
            });
            if (res.data.success) {
                setAllStudentsForLink((res.data.users || []).filter((u) => u.role === 'student'));
            } else {
                setAllStudentsForLink([]);
            }
        } catch {
            setAllStudentsForLink([]);
        } finally {
            setParentStudentsLoading(false);
        }
    }, []);

    useEffect(() => {
        const prev = prevFiltersRef.current;
        const tabChanged = prev.listTab !== listTab;
        const filtersChanged =
            prev.debouncedSearchTerm !== debouncedSearchTerm
            || prev.filterRole !== filterRole
            || prev.listTab !== listTab
            || prev.sortBy !== sortBy
            || prev.sortOrder !== sortOrder
            || prev.variant !== variant;

        const includeCounts = isFirstListLoadRef.current || tabChanged;

        if (filtersChanged) {
            prevFiltersRef.current = {
                debouncedSearchTerm,
                filterRole,
                listTab,
                sortBy,
                sortOrder,
                variant,
            };
            if (isFirstListLoadRef.current) {
                isFirstListLoadRef.current = false;
            }
            if (pageRef.current !== 1) {
                setPage(1);
                return;
            }
            fetchUsersRef.current({ page: 1, includeCounts, force: true });
            return;
        }

        if (isFirstListLoadRef.current) {
            isFirstListLoadRef.current = false;
        }
        fetchUsersRef.current({ page, includeCounts, force: true });
    }, [page, debouncedSearchTerm, filterRole, listTab, sortBy, sortOrder, variant]);

    useEffect(() => {
        setSelectedUsers([]);
    }, [listTab, page, debouncedSearchTerm, filterRole, variant]);

    useEffect(() => {
        const layout = TABLE_LAYOUT[variant] || TABLE_LAYOUT.staff;
        setColumnWidths(layout.widths);
    }, [variant]);

    useEffect(() => {
        const token = getAuthToken();
        if (!token) return;
        if (variant === 'teachers') loadTeacherCourseMap(token);
        if (variant === 'parents') {
            loadParentChildrenMap(token);
        }
    }, [variant, loadTeacherCourseMap, loadParentChildrenMap]);

    useEffect(() => {
        if (!showUserModal || variant !== 'parents') return undefined;
        const delay = parentStudentSearch.trim() ? 300 : 0;
        const timer = window.setTimeout(() => {
            fetchStudentsForParentLink(parentStudentSearch);
        }, delay);
        return () => window.clearTimeout(timer);
    }, [showUserModal, variant, parentStudentSearch, fetchStudentsForParentLink]);

    // Keep scrolling inside Add/Edit user modal (not the page behind)
    useEffect(() => {
        if (!showUserModal) return undefined;
        const prevOverflow = document.body.style.overflow;
        const prevTouchAction = document.body.style.touchAction;
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';

        return () => {
            document.body.style.overflow = prevOverflow || '';
            document.body.style.touchAction = prevTouchAction || '';
        };
    }, [showUserModal]);

    const openCreateModal = () => {
        setEditingUser(null);
        setTeacherSlots([]);
        setPendingParentLinks([]);
        const defaultRole = variantConfig.fixedRole || variantConfig.defaultRole;
        setParentStudentSearch('');
        setFormData({
            name: '',
            email: '',
            personalEmail: '',
            password: '',
            confirmPassword: '',
            role: defaultRole,
            phone: '',
            status: 'active',
            mustChangePassword: true,
            assignedCourseIds: [],
        });
        setLinkStudentPick('');
        setLinkRelation('guardian');
        setParentLinksInModal([]);
        setShowPassword(false);
        setShowConfirmPassword(false);
        setShowUserModal(true);
    };

    const loadTeacherSlots = async (teacherId, setSlots, setLoading) => {
        if (!teacherId) {
            setSlots([]);
            return;
        }
        setLoading(true);
        try {
            const res = await lmsAdminGet(`/schedules?teacherId=${encodeURIComponent(teacherId)}`);
            setSlots(res.success ? res.schedules || [] : []);
        } catch {
            setSlots([]);
        } finally {
            setLoading(false);
        }
    };

    const openEditModal = async (user) => {
        if (!user) return;
        
        setEditingUser(user);
        setTeacherSlots([]);
        const token = getAuthToken();
        let assignedCourseIds = [];
        let linksForModal = [];
        if (variant === 'teachers' && user.role === 'teacher' && token) {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/users/${user._id}/assigned-courses`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) {
                    assignedCourseIds = (res.data.courses || []).map((c) => String(c._id));
                }
            } catch {
                assignedCourseIds = (teacherCoursesById[String(user._id)] || []).map((c) => String(c._id));
            }
            loadTeacherSlots(user._id, setTeacherSlots, setTeacherSlotsLoading);
        }
        setParentStudentSearch('');
        if (variant === 'parents' && user.role === 'parent' && token) {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/users/${user._id}/child-links`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) {
                    linksForModal = res.data.links || [];
                }
            } catch {
                linksForModal = parentChildrenById[String(user._id)] || [];
            }
        }
        setFormData({
            name: user.name || '',
            email: user.email || '',
            personalEmail: user.personalEmail || '',
            password: '',
            confirmPassword: '',
            role: user.role || variantConfig.defaultRole,
            phone: user.phone || '',
            status: isStaffTab
                ? normalizeStaffStatus(user.status)
                : (USER_STATUS_OPTIONS.includes(user.status) ? user.status : (user.status === 'pending' ? 'inactive' : (user.isActive !== false ? 'active' : 'inactive'))),
            mustChangePassword: !!user.mustChangePassword,
            assignedCourseIds,
        });
        setParentLinksInModal(linksForModal);
        setLinkStudentPick('');
        setLinkRelation('guardian');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setShowUserModal(true);
    };

    const openViewModal = (user) => {
        if (!user) return;
        setViewUser(user);
        setViewTeacherSlots([]);
        if (variant === 'teachers' && user.role === 'teacher') {
            loadTeacherSlots(user._id, setViewTeacherSlots, setViewTeacherSlotsLoading);
        }
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const closeUserModal = useCallback(() => {
        if (isSubmitting) return;
        setShowUserModal(false);
        setEditingUser(null);
    }, [isSubmitting]);

    useDialogKeyboard({
        isOpen: showUserModal,
        onClose: closeUserModal,
        blockEscape: isSubmitting,
    });

    const validateForm = () => {
        const email = formData.email.trim();
        const personalEmail = formData.personalEmail?.trim();

        if (!formData.name.trim()) {
            showAlert('Name is required', 'warning');
            return false;
        }
        
        if (!email) {
            showAlert('Email is required', 'warning');
            return false;
        }

        if (!EMAIL_REGEX.test(email)) {
            showAlert('Please enter a valid email address', 'warning');
            return false;
        }

        if (!editingUser && !GORYTHM_EMAIL_REGEX.test(email)) {
            showAlert('Portal email must be in this format: id@gorythmacademy.com', 'warning');
            return false;
        }

        if (personalEmail) {
            if (personalEmail !== personalEmail.toLowerCase()) {
                showAlert('Personal email must be in lowercase letters', 'warning');
                return false;
            }
            if (!PERSONAL_EMAIL_REGEX.test(personalEmail)) {
                showAlert('Please enter a valid personal email, or leave it blank', 'warning');
                return false;
            }
        }
        
        const accountRole = variantConfig.fixedRole || formData.role;
        const peoplePassword = ['student', 'teacher', 'parent'].includes(accountRole);
        if (!editingUser) {
            const passwordErr = validatePasswordPair(formData.password, formData.confirmPassword, {
                required: !peoplePassword,
            });
            if (passwordErr) {
                showAlert(passwordErr, 'warning');
                return false;
            }
        } else {
            const passwordErr = validatePasswordPair(formData.password, formData.confirmPassword);
            if (passwordErr) {
                showAlert(passwordErr, 'warning');
                return false;
            }
        }
        
        return true;
    };

    const toggleAssignedCourse = (courseId) => {
        const id = String(courseId);
        setFormData((prev) => {
            const ids = prev.assignedCourseIds || [];
            const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
            return { ...prev, assignedCourseIds: next };
        });
    };

    const saveTeacherAssignedCourses = async (teacherId, token) => {
        if (variant !== 'teachers') return;
        try {
            const response = await axios.put(
                `${API_BASE_URL}/api/users/${teacherId}/assigned-courses`,
                {
                    courseIds: formData.assignedCourseIds || [],
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setTeacherCoursesById((prev) => ({
                ...prev,
                [String(teacherId)]: response.data.courses || [],
            }));
        } catch (error) {
            throw error;
        }
    };

    const addParentChildLink = async () => {
        if (!linkStudentPick) return;
        const student = allStudentsForLink.find((s) => String(s._id) === String(linkStudentPick));
        if (!student) return;
        const relation = linkRelation || 'guardian';

        if (editingUser) {
            if (parentLinksInModal.some((l) => String(l.student?._id || l.student || l.studentId) === String(linkStudentPick))) {
                showAlert('Child already added', 'warning');
                return;
            }
            setParentLinksInModal((prev) => [
                ...prev,
                {
                    studentId: linkStudentPick,
                    student: { _id: student._id, name: student.name, studentId: student.studentId },
                    relation,
                },
            ]);
            setAllStudentsForLink((prev) => prev.filter((s) => String(s._id) !== String(student._id)));
            setLinkStudentPick('');
            return;
        }

        if (pendingParentLinks.some((l) => String(l.studentId) === String(linkStudentPick))) {
            showAlert('Child already added', 'warning');
            return;
        }
        setPendingParentLinks((prev) => [
            ...prev,
            { studentId: linkStudentPick, student: { name: student.name, studentId: student.studentId }, relation },
        ]);
        setLinkStudentPick('');
    };

    const removePendingParentLink = (studentId) => {
        setPendingParentLinks((prev) => prev.filter((l) => String(l.studentId) !== String(studentId)));
    };

    const removeParentChildLink = (linkIdOrStudentId) => {
        setParentLinksInModal((prev) =>
            prev.filter((l) => {
                const id = String(l._id || l.studentId || l.student?._id || l.student);
                return id !== String(linkIdOrStudentId);
            })
        );
    };

    const updateDraftLinkRelation = (key, relation) => {
        const apply = (list) =>
            list.map((link) => {
                const id = String(link._id || link.studentId || link.student?._id || link.student);
                if (id !== String(key)) return link;
                return { ...link, relation };
            });
        if (editingUser) setParentLinksInModal(apply);
        else setPendingParentLinks(apply);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        if (isSubmitting) return;
        if (!validateForm()) return;
        
        setIsSubmitting(true);
        const token = getAuthToken();
        
        try {
            const resolvedStatus = isStaffTab ? normalizeStaffStatus(formData.status) : formData.status;
            const payload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                role: variantConfig.fixedRole || formData.role,
                phone: formData.phone.trim(),
                status: resolvedStatus,
                isActive: resolvedStatus === 'active',
                personalEmail: (formData.personalEmail || '').trim(),
            };
            
            if (!editingUser) {
                const accountRole = variantConfig.fixedRole || formData.role;
                const peoplePassword = ['student', 'teacher', 'parent'].includes(accountRole);
                if (formData.password.trim()) {
                    payload.password = formData.password;
                    payload.mustChangePassword = formData.mustChangePassword;
                } else if (!peoplePassword) {
                    payload.password = formData.password;
                    payload.mustChangePassword = formData.mustChangePassword;
                }
                if (variant === 'teachers') payload.deferLoginEmail = true;

                const response = await axios.post(
                    `${API_BASE_URL}/api/users`,
                    {
                        ...payload,
                        ...(variant === 'parents' && pendingParentLinks.length
                            ? {
                                studentIds: pendingParentLinks.map((l) => l.studentId),
                                studentLinks: pendingParentLinks.map((l) => ({
                                    studentId: l.studentId,
                                    relation: l.relation || 'guardian',
                                })),
                            }
                            : {}),
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
                const created = response.data.user;
                setUsers(prev => [created, ...prev]);
                if (variant === 'teachers' && created.role === 'teacher' && (formData.assignedCourseIds || []).length) {
                    await saveTeacherAssignedCourses(created._id, token);
                }
                let loginEmail = response.data.loginEmail;
                if (variant === 'teachers' && created.role === 'teacher') {
                    const mailRes = await axios.post(
                        `${API_BASE_URL}/api/users/${created._id}/login-email`,
                        { force: false },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    loginEmail = mailRes.data.loginEmail;
                    if (mailRes.data.user) {
                        setUsers((prev) => prev.map((user) => (
                            user._id === created._id ? { ...user, ...mailRes.data.user } : user
                        )));
                    }
                }
                const notice = formatLoginEmailNotice(loginEmail);
                showAlert(`User created successfully!${notice ? ` ${notice}` : ''}`, 'success');
                if (variant === 'parents' && created.role === 'parent' && pendingParentLinks.length) {
                    if (response.data.parentLinks?.length) {
                        patchParentChildrenMap(created._id, response.data.parentLinks);
                    }
                    setPendingParentLinks([]);
                }
            } else {
                const userId = editingUser._id;
                const passwordErr = validatePasswordPair(formData.password, formData.confirmPassword);
                const changingPassword = Boolean(formData.password) && !passwordErr;
                const updatePayload = { ...payload };
                if (changingPassword) {
                    updatePayload.password = formData.password;
                    updatePayload.mustChangePassword = formData.mustChangePassword;
                }
                if (variant === 'parents') {
                    updatePayload.studentLinks = parentLinksInModal.map((l) => ({
                        studentId: l.student?._id || l.student || l.studentId,
                        relation: l.relation || 'guardian',
                    }));
                }

                const response = await axios.put(
                    `${API_BASE_URL}/api/users/${userId}`,
                    updatePayload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const notice = formatLoginEmailNotice(response.data.loginEmail);
                showAlert(
                    `${changingPassword ? 'User and password updated successfully!' : 'User updated successfully!'}${notice ? ` ${notice}` : ''}`,
                    'success'
                );

                setUsers(prev => prev.map(user =>
                    user._id === userId ? response.data.user : user
                ));

                if (variant === 'parents' && editingUser.role === 'parent') {
                    const savedLinks = response.data.parentLinks;
                    if (Array.isArray(savedLinks)) {
                        patchParentChildrenMap(userId, savedLinks);
                    }
                }
                if (variant === 'teachers' && editingUser.role === 'teacher') {
                    await saveTeacherAssignedCourses(userId, token);
                }
            }
            
            setShowUserModal(false);
            setEditingUser(null);
            
        } catch (error) {
            console.error('Error saving user:', error);
            const errorMessage = error.response?.data?.error || 'Failed to save user';
            showAlert(errorMessage, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleUserSelection = (userId) => {
        const u = users.find((x) => x._id === userId);
        if (u && isRowActionsLocked(u)) return;
        setSelectedUsers(prev => 
            prev.includes(userId) 
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const updateUserStatus = async (userId, currentStatus, targetStatus) => {
        const user = users.find(u => u._id === userId);
        if (user && isRowActionsLocked(user)) return;
        const effectiveStatus = isStaffTab ? normalizeStaffStatus(currentStatus) : currentStatus;
        const newStatus = targetStatus || (effectiveStatus === 'active' ? 'inactive' : 'active');
        if (newStatus === effectiveStatus) return;
        
        const confirmed = await showConfirm({
            title: 'Change User Status?',
            message: `Change "${user?.name || 'this user'}" from ${effectiveStatus} to ${newStatus}?`,
            confirmLabel: 'Change Status',
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.patch(
                `${API_BASE_URL}/api/users/${userId}/status`, 
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            // Update local state
            setUsers(prev => prev.map(row => 
                row._id === userId 
                    ? { ...row, status: newStatus, isActive: newStatus === 'active' }
                    : row
            ));
            
            showAlert(`User status set to ${newStatus}.`, 'success');
        } catch (error) {
            console.error('Error updating user status:', error);
            showAlert('Failed to update user status', 'error');
        }
    };

    const deleteUser = async (userId) => {
        const user = users.find(u => u._id === userId);
        if (user && isRowActionsLocked(user)) return;

        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move "${user?.name || 'this user'}" to ${QUARANTINE_LABEL}? They will lose portal and login access. Restore from the ${QUARANTINE_LABEL} tab.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            await reloadAfterMutation();
            setSelectedUsers(prev => prev.filter(id => id !== userId));
            
            showAlert(`User moved to ${QUARANTINE_LABEL}.`, 'success');
        } catch (error) {
            console.error('Error moving user to quarantine:', error);
            showAlert(error.response?.data?.error || `Failed to move user to ${QUARANTINE_LABEL}`, 'error');
        }
    };

    const restoreUser = async (userId) => {
        if (trashBusy) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/users/${userId}/restore`, null, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            showAlert('User restored.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to restore user', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const restoreSelectedUsers = async () => {
        if (trashBusy || !selectedUsers.length) return;
        setTrashBusy(true);
        const token = getAuthToken();
        const ids = [...selectedUsers];
        let restored = 0;
        let failed = 0;

        for (const id of ids) {
            try {
                await axios.patch(`${API_BASE_URL}/api/users/${id}/restore`, null, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                restored += 1;
            } catch {
                failed += 1;
            }
        }

        await reloadAfterMutation();
        setSelectedUsers([]);
        setTrashBusy(false);

        if (failed === 0) {
            showAlert(`${restored} user(s) restored.`, 'success');
        } else if (restored === 0) {
            showAlert(`Failed to restore ${failed} user(s).`, 'error');
        } else {
            showAlert(`Restored ${restored} user(s). ${failed} could not be restored.`, 'warning');
        }
    };

    const permanentDeleteSelectedUsers = async () => {
        if (trashBusy || !selectedUsers.length || listTab !== 'trash') return;

        const confirmed = await showConfirm({
            title: 'Delete Permanently?',
            message: `Permanently delete ${selectedUsers.length} user(s)? This cannot be undone.`,
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;

        setTrashBusy(true);
        const token = getAuthToken();
        const ids = [...selectedUsers];
        let deleted = 0;
        let failed = 0;

        for (const id of ids) {
            try {
                await axios.delete(`${API_BASE_URL}/api/users/${id}/permanent`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                deleted += 1;
            } catch {
                failed += 1;
            }
        }

        await reloadAfterMutation();
        setSelectedUsers([]);
        setTrashBusy(false);

        if (failed === 0) {
            showAlert(`${deleted} user(s) permanently deleted.`, 'success');
        } else if (deleted === 0) {
            showAlert(`Failed to permanently delete ${failed} user(s).`, 'error');
        } else {
            showAlert(
                `Deleted ${deleted} user(s). ${failed} could not be deleted.`,
                'warning'
            );
        }
    };

    const permanentDeleteUser = async (userId) => {
        if (listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete Permanently?',
            message: 'This cannot be undone. The user account will be removed from the database.',
            confirmLabel: 'Delete forever',
        });
        if (!confirmed) return;
        setTrashBusy(true);
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${userId}/permanent`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await reloadAfterMutation();
            setSelectedUsers((prev) => prev.filter((id) => id !== userId));
            showAlert('User permanently deleted.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to permanently delete user', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const deleteSelectedUsers = async () => {
        if (!selectedUsers.length) {
            showAlert('Please select users to delete', 'warning');
            return;
        }
        
        const confirmed = await showConfirm({
            title: `Move to ${QUARANTINE_LABEL}?`,
            message: `Move ${selectedUsers.length} selected user(s) to ${QUARANTINE_LABEL}? They will lose portal and login access.`,
            confirmLabel: `Move to ${QUARANTINE_LABEL}`,
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            const response = await axios.post(
                `${API_BASE_URL}/api/users/bulk-delete`, 
                { ids: selectedUsers },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Refresh list
            await reloadAfterMutation();
            setSelectedUsers([]);
            
            showAlert(response.data.message || `${selectedUsers.length} user(s) moved to ${QUARANTINE_LABEL}.`, 'success');
        } catch (error) {
            console.error('Error deleting selected users:', error);
            showAlert('Failed to delete users', 'error');
        }
    };

    const updateSelectedStatus = async (status) => {
        if (!selectedUsers.length) {
            showAlert('Please select users to update', 'warning');
            return;
        }

        const confirmed = await showConfirm({
            title: 'Update User Status?',
            message: `Set ${selectedUsers.length} selected user(s) to ${status}?`,
            confirmLabel: 'Update Status',
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.patch(`${API_BASE_URL}/api/users/bulk-status`, 
                { ids: selectedUsers, status },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            // Refresh list
            await reloadAfterMutation();
            showAlert(`${selectedUsers.length} user(s) set to ${status} successfully!`, 'success');
        } catch (error) {
            console.error('Error updating selected users status:', error);
            showAlert('Failed to update status', 'error');
        }
    };

    const sortedUsers = useMemo(() => {
        if (sortBy !== 'assignedCourses' && sortBy !== 'children') {
            return users;
        }
        const mult = sortOrder === 'asc' ? 1 : -1;
        return [...users].sort((a, b) => {
            const getVal = (u, key) => {
                if (key === 'assignedCourses') {
                    return (teacherCoursesById[String(u._id)] || [])
                        .map((c) => c.title)
                        .join(', ')
                        .toLowerCase();
                }
                if (key === 'children') {
                    return (parentChildrenById[String(u._id)] || [])
                        .map((l) => l.student?.name || '')
                        .join(', ')
                        .toLowerCase();
                }
                return '';
            };
            const va = getVal(a, sortBy);
            const vb = getVal(b, sortBy);
            return mult * va.localeCompare(vb);
        });
    }, [users, sortBy, sortOrder, teacherCoursesById, parentChildrenById]);

    const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
    const statsByRole = listStats?.byRole || {};

    const downloadUsersCsv = async () => {
        try {
            const token = getAuthToken();
            const segment = variantConfig.segment;
            const allRows = [];
            let exportPage = 1;
            let exportTotal = 0;

            do {
                const response = await axios.get(`${API_BASE_URL}/api/users`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        segment,
                        page: exportPage,
                        limit: 500,
                        search: debouncedSearchTerm || undefined,
                        sortBy,
                        sortOrder,
                        ...(isStaffTab && filterRole !== 'all' ? { role: filterRole } : {}),
                        ...(listTab === 'trash' ? { trash: '1' } : {}),
                    },
                });
                if (!response.data?.success) break;
                const batch = (response.data.users || []).filter((u) => variantConfig.roles.includes(u.role));
                allRows.push(...batch);
                exportTotal = Number(response.data.total) || batch.length;
                exportPage += 1;
            } while (allRows.length < exportTotal);

            const exportUsers = allRows;
            const rows = (exportUsers || []).map((u) => ({
                studentId: u.role === 'student' ? (u.studentId || '') : '',
                name: u.name || '',
                portalEmail: u.email || '',
                personalEmail: u.personalEmail || '',
                role: u.role || '',
                phone: u.phone || '',
                status: isStaffTab
                    ? normalizeStaffStatus(u.status)
                    : (u.status || (u.isActive !== false ? 'active' : 'inactive')),
                joined: u.joinDate ? new Date(u.joinDate).toISOString().slice(0, 10) : '',
            }));

            const cols = [
                ['studentId', 'Student ID'],
                ['name', 'Name'],
                ['portalEmail', 'Portal email'],
                ['personalEmail', 'Personal email'],
                ['role', 'Role'],
                ['phone', 'Phone'],
                ['status', 'Status'],
                ['joined', 'Joined'],
            ];

            const esc = (v) => {
                const s = String(v ?? '');
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };

            const csv = [
                cols.map((c) => esc(c[1])).join(','),
                ...rows.map((r) => cols.map((c) => esc(r[c[0]])).join(',')),
            ].join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gorythm-${variant}-records-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            showAlert(error.response?.data?.error || error.message || 'Failed to export CSV', 'error');
        }
    };

    const selectableFilteredUsers = sortedUsers.filter((u) => !isRowActionsLocked(u));

    const toggleAllUsers = () => {
        if (selectedUsers.length === selectableFilteredUsers.length && selectableFilteredUsers.length > 0) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(selectableFilteredUsers.map(user => user._id));
        }
    };

    if (loading && !hasLoadedOnce && !users.length) {
        return (
            <div className="users-management">
                <div className="page-header">
                    <div className="header-left">
                        <h1>
                            <i className={`fas ${isLearnerTab ? variantConfig.icon : 'fa-users-cog'}`}></i>{' '}
                            {variantConfig.pageTitle}
                        </h1>
                    </div>
                </div>
                <div className="users-table-container users-table-container--skeleton" aria-hidden>
                    {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="users-table-skeleton-row" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <UsersManagementView
            state={{
                addParentChildLink,
                allCourses,
                allStudentsForLink,
                assignedTeacherSlots,
                closeUserModal,
                columnWidths,
                deleteSelectedUsers,
                deleteUser,
                downloadUsersCsv,
                editingUser,
                embedded,
                fetchUsers,
                filterRole,
                flushUserSearch,
                formData,
                handleFormChange,
                handleFormSubmit,
                handleManualRefresh,
                handleSort,
                isLearnerTab,
                isRowActionsLocked,
                isStaffTab,
                isSubmitting,
                isTableDragging,
                linkRelation,
                linkStudentPick,
                listStats,
                listTab,
                loading,
                onTableDragScroll,
                openCreateModal,
                openEditModal,
                openViewModal,
                page,
                parentChildrenById,
                parentLinksInModal,
                parentStudentSearch,
                parentStudentsLoading,
                pendingParentLinks,
                permanentDeleteSelectedUsers,
                permanentDeleteUser,
                removeParentChildLink,
                removePendingParentLink,
                resetColumnWidth,
                restoreSelectedUsers,
                restoreUser,
                roleOptions,
                searchTerm,
                selectableFilteredUsers,
                selectedUsers,
                setEditingUser,
                setFilterRole,
                setIsSubmitting,
                setLinkRelation,
                setLinkStudentPick,
                setListTab,
                setPage,
                setParentStudentSearch,
                setSearchTerm,
                setSelectedUsers,
                setShowConfirmPassword,
                setShowPassword,
                setShowUserModal,
                setUsers,
                setViewUser,
                showAddButton,
                showAlert,
                showConfirmPassword,
                showPassword,
                showUserModal,
                sortBy,
                sortOrder,
                sortedUsers,
                startColumnResize,
                startTableDragScroll,
                statsByRole,
                stopTableDragScroll,
                tableColumnKeys,
                tableContainerRef,
                teacherCoursesById,
                teacherSlotsById,
                teacherSlotsLoading,
                toggleAllUsers,
                toggleAssignedCourse,
                toggleUserSelection,
                total,
                totalPages,
                trashBusy,
                trashCount,
                updateDraftLinkRelation,
                updateSelectedStatus,
                updateUserStatus,
                users,
                variant,
                variantConfig,
                viewTeacherSlots,
                viewTeacherSlotsLoading,
                viewUser,
            }}
        />
    );
};

export default UsersManagement;
