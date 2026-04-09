import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { getAuthToken, getAuthUserJson } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import EnrollStudentModal from './EnrollStudentModal';
import './UsersManagement.scss';

const PEOPLE_ROLE_SLUGS = ['student', 'teacher', 'parent'];
const STAFF_ROLE_SLUGS = ['admin', 'super-admin', 'accountant'];

const PEOPLE_ROLE_OPTIONS = [
    { value: 'student', label: 'Student', icon: 'fa-user-graduate' },
    { value: 'teacher', label: 'Teacher/Instructor', icon: 'fa-chalkboard-teacher' },
    { value: 'parent', label: 'Parent/Guardian', icon: 'fa-people-roof' },
];

const COLUMN_DEFS = ['checkbox', 'user', 'role', 'status', 'phone', 'email', 'joined', 'lastLogin', 'actions'];
const DEFAULT_COLUMN_WIDTHS = [60, 220, 160, 140, 150, 250, 130, 180, 150];
const COLUMN_MIN_WIDTHS = [50, 140, 110, 100, 110, 140, 100, 120, 120];
const COLUMN_MAX_WIDTHS = [90, 360, 260, 240, 280, 420, 220, 320, 260];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const UsersManagement = ({ variant = 'staff' }) => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [selectedUsers, setSelectedUsers] = useState([]);
    
    // Modal states
    const [showUserModal, setShowUserModal] = useState(false);
    const [viewUser, setViewUser] = useState(null);
    const [editingUser, setEditingUser] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Enroll modal state (People tab only)
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollingStudent, setEnrollingStudent] = useState(null);
    const [coursesForEnroll, setCoursesForEnroll] = useState([]);

    const tableContainerRef = useRef(null);
    const dragStateRef = useRef({
        isDragging: false,
        startX: 0,
        startScrollLeft: 0,
    });
    const [isTableDragging, setIsTableDragging] = useState(false);
    const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
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
        const minWidth = COLUMN_MIN_WIDTHS[colIndex] ?? 80;
        const maxWidth = COLUMN_MAX_WIDTHS[colIndex] ?? 600;
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
            next[colIndex] = DEFAULT_COLUMN_WIDTHS[colIndex];
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

    let currentUser = {};
    try {
        currentUser = JSON.parse(getAuthUserJson() || '{}');
    } catch {
        currentUser = {};
    }
    const isSuperAdmin = currentUser.role === 'super-admin';
    const isAdminViewer = currentUser.role === 'admin';

    const staffRoleOptions = useMemo(() => {
        const base = [
            { value: 'admin', label: 'Admin/Manager', icon: 'fa-user-cog' },
            { value: 'accountant', label: 'Accountant', icon: 'fa-calculator' },
        ];
        if (isSuperAdmin) {
            return [{ value: 'super-admin', label: 'Super Admin', icon: 'fa-user-shield' }, ...base];
        }
        return base;
    }, [isSuperAdmin]);

    const roleOptions = variant === 'people' ? PEOPLE_ROLE_OPTIONS : staffRoleOptions;

    const canCreatePeople = variant === 'people' && (isSuperAdmin || isAdminViewer);
    const canCreateStaff = variant === 'staff' && isSuperAdmin;
    const showAddButton = canCreatePeople || canCreateStaff;

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
        isActive: true,
        mustChangePassword: true
    });

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const token = getAuthToken();
            const segment = variant === 'people' ? 'people' : 'staff';

            const response = await axios.get(`${API_BASE_URL}/api/users`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { segment, limit: 500 },
            });

            if (response.data.success) {
                const raw = response.data.users || [];
                const allowed = variant === 'people' ? PEOPLE_ROLE_SLUGS : STAFF_ROLE_SLUGS;
                setUsers(raw.filter((u) => allowed.includes(u.role)));
            } else {
                alert('Failed to load users');
                setUsers([]);
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching users:', error);
            alert('Failed to load users. Check backend connection.');
            setUsers([]);
            setLoading(false);
        }
    }, [variant]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const openCreateModal = () => {
        setEditingUser(null);
        const defaultRole = variant === 'people' ? 'student' : 'admin';
        setFormData({
            name: '',
            email: '',
            personalEmail: '',
            password: '',
            confirmPassword: '',
            role: defaultRole,
            phone: '',
            isActive: true,
            mustChangePassword: true
        });
        setShowUserModal(true);
    };

    const openEditModal = (user) => {
        if (!user) return;
        
        setEditingUser(user);
        setFormData({
            name: user.name || '',
            email: user.email || '',
            personalEmail: user.personalEmail || '',
            password: '',
            confirmPassword: '',
            role: user.role || (variant === 'people' ? 'student' : 'admin'),
            phone: user.phone || '',
            isActive: user.isActive !== false,
            mustChangePassword: !!user.mustChangePassword
        });
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
        if (!formData.name.trim()) {
            alert('Name is required');
            return false;
        }
        
        if (!formData.email.trim()) {
            alert('Email is required');
            return false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            alert('Please enter a valid email address');
            return false;
        }

        if (formData.role === 'student' && formData.personalEmail?.trim()) {
            if (!emailRegex.test(formData.personalEmail.trim())) {
                alert('Please enter a valid personal email, or leave it blank');
                return false;
            }
        }
        
        // Password validation for new users
        if (!editingUser) {
            if (!formData.password) {
                alert('Password is required for new users');
                return false;
            }
            if (formData.password.length < 6) {
                alert('Password must be at least 6 characters');
                return false;
            }
            if (formData.password !== formData.confirmPassword) {
                alert('Passwords do not match');
                return false;
            }
        }
        
        return true;
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        if (isSubmitting) return;
        if (!validateForm()) return;
        
        setIsSubmitting(true);
        const token = getAuthToken();
        
        try {
            const payload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                role: formData.role,
                phone: formData.phone.trim(),
                isActive: formData.isActive
            };
            if (formData.role === 'student') {
                payload.personalEmail = (formData.personalEmail || '').trim();
            }
            
            if (!editingUser) {
                // Create new user
                payload.password = formData.password;
                payload.mustChangePassword = formData.mustChangePassword;
                
                const response = await axios.post(
                    `${API_BASE_URL}/api/users`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
                alert('User created successfully!');
                setUsers(prev => [response.data.user, ...prev]);
            } else {
                // Update existing user
                const response = await axios.put(
                    `${API_BASE_URL}/api/users/${editingUser._id}`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
                alert('User updated successfully!');
                
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
                    alert('Password updated successfully!');
                }
            }
            
            setShowUserModal(false);
            setEditingUser(null);
            
        } catch (error) {
            console.error('Error saving user:', error);
            const errorMessage = error.response?.data?.error || 'Failed to save user';
            alert(`Error: ${errorMessage}`);
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
        
        if (!window.confirm(`Change "${user?.name || 'this user'}" from ${currentStatus} to ${newStatus}?`)) {
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
            
            alert(`User ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`);
        } catch (error) {
            console.error('Error updating user status:', error);
            alert('Failed to update user status');
        }
    };

    const deleteUser = async (userId) => {
        const user = users.find(u => u._id === userId);
        if (user && isRowActionsLocked(user)) return;

        if (!window.confirm(`Are you sure you want to delete "${user?.name || 'this user'}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/api/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            // Remove from list
            setUsers(prev => prev.filter(user => user._id !== userId));
            setSelectedUsers(prev => prev.filter(id => id !== userId));
            
            alert('User deleted successfully!');
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Failed to delete user');
        }
    };

    const deleteSelectedUsers = async () => {
        if (!selectedUsers.length) {
            alert('Please select users to delete');
            return;
        }
        
        if (!window.confirm(`Are you sure you want to delete ${selectedUsers.length} selected user(s)? This action cannot be undone.`)) {
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
            
            alert(response.data.message || `${selectedUsers.length} user(s) deleted successfully!`);
        } catch (error) {
            console.error('Error deleting selected users:', error);
            alert('Failed to delete users');
        }
    };

    const updateSelectedStatus = async (status) => {
        if (!selectedUsers.length) {
            alert('Please select users to update');
            return;
        }

        if (!window.confirm(`Set ${selectedUsers.length} selected user(s) to ${status}?`)) {
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
            alert(`${selectedUsers.length} user(s) set to ${status} successfully!`);
        } catch (error) {
            console.error('Error updating selected users status:', error);
            alert('Failed to update status');
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
            if (key === 'joined') return new Date(u.joinDate || 0).getTime();
            if (key === 'lastLogin') return new Date(u.lastLogin || 0).getTime();
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
            {/* Enroll Student Modal (People tab) */}
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
                                    ? variant === 'people'
                                        ? 'Edit learner'
                                        : 'Edit staff user'
                                    : variant === 'people'
                                      ? 'Add learner'
                                      : 'Add staff user'}
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
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleFormChange}
                                                placeholder="user@example.com"
                                                required
                                                disabled={isSubmitting || editingUser}
                                            />
                                            {editingUser && (
                                                <small className="form-hint">
                                                    Email cannot be changed for existing users
                                                </small>
                                            )}
                                        </div>

                                        {formData.role === 'student' && (
                                            <div className="form-group">
                                                <label>Personal email (optional)</label>
                                                <input
                                                    type="email"
                                                    name="personalEmail"
                                                    value={formData.personalEmail}
                                                    onChange={handleFormChange}
                                                    placeholder="Gmail, Hotmail, etc. (not portal login)"
                                                    disabled={isSubmitting}
                                                />
                                                <small className="form-hint">
                                                    Separate from portal login above; for contact only.
                                                </small>
                                            </div>
                                        )}

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
                                            <label className="checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    name="isActive"
                                                    checked={formData.isActive}
                                                    onChange={handleFormChange}
                                                    disabled={isSubmitting}
                                                />
                                                <span className="checkmark"></span>
                                                Active User Account
                                            </label>
                                            <small className="form-hint">
                                                Inactive users cannot log into the system
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
                                            <input
                                                type="password"
                                                name="password"
                                                value={formData.password}
                                                onChange={handleFormChange}
                                                placeholder={editingUser ? "Leave blank to keep current" : "Enter password"}
                                                disabled={isSubmitting}
                                            />
                                            <small className="form-hint">
                                                {editingUser 
                                                    ? "Enter new password only if you want to change it"
                                                    : "Minimum 6 characters"}
                                            </small>
                                        </div>

                                        {(formData.password || !editingUser) && (
                                            <div className="form-group">
                                                <label>Confirm Password {!editingUser && '*'}</label>
                                                <input
                                                    type="password"
                                                    name="confirmPassword"
                                                    value={formData.confirmPassword}
                                                    onChange={handleFormChange}
                                                    placeholder="Confirm password"
                                                    disabled={isSubmitting}
                                                />
                                            </div>
                                        )}
                                    </div>
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
                        <i className={`fas ${variant === 'people' ? 'fa-people-group' : 'fa-users-cog'}`}></i>{' '}
                        {variant === 'people' ? 'People' : 'Staff accounts (Users)'}
                    </h1>
                    <p>
                        {variant === 'people' ? (
                            <>
                                Students, teachers, and parents. Staff accounts are under <strong>Users</strong>.
                            </>
                        ) : (
                            <>
                                Administrators, super-admins, and accountants. Learners are managed under <strong>People</strong>.
                            </>
                        )}
                    </p>
                </div>
                <div className="header-right">
                    {showAddButton && (
                        <button className="btn-primary" onClick={openCreateModal}>
                            <i className="fas fa-user-plus"></i>{' '}
                            {variant === 'people' ? 'Add learner' : 'Add staff user'}
                        </button>
                    )}
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {selectedUsers.length > 0 && (
                <div className="bulk-actions-bar">
                    <div className="selected-count">
                        <i className="fas fa-check-circle"></i>
                        {selectedUsers.length} user(s) selected
                    </div>
                    <div className="bulk-buttons">
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
                            <i className="fas fa-trash"></i> Delete Selected
                        </button>
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
                            variant === 'people'
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
                        {variant === 'people' ? (
                            <>
                                <option value="all">All learners</option>
                                <option value="student">Students</option>
                                <option value="teacher">Teachers</option>
                                <option value="parent">Parents</option>
                            </>
                        ) : (
                            <>
                                <option value="all">All staff roles</option>
                                <option value="super-admin">Super Admin</option>
                                <option value="admin">Admin/Manager</option>
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
                        {COLUMN_DEFS.map((key, idx) => (
                            <col key={key} style={{ width: `${columnWidths[idx]}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    type="checkbox"
                                    checked={
                                        selectableFilteredUsers.length > 0 &&
                                        selectedUsers.length === selectableFilteredUsers.length
                                    }
                                    onChange={toggleAllUsers}
                                />
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 0)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(0); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('user')}>User
                                {sortBy === 'user' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 1)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(1); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('role')}>Role
                                {sortBy === 'role' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 2)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(2); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>Status
                                {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 3)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(3); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('phone')}>Phone
                                {sortBy === 'phone' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 4)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(4); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('email')}>Email
                                {sortBy === 'email' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 5)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(5); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('joined')}>Joined
                                {sortBy === 'joined' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 6)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(6); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('lastLogin')}>Last Login
                                {sortBy === 'lastLogin' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 7)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(7); }} />
                            </th>
                            <th>Actions
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 8)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(8); }} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map(user => (
                            <tr key={user._id} className={selectedUsers.includes(user._id) ? 'selected' : ''}>
                                <td className="checkbox-cell">
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.includes(user._id)}
                                        onChange={() => toggleUserSelection(user._id)}
                                        disabled={isRowActionsLocked(user)}
                                    />
                                </td>
                                <td>
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
                                <td>
                                    <span className={`role-badge ${user.role}`}>
                                        <i className={`fas fa-${
                                            user.role === 'super-admin' ? 'user-shield' :
                                            user.role === 'admin' ? 'user-cog' :
                                            user.role === 'teacher' ? 'chalkboard-teacher' :
                                            user.role === 'accountant' ? 'calculator' :
                                            user.role === 'parent' ? 'people-roof' :
                                            'user-graduate'
                                        }`}></i>
                                        {user.role.replace('-', ' ')}
                                    </span>
                                </td>
                                <td>
                                    <span className={`status-badge ${user.status}`}>
                                        <i className={`fas fa-${user.status === 'active' ? 'check-circle' : 'times-circle'}`}></i>
                                        {user.status}
                                    </span>
                                </td>
                                <td>
                                    <span className="phone-info">
                                        {user.phone || 'Not set'}
                                    </span>
                                </td>
                                <td className="cell-email">
                                    <span className="email-cell" title={user.email}>
                                        {user.email}
                                    </span>
                                </td>
                                <td>
                                    {user.joinDate ? new Date(user.joinDate).toLocaleDateString() : 'N/A'}
                                </td>
                                <td>
                                    {user.lastLogin
                                        ? new Date(user.lastLogin).toLocaleString(undefined, {
                                              dateStyle: 'short',
                                              timeStyle: 'short',
                                          })
                                        : 'Never'}
                                </td>
                                <td className="cell-actions">
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
                                        ) : (
                                            <>
                                                <button 
                                                    className="action-btn edit-btn"
                                                    title="Edit User"
                                                    onClick={() => openEditModal(user)}
                                                >
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                {variant === 'people' && user.role === 'student' && user.isActive !== false && (
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
                                                    title="Delete User"
                                                    onClick={() => deleteUser(user._id)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {sortedUsers.length === 0 && (
                    <div className="no-results">
                        <i className="fas fa-user-slash"></i>
                        <h3>No users found</h3>
                        <p>Try a different search term or filter</p>
                        {showAddButton && (
                        <button className="btn-primary" onClick={openCreateModal}>
                            <i className="fas fa-user-plus"></i> Add first record
                        </button>
                        )}
                    </div>
                )}
            </div>

            {/* Stats Summary */}
            <div className="stats-summary">
                {variant === 'people' ? (
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
                                <h3>{users.filter(u => u.role === 'admin').length}</h3>
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