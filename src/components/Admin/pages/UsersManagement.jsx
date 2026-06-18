import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { getAuthToken, parseAuthUser } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import EnrollStudentModal from './EnrollStudentModal';
import { useAdminDialog } from '../AdminDialogContext';
import './UsersManagement.scss';

const PEOPLE_ROLE_SLUGS = ['student', 'teacher', 'parent'];
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
    students: {
        roles: ['student'],
        segment: 'students',
        pageTitle: 'Students',
        addLabel: 'Add student',
        icon: 'fa-user-graduate',
        defaultRole: 'student',
        fixedRole: 'student',
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
    people: {
        roles: ['student'],
        segment: 'people',
        pageTitle: 'Students',
        addLabel: 'Add student',
        icon: 'fa-user-graduate',
        defaultRole: 'student',
        fixedRole: 'student',
        showEnroll: true,
    },
};

function displayRoleLabel(role) {
    if (role === 'manager') return 'Manager';
    if (role === 'super-admin') return 'Super Admin';
    if (role === 'teacher') return 'Teacher';
    if (role === 'parent') return 'Parent';
    if (role === 'student') return 'Student';
    if (role === 'accountant') return 'Accountant';
    return role || '—';
}

const PEOPLE_ROLE_OPTIONS = [
    { value: 'student', label: 'Student', icon: 'fa-user-graduate' },
    { value: 'teacher', label: 'Teacher/Instructor', icon: 'fa-chalkboard-teacher' },
    { value: 'parent', label: 'Parent/Guardian', icon: 'fa-people-roof' },
];

const COLUMN_DEFS = ['checkbox', 'user', 'role', 'status', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'];
const DEFAULT_COLUMN_WIDTHS = [60, 220, 160, 140, 150, 250, 250, 130, 180, 150];
const COLUMN_MIN_WIDTHS = [50, 140, 110, 100, 110, 140, 140, 100, 120, 120];
const COLUMN_MAX_WIDTHS = [90, 360, 260, 240, 280, 420, 420, 220, 320, 260];

const TABLE_LAYOUT = {
    staff: {
        keys: COLUMN_DEFS,
        widths: DEFAULT_COLUMN_WIDTHS,
        mins: COLUMN_MIN_WIDTHS,
        maxs: COLUMN_MAX_WIDTHS,
    },
    teachers: {
        keys: ['checkbox', 'user', 'role', 'status', 'assignedCourses', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'],
        widths: [60, 220, 160, 140, 260, 150, 250, 250, 130, 180, 150],
        mins: [50, 140, 110, 100, 160, 110, 140, 140, 100, 120, 120],
        maxs: [90, 360, 260, 240, 420, 280, 420, 420, 220, 320, 260],
    },
    parents: {
        keys: ['checkbox', 'user', 'role', 'status', 'children', 'phone', 'email', 'personalEmail', 'joined', 'lastLogin', 'actions'],
        widths: [60, 220, 160, 140, 260, 150, 250, 250, 130, 180, 150],
        mins: [50, 140, 110, 100, 160, 110, 140, 140, 100, 120, 120],
        maxs: [90, 360, 260, 240, 420, 280, 420, 420, 220, 320, 260],
    },
};

const COLUMN_LABELS = {
    checkbox: '',
    user: 'User',
    role: 'Role',
    status: 'Status',
    assignedCourses: 'Assigned courses',
    children: 'Children',
    phone: 'Phone',
    email: 'Email',
    personalEmail: 'Personal email',
    joined: 'Joined',
    lastLogin: 'Last Login',
    actions: 'Actions',
};
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GORYTHM_EMAIL_REGEX = /^[^\s@]+@gorythmacademy\.com$/i;
const GORYTHM_EMAIL_DOMAIN = '@gorythmacademy.com';

const sanitizePortalEmailLocal = (raw) => {
    const value = String(raw ?? '');
    const beforeAt = value.includes('@') ? value.split('@')[0] : value;
    return beforeAt.replace(/\s+/g, '');
};
const PERSONAL_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const USER_STATUS_OPTIONS = ['active', 'pending', 'inactive', 'completed'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const UsersManagement = ({ variant = 'staff' }) => {
    const { showAlert, showConfirm } = useAdminDialog();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
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

    // Enroll modal state (legacy; students tab merged into Students page)
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollingStudent, setEnrollingStudent] = useState(null);
    const [coursesForEnroll, setCoursesForEnroll] = useState([]);

    const [allCourses, setAllCourses] = useState([]);
    const [teacherCoursesById, setTeacherCoursesById] = useState({});
    const [parentChildrenById, setParentChildrenById] = useState({});
    const [allStudentsForLink, setAllStudentsForLink] = useState([]);
    const [coursesToReassign, setCoursesToReassign] = useState([]);
    const [linkStudentPick, setLinkStudentPick] = useState('');
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

    const staffRoleOptions = useMemo(() => {
        const base = [
            { value: 'manager', label: 'Manager', icon: 'fa-user-cog' },
            { value: 'accountant', label: 'Accountant', icon: 'fa-calculator' },
        ];
        if (isSuperAdmin) {
            return [{ value: 'super-admin', label: 'Super Admin', icon: 'fa-user-shield' }, ...base];
        }
        return base;
    }, [isSuperAdmin]);

    const isLearnerTab = ['students', 'teachers', 'parents', 'people'].includes(variant);
    const roleOptions = isLearnerTab
        ? PEOPLE_ROLE_OPTIONS.filter((o) => variantConfig.roles.includes(o.value))
        : staffRoleOptions;

    const canCreateLearner = isLearnerTab && (isSuperAdmin || isManagerViewer);
    const canCreateStaff = variant === 'staff' && isSuperAdmin;
    const showAddButton = canCreateLearner || canCreateStaff;

    const isRowActionsLocked = (user) =>
        (user.role === 'super-admin' || user.isSystemAccount) && !isSuperAdmin;

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
        releaseToTeacherId: '',
    });

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const token = getAuthToken();
            const segment = variantConfig.segment;

            const response = await axios.get(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    segment,
                    limit: 500,
                    ...(listTab === 'trash' ? { trash: '1' } : {}),
                },
            });

            if (response.data.success) {
                const raw = response.data.users || [];
                const allowed = variantConfig.roles;
                setUsers(raw.filter((u) => allowed.includes(u.role)));
                if (typeof response.data.trashCount === 'number') {
                    setTrashCount(response.data.trashCount);
                }
            } else {
                showAlert('Failed to load users', 'error');
                setUsers([]);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching users:', error);
            showAlert('Failed to load users. Check backend connection.', 'error');
            setUsers([]);
            setLoading(false);
        }
    }, [showAlert, variant, listTab]);

    const loadTeacherCourseMap = useCallback(async (token) => {
        const res = await axios.get(`${API_BASE_URL}/api/courses`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const courses = res.data.courses || [];
        setAllCourses(courses);
        const map = {};
        for (const c of courses) {
            const tid = c.instructor?._id || c.instructor;
            if (!tid) continue;
            const key = String(tid);
            if (!map[key]) map[key] = [];
            map[key].push(c);
        }
        setTeacherCoursesById(map);
    }, []);

    const loadParentChildrenMap = useCallback(async (token) => {
        const res = await axios.get(`${API_BASE_URL}/api/lms-admin/parent-links`, {
            headers: { Authorization: `Bearer ${token}` },
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

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

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
            axios
                .get(`${API_BASE_URL}/api/users`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { segment: 'people', limit: 500 },
                })
                .then((res) => {
                    if (res.data.success) {
                        setAllStudentsForLink((res.data.users || []).filter((u) => u.role === 'student'));
                    }
                })
                .catch(() => setAllStudentsForLink([]));
        }
    }, [variant, loadTeacherCourseMap, loadParentChildrenMap]);

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
        setPendingParentLinks([]);
        const defaultRole = variantConfig.fixedRole || variantConfig.defaultRole;
        if (variant === 'parents') {
            const token = getAuthToken();
            if (token && !allStudentsForLink.length) {
                axios
                    .get(`${API_BASE_URL}/api/users`, {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { segment: 'people', limit: 500 },
                    })
                    .then((res) => {
                        if (res.data.success) {
                            setAllStudentsForLink((res.data.users || []).filter((u) => u.role === 'student'));
                        }
                    })
                    .catch(() => setAllStudentsForLink([]));
            }
        }
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
            releaseToTeacherId: '',
        });
        setCoursesToReassign([]);
        setLinkStudentPick('');
        setParentLinksInModal([]);
        setShowPassword(false);
        setShowConfirmPassword(false);
        setShowUserModal(true);
    };

    const openEditModal = async (user) => {
        if (!user) return;
        
        setEditingUser(user);
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
        }
        if (variant === 'parents' && user.role === 'parent' && token) {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/users/${user._id}/child-links`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.success) {
                    linksForModal = res.data.links || [];
                    if (!allStudentsForLink.length && res.data.students) {
                        setAllStudentsForLink(res.data.students);
                    }
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
            status: USER_STATUS_OPTIONS.includes(user.status) ? user.status : (user.isActive !== false ? 'active' : 'inactive'),
            mustChangePassword: !!user.mustChangePassword,
            assignedCourseIds,
            releaseToTeacherId: '',
        });
        setParentLinksInModal(linksForModal);
        setCoursesToReassign([]);
        setLinkStudentPick('');
        setShowPassword(false);
        setShowConfirmPassword(false);
        setShowUserModal(true);
    };

    const openViewModal = (user) => {
        if (!user) return;
        setViewUser(user);
    };

    const openEnrollModal = async (student) => {
        setEnrollingStudent(student);
        setShowEnrollModal(true);
        // Fetch courses lazily when modal opens
        try {
            const token = getAuthToken();
            const response = await axios.get(`${API_BASE_URL}/api/courses`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.courses) {
                setCoursesForEnroll(response.data.courses);
            }
        } catch {
            setCoursesForEnroll([]);
        }
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

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
        
        // Password validation for new users
        if (!editingUser) {
            if (!formData.password) {
                showAlert('Password is required for new users', 'warning');
                return false;
            }
            if (formData.password.length < 6) {
                showAlert('Password must be at least 6 characters', 'warning');
                return false;
            }
            if (formData.password !== formData.confirmPassword) {
                showAlert('Passwords do not match', 'warning');
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
        setCoursesToReassign([]);
    };

    const saveTeacherAssignedCourses = async (teacherId, token) => {
        if (variant !== 'teachers') return;
        try {
            await axios.put(
                `${API_BASE_URL}/api/users/${teacherId}/assigned-courses`,
                {
                    courseIds: formData.assignedCourseIds || [],
                    releaseToTeacherId: formData.releaseToTeacherId || undefined,
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await loadTeacherCourseMap(token);
        } catch (error) {
            const data = error.response?.data;
            if (data?.coursesToReassign?.length) {
                setCoursesToReassign(data.coursesToReassign);
                showAlert(data.error || 'Choose another teacher for removed courses', 'warning');
                throw error;
            }
            throw error;
        }
    };

    const addParentChildLink = async () => {
        if (!linkStudentPick) return;
        const student = allStudentsForLink.find((s) => String(s._id) === String(linkStudentPick));
        if (!student) return;

        if (!editingUser) {
            if (pendingParentLinks.some((l) => String(l.studentId) === String(linkStudentPick))) {
                showAlert('Child already added', 'warning');
                return;
            }
            setPendingParentLinks((prev) => [
                ...prev,
                { studentId: linkStudentPick, student: { name: student.name, studentId: student.studentId } },
            ]);
            setLinkStudentPick('');
            return;
        }

        const parentId = editingUser._id;
        const token = getAuthToken();
        try {
            const res = await axios.post(
                `${API_BASE_URL}/api/users/${parentId}/child-links`,
                { studentId: linkStudentPick },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data.success) {
                setParentLinksInModal((prev) => [...prev, res.data.link]);
                setLinkStudentPick('');
                await loadParentChildrenMap(token);
                showAlert('Child linked', 'success');
            }
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to link child', 'error');
        }
    };

    const removePendingParentLink = (studentId) => {
        setPendingParentLinks((prev) => prev.filter((l) => String(l.studentId) !== String(studentId)));
    };

    const removeParentChildLink = async (linkId) => {
        const parentId = editingUser?._id;
        if (!parentId) return;
        const token = getAuthToken();
        try {
            await axios.delete(`${API_BASE_URL}/api/users/${parentId}/child-links/${linkId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setParentLinksInModal((prev) => prev.filter((l) => String(l._id) !== String(linkId)));
            await loadParentChildrenMap(token);
            showAlert('Link removed', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to remove link', 'error');
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        if (isSubmitting) return;
        if (!validateForm()) return;
        if (variant === 'teachers' && coursesToReassign.length && !formData.releaseToTeacherId) {
            showAlert('Select a teacher to take over courses you removed from this teacher', 'warning');
            return;
        }
        
        setIsSubmitting(true);
        const token = getAuthToken();
        
        try {
            const payload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                role: variantConfig.fixedRole || formData.role,
                phone: formData.phone.trim(),
                status: formData.status,
                isActive: formData.status === 'active',
                personalEmail: (formData.personalEmail || '').trim(),
            };
            
            if (!editingUser) {
                // Create new user
                payload.password = formData.password;
                payload.mustChangePassword = formData.mustChangePassword;
                
                const response = await axios.post(
                    `${API_BASE_URL}/api/users`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
                showAlert('User created successfully!', 'success');
                const created = response.data.user;
                setUsers(prev => [created, ...prev]);
                if (variant === 'teachers' && created.role === 'teacher' && (formData.assignedCourseIds || []).length) {
                    await saveTeacherAssignedCourses(created._id, token);
                }
                if (variant === 'parents' && created.role === 'parent' && pendingParentLinks.length) {
                    for (const link of pendingParentLinks) {
                        await axios.post(
                            `${API_BASE_URL}/api/users/${created._id}/child-links`,
                            { studentId: link.studentId },
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                    }
                    await loadParentChildrenMap(token);
                    setPendingParentLinks([]);
                }
            } else {
                // Update existing user
                const response = await axios.put(
                    `${API_BASE_URL}/api/users/${editingUser._id}`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
                showAlert('User updated successfully!', 'success');
                
                // Update in list
                setUsers(prev => prev.map(user => 
                    user._id === editingUser._id ? response.data.user : user
                ));
                
                // Update password separately if changed
                if (formData.password && formData.password === formData.confirmPassword) {
                    await axios.patch(
                        `${API_BASE_URL}/api/users/${editingUser._id}/password`,
                        { password: formData.password },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    showAlert('Password updated successfully!', 'success');
                }

                if (variant === 'teachers' && editingUser.role === 'teacher') {
                    await saveTeacherAssignedCourses(editingUser._id, token);
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

    const updateUserStatus = async (userId, currentStatus) => {
        const user = users.find(u => u._id === userId);
        if (user && isRowActionsLocked(user)) return;
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        
        const confirmed = await showConfirm({
            title: 'Change User Status?',
            message: `Change "${user?.name || 'this user'}" from ${currentStatus} to ${newStatus}?`,
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
            setUsers(prev => prev.map(user => 
                user._id === userId 
                    ? { ...user, status: newStatus, isActive: newStatus === 'active' }
                    : user
            ));
            
            showAlert(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`, 'success');
        } catch (error) {
            console.error('Error updating user status:', error);
            showAlert('Failed to update user status', 'error');
        }
    };

    const deleteUser = async (userId) => {
        const user = users.find(u => u._id === userId);
        if (user && isRowActionsLocked(user)) return;

        const confirmed = await showConfirm({
            title: 'Move to trash?',
            message: `Move "${user?.name || 'this user'}" to trash? They will lose portal and login access. Restore from the Trash tab.`,
            confirmLabel: 'Move to trash',
        });
        if (!confirmed) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            await fetchUsers();
            setSelectedUsers(prev => prev.filter(id => id !== userId));
            
            showAlert('User moved to trash.', 'success');
        } catch (error) {
            console.error('Error moving user to trash:', error);
            showAlert(error.response?.data?.error || 'Failed to move user to trash', 'error');
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
            await fetchUsers();
            showAlert('User restored.', 'success');
        } catch (error) {
            showAlert(error.response?.data?.error || 'Failed to restore user', 'error');
        } finally {
            setTrashBusy(false);
        }
    };

    const permanentDeleteUser = async (userId) => {
        if (listTab !== 'trash' || trashBusy) return;
        const confirmed = await showConfirm({
            title: 'Delete permanently?',
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
            await fetchUsers();
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
            title: 'Move to trash?',
            message: `Move ${selectedUsers.length} selected user(s) to trash? They will lose portal and login access.`,
            confirmLabel: 'Move to trash',
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
            await fetchUsers();
            setSelectedUsers([]);
            
            showAlert(response.data.message || `${selectedUsers.length} user(s) moved to trash.`, 'success');
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
            await fetchUsers();
            showAlert(`${selectedUsers.length} user(s) set to ${status} successfully!`, 'success');
        } catch (error) {
            console.error('Error updating selected users status:', error);
            showAlert('Failed to update status', 'error');
        }
    };

    const filteredUsers = users.filter(user => {
        const matchesSearch = 
            user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.personalEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.phone?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesRole = filterRole === 'all' || user.role === filterRole;
        
        return matchesSearch && matchesRole;
    });

    const sortedUsers = [...filteredUsers].sort((a, b) => {
        const mult = sortOrder === 'asc' ? 1 : -1;
        const getVal = (u, key) => {
            if (key === 'user') return (u.name || '').toLowerCase();
            if (key === 'role') return (u.role || '').toLowerCase();
            if (key === 'status') return (u.status || '').toLowerCase();
            if (key === 'phone') return (u.phone || '').toLowerCase();
            if (key === 'email') return (u.email || '').toLowerCase();
            if (key === 'personalEmail') return (u.personalEmail || '').toLowerCase();
            if (key === 'joined') return new Date(u.joinDate || 0).getTime();
            if (key === 'lastLogin') return new Date(u.lastLogin || 0).getTime();
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
            return 0;
        };
        const va = getVal(a, sortBy);
        const vb = getVal(b, sortBy);
        if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
        return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });

    const downloadUsersCsv = () => {
        const rows = (users || []).map((u) => ({
            studentId: u.role === 'student' ? (u.studentId || '') : '',
            name: u.name || '',
            portalEmail: u.email || '',
            personalEmail: u.personalEmail || '',
            role: u.role || '',
            phone: u.phone || '',
            status: u.status || (u.isActive !== false ? 'active' : 'inactive'),
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
    };

    const selectableFilteredUsers = sortedUsers.filter((u) => !isRowActionsLocked(u));

    const toggleAllUsers = () => {
        if (selectedUsers.length === selectableFilteredUsers.length && selectableFilteredUsers.length > 0) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(selectableFilteredUsers.map(user => user._id));
        }
    };

    if (loading) {
        return (
            <div className="users-management loading">
                <div className="loading-spinner">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Loading users...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="users-management">
            {/* Enroll Student Modal */}
            {showEnrollModal && enrollingStudent && (
                <EnrollStudentModal
                    isOpen={showEnrollModal}
                    onClose={() => { setShowEnrollModal(false); setEnrollingStudent(null); }}
                    onEnrollSuccess={() => { setShowEnrollModal(false); setEnrollingStudent(null); fetchUsers(); }}
                    courses={coursesForEnroll}
                    preselectedStudent={enrollingStudent}
                />
            )}

            {/* User Form Modal */}
            {showUserModal && (
                <div className="user-modal-overlay">
                    <div className="user-modal">
                        <div className="user-modal-header">
                            <h2>
                                <i className={`fas ${editingUser ? 'fa-edit' : 'fa-user-plus'}`}></i>
                                {editingUser
                                    ? `Edit ${variantConfig.pageTitle.replace(/s$/, '')}`
                                    : variantConfig.addLabel}
                            </h2>
                            <button 
                                className="modal-close-btn"
                                onClick={() => {
                                    setShowUserModal(false);
                                    setEditingUser(null);
                                }}
                                disabled={isSubmitting}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <form onSubmit={handleFormSubmit} className="user-form">
                            <div className="form-scroll-container">
                                <div className="form-grid">
                                    {/* Basic Information */}
                                    <div className="form-section">
                                        <h3><i className="fas fa-info-circle"></i> Basic Information</h3>
                                        
                                        <div className="form-group">
                                            <label>Full Name *</label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleFormChange}
                                                placeholder="Enter full name"
                                                required
                                                disabled={isSubmitting}
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>Email Address *</label>
                                            {!editingUser ? (
                                                <div
                                                    className={`email-input-group ${
                                                        isSubmitting ? 'is-disabled' : ''
                                                    }`}
                                                >
                                                    <input
                                                        type="text"
                                                        name="emailLocal"
                                                        className="email-input-group__local"
                                                        value={sanitizePortalEmailLocal(formData.email)}
                                                        onChange={(e) => {
                                                            const local = sanitizePortalEmailLocal(e.target.value);
                                                            handleFormChange({
                                                                target: {
                                                                    name: 'email',
                                                                    value: local ? `${local}${GORYTHM_EMAIL_DOMAIN}` : '',
                                                                },
                                                            });
                                                        }}
                                                        placeholder="id"
                                                        required
                                                        disabled={isSubmitting}
                                                        autoComplete="off"
                                                        spellCheck={false}
                                                        aria-label="Portal email ID"
                                                    />
                                                    <span
                                                        className="email-input-group__suffix"
                                                        aria-hidden="true"
                                                    >
                                                        {GORYTHM_EMAIL_DOMAIN}
                                                    </span>
                                                </div>
                                            ) : (
                                                <input
                                                    type="email"
                                                    name="email"
                                                    value={formData.email}
                                                    placeholder="user@example.com"
                                                    disabled
                                                    readOnly
                                                />
                                            )}
                                            {editingUser ? (
                                                <small className="form-hint">
                                                    Email cannot be changed for existing users
                                                </small>
                                            ) : (
                                                <small className="form-hint">
                                                    Only enter the ID — <strong>@gorythmacademy.com</strong> is added automatically.
                                                </small>
                                            )}
                                        </div>

                                        <div className="form-group">
                                            <label>Personal email (optional)</label>
                                            <input
                                                type="email"
                                                name="personalEmail"
                                                value={formData.personalEmail}
                                                onChange={handleFormChange}
                                                placeholder="Gmail, Hotmail, etc. (not portal login)"
                                                pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}"
                                                title="Use a valid lowercase email format, e.g. name@gmail.com"
                                                disabled={isSubmitting}
                                            />
                                            <small className="form-hint">
                                                Separate from portal login above; for contact only.
                                            </small>
                                        </div>

                                        <div className="form-group">
                                            <label>Phone Number</label>
                                            <input
                                                type="tel"
                                                name="phone"
                                                value={formData.phone}
                                                onChange={handleFormChange}
                                                placeholder="+1 (123) 456-7890"
                                                disabled={isSubmitting}
                                            />
                                        </div>
                                    </div>

                                    {/* Role & Status */}
                                    <div className="form-section">
                                        <h3><i className="fas fa-user-tag"></i> Role & Status</h3>
                                        
                                        <div className="form-group">
                                            <label>User Role *</label>
                                            <div className="role-options">
                                                {roleOptions.map(role => (
                                                    <label key={role.value} className="role-option">
                                                        <input
                                                            type="radio"
                                                            name="role"
                                                            value={role.value}
                                                            checked={formData.role === role.value}
                                                            onChange={handleFormChange}
                                                            disabled={isSubmitting}
                                                        />
                                                        <div className="role-card">
                                                            <i className={`fas ${role.icon}`}></i>
                                                            <span>{role.label}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Status</label>
                                            <select
                                                name="status"
                                                value={formData.status}
                                                onChange={handleFormChange}
                                                disabled={isSubmitting}
                                            >
                                                <option value="active">Active</option>
                                                <option value="pending">Pending</option>
                                                <option value="inactive">Inactive</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                            <small className="form-hint">
                                                Only <strong>active</strong> accounts can log in. Pending, inactive, and completed are login-disabled.
                                            </small>
                                        </div>
                                        {!editingUser && (
                                            <div className="form-group">
                                                <label className="checkbox-label">
                                                    <input
                                                        type="checkbox"
                                                        name="mustChangePassword"
                                                        checked={formData.mustChangePassword}
                                                        onChange={handleFormChange}
                                                        disabled={isSubmitting}
                                                    />
                                                    <span className="checkmark"></span>
                                                    Force password reset on first login
                                                </label>
                                            </div>
                                        )}
                                    </div>

                                    {/* Password Section */}
                                    <div className="form-section">
                                        <h3><i className="fas fa-lock"></i> {editingUser ? 'Change Password' : 'Set Password'}</h3>
                                        
                                        <div className="form-group">
                                            <label>Password {!editingUser && '*'}</label>
                                            <div className={`password-field ${isSubmitting ? 'is-disabled' : ''}`}>
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    name="password"
                                                    value={formData.password}
                                                    onChange={handleFormChange}
                                                    placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
                                                    disabled={isSubmitting}
                                                    autoComplete="new-password"
                                                />
                                                <button
                                                    type="button"
                                                    className="password-field__toggle"
                                                    onClick={() => setShowPassword((v) => !v)}
                                                    disabled={isSubmitting}
                                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                    aria-pressed={showPassword}
                                                    title={showPassword ? 'Hide password' : 'Show password'}
                                                    tabIndex={-1}
                                                >
                                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                </button>
                                            </div>
                                            <small className="form-hint">
                                                {editingUser 
                                                    ? "Enter new password only if you want to change it"
                                                    : "Minimum 6 characters"}
                                            </small>
                                        </div>

                                        {(formData.password || !editingUser) && (
                                            <div className="form-group">
                                                <label>Confirm Password {!editingUser && '*'}</label>
                                                <div className={`password-field ${isSubmitting ? 'is-disabled' : ''}`}>
                                                    <input
                                                        type={showConfirmPassword ? 'text' : 'password'}
                                                        name="confirmPassword"
                                                        value={formData.confirmPassword}
                                                        onChange={handleFormChange}
                                                        placeholder="Confirm password"
                                                        disabled={isSubmitting}
                                                        autoComplete="new-password"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="password-field__toggle"
                                                        onClick={() => setShowConfirmPassword((v) => !v)}
                                                        disabled={isSubmitting}
                                                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                                        aria-pressed={showConfirmPassword}
                                                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                                                        tabIndex={-1}
                                                    >
                                                        <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {variant === 'teachers' && (
                                        <div className="form-section">
                                            <h3><i className="fas fa-book"></i> Assigned courses</h3>
                                            <p className="form-hint">Synced with the Courses tab (instructor field).</p>
                                            <div className="course-assign-list">
                                                {allCourses.length === 0 ? (
                                                    <p className="form-hint-muted">No courses loaded.</p>
                                                ) : (
                                                    allCourses.map((c) => (
                                                        <label key={c._id} className="checkbox-label course-assign-item">
                                                            <input
                                                                type="checkbox"
                                                                checked={(formData.assignedCourseIds || []).includes(String(c._id))}
                                                                onChange={() => toggleAssignedCourse(c._id)}
                                                                disabled={isSubmitting}
                                                            />
                                                            <span>{c.title}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                            {coursesToReassign.length > 0 && (
                                                <div className="form-group">
                                                    <label>Reassign removed courses to</label>
                                                    <select
                                                        name="releaseToTeacherId"
                                                        value={formData.releaseToTeacherId}
                                                        onChange={handleFormChange}
                                                        disabled={isSubmitting}
                                                    >
                                                        <option value="">Select teacher</option>
                                                        {users
                                                            .filter((u) => u.role === 'teacher' && u._id !== editingUser?._id)
                                                            .map((t) => (
                                                                <option key={t._id} value={t._id}>
                                                                    {t.name}
                                                                </option>
                                                            ))}
                                                    </select>
                                                    <small className="form-hint">
                                                        Required for: {coursesToReassign.map((c) => c.title).join(', ')}
                                                    </small>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {variant === 'parents' && (
                                        <div className="form-section">
                                            <h3><i className="fas fa-child"></i> Linked children</h3>
                                            <p className="form-hint">
                                                Synced with the LMS Parent links tab. Add children here when creating or
                                                editing a parent.
                                            </p>
                                            <ul className="parent-children-list">
                                                {(editingUser ? parentLinksInModal : pendingParentLinks).length === 0 ? (
                                                    <li className="form-hint-muted">No children linked yet.</li>
                                                ) : editingUser ? (
                                                    parentLinksInModal.map((link) => (
                                                        <li key={link._id}>
                                                            <span>
                                                                {link.student?.name || 'Student'}{' '}
                                                                {link.student?.studentId
                                                                    ? `(${link.student.studentId})`
                                                                    : ''}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn-link-danger"
                                                                onClick={() => removeParentChildLink(link._id)}
                                                                disabled={isSubmitting}
                                                            >
                                                                Remove
                                                            </button>
                                                        </li>
                                                    ))
                                                ) : (
                                                    pendingParentLinks.map((link) => (
                                                        <li key={link.studentId}>
                                                            <span>
                                                                {link.student?.name || 'Student'}{' '}
                                                                {link.student?.studentId
                                                                    ? `(${link.student.studentId})`
                                                                    : ''}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn-link-danger"
                                                                onClick={() => removePendingParentLink(link.studentId)}
                                                                disabled={isSubmitting}
                                                            >
                                                                Remove
                                                            </button>
                                                        </li>
                                                    ))
                                                )}
                                            </ul>
                                            <div className="form-group parent-link-add">
                                                <select
                                                    value={linkStudentPick}
                                                    onChange={(e) => setLinkStudentPick(e.target.value)}
                                                    disabled={isSubmitting}
                                                >
                                                    <option value="">Add child…</option>
                                                    {allStudentsForLink
                                                        .filter((s) => {
                                                            if (editingUser) {
                                                                return !parentLinksInModal.some(
                                                                    (l) =>
                                                                        String(l.student?._id || l.student) ===
                                                                        String(s._id)
                                                                );
                                                            }
                                                            return !pendingParentLinks.some(
                                                                (l) => String(l.studentId) === String(s._id)
                                                            );
                                                        })
                                                        .map((s) => (
                                                            <option key={s._id} value={s._id}>
                                                                {s.name} {s.studentId ? `(${s.studentId})` : ''}
                                                            </option>
                                                        ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    onClick={addParentChildLink}
                                                    disabled={!linkStudentPick || isSubmitting}
                                                >
                                                    Link child
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="form-actions">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                        setShowUserModal(false);
                                        setEditingUser(null);
                                    }}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin"></i> 
                                            {editingUser ? 'Saving...' : 'Creating...'}
                                        </>
                                    ) : (
                                        <>
                                            <i className={`fas ${editingUser ? 'fa-save' : 'fa-check'}`}></i>
                                            {editingUser ? 'Save Changes' : 'Create User'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="page-header">
                <div className="header-left">
                    <h1>
                        <i className={`fas ${isLearnerTab ? variantConfig.icon : 'fa-users-cog'}`}></i>{' '}
                        {variantConfig.pageTitle}
                    </h1>
                    <p>
                        {variant === 'students' || variant === 'people' ? (
                            <>Student portal accounts. Course enrollments and fee status are in <strong>Students data</strong>.</>
                        ) : variant === 'teachers' ? (
                            <>Teachers assigned as course instructors in the Courses tab.</>
                        ) : variant === 'parents' ? (
                            <>Parent/guardian accounts (link children in LMS tab).</>
                        ) : (
                            <>Managers, super-admins, and accountants. Learners are under <strong>Students</strong>, <strong>Teachers</strong>, and <strong>Parents</strong>.</>
                        )}
                    </p>
                </div>
                <div className="header-right">
                    {showAddButton && listTab === 'active' && (
                        <button className="btn-primary" onClick={openCreateModal}>
                            <i className="fas fa-user-plus"></i>{' '}
                            {isLearnerTab ? variantConfig.addLabel : 'Add staff user'}
                        </button>
                    )}
                </div>
            </div>

            <div className="students-list-tabs users-list-tabs">
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('active');
                        setSelectedUsers([]);
                    }}
                >
                    <i className="fas fa-list" /> Active
                </button>
                <button
                    type="button"
                    className={`students-list-tab ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => {
                        setListTab('trash');
                        setSelectedUsers([]);
                    }}
                >
                    <i className="fas fa-trash-alt" /> Trash
                    {trashCount > 0 ? ` (${trashCount})` : ''}
                </button>
            </div>

            {/* Bulk Actions Bar */}
            {selectedUsers.length > 0 && (
                <div className="bulk-actions-bar">
                    <div className="selected-count">
                        <i className="fas fa-check-circle"></i>
                        {selectedUsers.length} user(s) selected
                    </div>
                    <div className="bulk-buttons">
                        {listTab === 'active' ? (
                            <>
                                <button 
                                    className="bulk-btn" 
                                    onClick={() => updateSelectedStatus('active')}
                                >
                                    <i className="fas fa-check"></i> Activate All
                                </button>
                                <button 
                                    className="bulk-btn" 
                                    onClick={() => updateSelectedStatus('inactive')}
                                >
                                    <i className="fas fa-ban"></i> Deactivate All
                                </button>
                                <button 
                                    className="bulk-btn delete" 
                                    onClick={deleteSelectedUsers}
                                >
                                    <i className="fas fa-trash"></i> Move to trash
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    className="bulk-btn"
                                    disabled={trashBusy}
                                    onClick={async () => {
                                        for (const id of selectedUsers) {
                                            await restoreUser(id);
                                        }
                                        setSelectedUsers([]);
                                    }}
                                >
                                    <i className="fas fa-undo"></i> Restore selected
                                </button>
                                <button
                                    className="bulk-btn delete"
                                    disabled={trashBusy}
                                    onClick={async () => {
                                        const confirmed = await showConfirm({
                                            title: 'Delete permanently?',
                                            message: `Permanently delete ${selectedUsers.length} user(s)? This cannot be undone.`,
                                            confirmLabel: 'Delete forever',
                                        });
                                        if (!confirmed) return;
                                        for (const id of selectedUsers) {
                                            await permanentDeleteUser(id);
                                        }
                                        setSelectedUsers([]);
                                    }}
                                >
                                    <i className="fas fa-trash-alt"></i> Delete permanently
                                </button>
                            </>
                        )}
                        <button 
                            className="bulk-btn cancel" 
                            onClick={() => setSelectedUsers([])}
                        >
                            <i className="fas fa-times"></i> Clear Selection
                        </button>
                    </div>
                </div>
            )}

            {/* Search and Filter */}
            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder={
                            isLearnerTab
                                ? 'Search learners by name, email or phone...'
                                : 'Search users by name, email or phone...'
                        }
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && fetchUsers()}
                    />
                    <button 
                        className="search-btn"
                        onClick={fetchUsers}
                    >
                        <i className="fas fa-search"></i>
                    </button>
                </div>
                
                <div className="filter-controls">
                    <select 
                        className="role-filter"
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                    >
                        {variant === 'students' || variant === 'people' ? (
                            <>
                                <option value="all">All students</option>
                                <option value="student">Students</option>
                            </>
                        ) : variant === 'teachers' ? (
                            <>
                                <option value="all">All teachers</option>
                                <option value="teacher">Teachers</option>
                            </>
                        ) : variant === 'parents' ? (
                            <>
                                <option value="all">All parents</option>
                                <option value="parent">Parents</option>
                            </>
                        ) : (
                            <>
                                <option value="all">All staff roles</option>
                                <option value="super-admin">Super Admin</option>
                                <option value="manager">Manager</option>
                                <option value="accountant">Accountant</option>
                            </>
                        )}
                    </select>
                    
                    <button className="refresh-btn" onClick={fetchUsers}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                    <button className="btn-secondary download-btn" onClick={downloadUsersCsv}>
                        <i className="fas fa-file-export"></i> Download Excel
                    </button>
                </div>
            </div>

            {/* Users Table */}
            <div
                ref={tableContainerRef}
                className={`users-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table className="users-table">
                    <colgroup>
                        {tableColumnKeys.map((key, idx) => (
                            <col key={key} style={{ width: `${columnWidths[idx]}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            {tableColumnKeys.map((colKey, idx) => {
                                if (colKey === 'checkbox') {
                                    return (
                                        <th key={colKey} className="checkbox-cell">
                                            <input
                                                type="checkbox"
                                                checked={
                                                    selectableFilteredUsers.length > 0 &&
                                                    selectedUsers.length === selectableFilteredUsers.length
                                                }
                                                onChange={toggleAllUsers}
                                            />
                                            <span
                                                className="col-resizer"
                                                onPointerDown={(e) => startColumnResize(e, idx)}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resetColumnWidth(idx);
                                                }}
                                            />
                                        </th>
                                    );
                                }
                                if (colKey === 'actions') {
                                    return (
                                        <th key={colKey}>
                                            {COLUMN_LABELS.actions}
                                            <span
                                                className="col-resizer"
                                                onPointerDown={(e) => startColumnResize(e, idx)}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    resetColumnWidth(idx);
                                                }}
                                            />
                                        </th>
                                    );
                                }
                                const sortable = colKey !== 'assignedCourses' && colKey !== 'children';
                                return (
                                    <th
                                        key={colKey}
                                        className={sortable ? 'sortable' : ''}
                                        onClick={sortable ? () => handleSort(colKey) : undefined}
                                    >
                                        {COLUMN_LABELS[colKey]}
                                        {sortable ? (
                                            sortBy === colKey ? (
                                                <i
                                                    className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}
                                                ></i>
                                            ) : (
                                                <i className="fas fa-sort"></i>
                                            )
                                        ) : null}
                                        <span
                                            className="col-resizer"
                                            onPointerDown={(e) => startColumnResize(e, idx)}
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                resetColumnWidth(idx);
                                            }}
                                        />
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map((user) => (
                            <tr key={user._id} className={selectedUsers.includes(user._id) ? 'selected' : ''}>
                                {tableColumnKeys.map((colKey) => {
                                    if (colKey === 'checkbox') {
                                        return (
                                            <td key={colKey} className="checkbox-cell">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUsers.includes(user._id)}
                                                    onChange={() => toggleUserSelection(user._id)}
                                                    disabled={isRowActionsLocked(user)}
                                                />
                                            </td>
                                        );
                                    }
                                    if (colKey === 'user') {
                                        return (
                                            <td key={colKey}>
                                                <div className="user-info">
                                                    <div className="user-avatar">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="user-details">
                                                        <strong>{user.name}</strong>
                                                        {user.role === 'student' && user.studentId && (
                                                            <span className="student-id-tag">
                                                                <i className="fas fa-id-card"></i> {user.studentId}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'role') {
                                        return (
                                            <td key={colKey}>
                                                <span className={`role-badge ${user.role}`}>
                                                    <i
                                                        className={`fas fa-${
                                                            user.role === 'super-admin'
                                                                ? 'user-shield'
                                                                : user.role === 'manager'
                                                                  ? 'user-cog'
                                                                  : user.role === 'teacher'
                                                                    ? 'chalkboard-teacher'
                                                                    : user.role === 'accountant'
                                                                      ? 'calculator'
                                                                      : user.role === 'parent'
                                                                        ? 'people-roof'
                                                                        : 'user-graduate'
                                                        }`}
                                                    ></i>
                                                    {displayRoleLabel(user.role)}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'status') {
                                        return (
                                            <td key={colKey}>
                                                <span className={`status-badge ${user.status}`}>
                                                    <i
                                                        className={`fas fa-${
                                                            user.status === 'active'
                                                                ? 'check-circle'
                                                                : user.status === 'pending'
                                                                  ? 'clock'
                                                                  : user.status === 'completed'
                                                                    ? 'flag-checkered'
                                                                    : 'times-circle'
                                                        }`}
                                                    ></i>
                                                    {user.status}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'assignedCourses') {
                                        const courses = teacherCoursesById[String(user._id)] || [];
                                        return (
                                            <td key={colKey} className="cell-meta-col cell-meta-col--stacked">
                                                {courses.length ? (
                                                    <div className="meta-col-stack">
                                                        {courses.map((c) => (
                                                            <div key={c._id} className="meta-col-row">
                                                                <i className="fas fa-book" aria-hidden="true" />
                                                                <span>{c.title}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'children') {
                                        const links = parentChildrenById[String(user._id)] || [];
                                        return (
                                            <td key={colKey} className="cell-meta-col cell-meta-col--stacked">
                                                {links.length ? (
                                                    <div className="meta-col-stack">
                                                        {links.map((l) => (
                                                            <div key={l._id} className="meta-col-row">
                                                                <i className="fas fa-child" aria-hidden="true" />
                                                                <span>
                                                                    {l.student?.name || 'Student'}
                                                                    {l.student?.studentId
                                                                        ? ` (${l.student.studentId})`
                                                                        : ''}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'phone') {
                                        return (
                                            <td key={colKey}>
                                                <span className="phone-info">{user.phone || 'Not set'}</span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'email') {
                                        return (
                                            <td key={colKey} className="cell-email">
                                                <span className="email-cell" title={user.email}>
                                                    {user.email}
                                                </span>
                                            </td>
                                        );
                                    }
                                    if (colKey === 'personalEmail') {
                                        return (
                                            <td key={colKey} className="cell-email">
                                                {user.personalEmail ? (
                                                    <span
                                                        className="email-cell personal-email-cell"
                                                        title={user.personalEmail}
                                                    >
                                                        <i className="fas fa-envelope-open-text" aria-hidden="true"></i>{' '}
                                                        {user.personalEmail}
                                                    </span>
                                                ) : (
                                                    <span className="empty-cell">—</span>
                                                )}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'joined') {
                                        return (
                                            <td key={colKey}>
                                                {user.joinDate
                                                    ? new Date(user.joinDate).toLocaleDateString()
                                                    : 'N/A'}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'lastLogin') {
                                        return (
                                            <td key={colKey}>
                                                {user.lastLogin
                                                    ? new Date(user.lastLogin).toLocaleString(undefined, {
                                                          dateStyle: 'short',
                                                          timeStyle: 'short',
                                                      })
                                                    : 'Never'}
                                            </td>
                                        );
                                    }
                                    if (colKey === 'actions') {
                                        return (
                                            <td key={colKey} className="cell-actions">
                                    <div className="action-buttons">
                                        {isRowActionsLocked(user) ? (
                                            <button
                                                type="button"
                                                className="action-btn view-btn"
                                                title="View details (read-only)"
                                                onClick={() => openViewModal(user)}
                                            >
                                                <i className="fas fa-eye"></i>
                                            </button>
                                        ) : listTab === 'trash' ? (
                                            <>
                                                <button
                                                    className="action-btn status-btn"
                                                    title="Restore user"
                                                    disabled={trashBusy}
                                                    onClick={() => restoreUser(user._id)}
                                                >
                                                    <i className="fas fa-undo"></i>
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title="Delete permanently"
                                                    disabled={trashBusy}
                                                    onClick={() => permanentDeleteUser(user._id)}
                                                >
                                                    <i className="fas fa-trash-alt"></i>
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                    className="action-btn edit-btn"
                                                    title="Edit User"
                                                    onClick={() => openEditModal(user)}
                                                >
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                {variantConfig.showEnroll && user.role === 'student' && user.isActive !== false && (
                                                    <button
                                                        className="action-btn enroll-btn"
                                                        title="Enroll in Course"
                                                        onClick={() => openEnrollModal(user)}
                                                    >
                                                        <i className="fas fa-user-graduate"></i>
                                                    </button>
                                                )}
                                                <button 
                                                    className={`action-btn status-btn ${user.status}`}
                                                    title={user.status === 'active' ? 'Deactivate User' : 'Activate User'}
                                                    onClick={() => updateUserStatus(user._id, user.status)}
                                                >
                                                    <i className={`fas fa-${user.status === 'active' ? 'ban' : 'check'}`}></i>
                                                </button>
                                                <button 
                                                    className="action-btn delete-btn"
                                                    title="Move to trash"
                                                    onClick={() => deleteUser(user._id)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                            </td>
                                        );
                                    }
                                    return null;
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {sortedUsers.length === 0 && (() => {
                    const hasAnyUsers = users.length > 0;
                    const emptyTitle = hasAnyUsers
                        ? 'No matching records'
                        : isLearnerTab
                          ? 'No learners yet'
                          : 'No staff accounts yet';
                    const emptySubtitle = hasAnyUsers
                        ? 'Try a different search term or filter to find who you’re looking for.'
                        : isLearnerTab
                          ? 'Add your first student, teacher, or parent to get started.'
                          : 'Invite your first admin or accountant to start managing the platform.';
                    return (
                        <div className="no-results">
                            <div className="no-results__icon" aria-hidden="true">
                                <i className={`fas ${hasAnyUsers ? 'fa-magnifying-glass' : 'fa-user-slash'}`}></i>
                            </div>
                            <h3>{emptyTitle}</h3>
                            <p>{emptySubtitle}</p>
                            {showAddButton && !hasAnyUsers && (
                                <button
                                    type="button"
                                    className="btn-primary empty-state-cta"
                                    onClick={openCreateModal}
                                >
                                    <span className="empty-state-cta__icon" aria-hidden="true">
                                        <i className="fas fa-user-plus"></i>
                                    </span>
                                    <span className="empty-state-cta__label">
                                        {isLearnerTab ? variantConfig.addLabel : 'Add your first staff user'}
                                    </span>
                                    <span className="empty-state-cta__arrow" aria-hidden="true">
                                        <i className="fas fa-arrow-right"></i>
                                    </span>
                                </button>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Stats Summary */}
            <div className="stats-summary">
                {variantConfig.showEnroll ? (
                    <>
                        <div className="stat-card">
                            <div className="stat-icon total">
                                <i className="fas fa-users"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.length}</h3>
                                <p>Total learners</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-user-graduate"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.filter(u => u.role === 'student').length}</h3>
                                <p>Students</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-chalkboard-teacher"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.filter(u => u.role === 'teacher').length}</h3>
                                <p>Teachers</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon active">
                                <i className="fas fa-people-roof"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.filter(u => u.role === 'parent').length}</h3>
                                <p>Parents</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="stat-card">
                            <div className="stat-icon total">
                                <i className="fas fa-users"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.length}</h3>
                                <p>Staff accounts</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon admin">
                                <i className="fas fa-user-shield"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.filter(u => u.role === 'super-admin').length}</h3>
                                <p>Super admins</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon admin">
                                <i className="fas fa-user-cog"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.filter((u) => u.role === 'manager').length}</h3>
                                <p>Admins</p>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon teachers">
                                <i className="fas fa-calculator"></i>
                            </div>
                            <div className="stat-details">
                                <h3>{users.filter(u => u.role === 'accountant').length}</h3>
                                <p>Accountants</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {viewUser && (
                <div className="user-modal-overlay" role="dialog" aria-modal="true">
                    <div className="user-modal user-view-modal">
                        <div className="user-modal-header">
                            <h2><i className="fas fa-eye"></i> Account details</h2>
                            <button type="button" className="modal-close-btn" onClick={() => setViewUser(null)}>
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="form-scroll-container">
                            <dl className="user-details-readonly">
                                <dt>Name</dt><dd>{viewUser.name}</dd>
                                <dt>Email</dt><dd>{viewUser.email}</dd>
                                {viewUser.role === 'student' && (
                                    <>
                                        <dt>Personal email</dt>
                                        <dd>{viewUser.personalEmail || '—'}</dd>
                                    </>
                                )}
                                <dt>Role</dt><dd>{viewUser.role}</dd>
                                <dt>Phone</dt><dd>{viewUser.phone || '—'}</dd>
                                <dt>Status</dt><dd>{viewUser.status}</dd>
                                <dt>Joined</dt><dd>{viewUser.joinDate ? new Date(viewUser.joinDate).toLocaleString() : '—'}</dd>
                                <dt>Last login</dt><dd>{viewUser.lastLogin ? new Date(viewUser.lastLogin).toLocaleString() : 'Never'}</dd>
                            </dl>
                        </div>
                        <div className="form-actions">
                            <button type="button" className="btn-primary" onClick={() => setViewUser(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersManagement;