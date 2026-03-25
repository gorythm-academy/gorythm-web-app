import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UsersManagement.scss';

const UsersManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [selectedUsers, setSelectedUsers] = useState([]);
    
    // Modal states
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'teacher',
        phone: '',
        isActive: true
    });

    // Available roles
    const userRoles = [
        { value: 'super-admin', label: 'Super Admin', icon: 'fa-user-shield' },
        { value: 'admin', label: 'Admin/Manager', icon: 'fa-user-cog' },
        { value: 'teacher', label: 'Teacher/Instructor', icon: 'fa-chalkboard-teacher' },
        { value: 'accountant', label: 'Accountant', icon: 'fa-calculator' },
        { value: 'student', label: 'Student', icon: 'fa-user-graduate' }
    ];

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            
            const response = await axios.get('http://localhost:5000/api/users', {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    search: searchTerm || undefined,
                    role: filterRole !== 'all' ? filterRole : undefined
                }
            });

            if (response.data.success) {
                setUsers(response.data.users || []);
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
    };

    const openCreateModal = () => {
        setEditingUser(null);
        setFormData({
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
            role: 'teacher',
            phone: '',
            isActive: true
        });
        setShowUserModal(true);
    };

    const openEditModal = (user) => {
        if (!user) return;
        
        setEditingUser(user);
        setFormData({
            name: user.name || '',
            email: user.email || '',
            password: '',
            confirmPassword: '',
            role: user.role || 'teacher',
            phone: user.phone || '',
            isActive: user.isActive !== false
        });
        setShowUserModal(true);
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
        const token = localStorage.getItem('token');
        
        try {
            const payload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                role: formData.role,
                phone: formData.phone.trim(),
                isActive: formData.isActive
            };
            
            if (!editingUser) {
                // Create new user
                payload.password = formData.password;
                
                const response = await axios.post(
                    'http://localhost:5000/api/users',
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
                alert('User created successfully!');
                setUsers(prev => [response.data.user, ...prev]);
            } else {
                // Update existing user
                const response = await axios.put(
                    `http://localhost:5000/api/users/${editingUser._id}`,
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
                        `http://localhost:5000/api/users/${editingUser._id}/password`,
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
        setSelectedUsers(prev => 
            prev.includes(userId) 
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const toggleAllUsers = () => {
        if (selectedUsers.length === filteredUsers.length && filteredUsers.length > 0) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(filteredUsers.map(user => user._id));
        }
    };

    const updateUserStatus = async (userId, currentStatus) => {
        const user = users.find(u => u._id === userId);
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        
        if (!window.confirm(`Change "${user?.name || 'this user'}" from ${currentStatus} to ${newStatus}?`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            await axios.patch(
                `http://localhost:5000/api/users/${userId}/status`, 
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
        
        if (!window.confirm(`Are you sure you want to delete "${user?.name || 'this user'}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            await axios.delete(`http://localhost:5000/api/users/${userId}`, {
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
            const token = localStorage.getItem('token');
            const response = await axios.post(
                'http://localhost:5000/api/users/bulk-delete', 
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
            const token = localStorage.getItem('token');
            await axios.patch('http://localhost:5000/api/users/bulk-status', 
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
            user.phone?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesRole = filterRole === 'all' || user.role === filterRole;
        
        return matchesSearch && matchesRole;
    });

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
            {/* User Form Modal */}
            {showUserModal && (
                <div className="user-modal-overlay">
                    <div className="user-modal">
                        <div className="user-modal-header">
                            <h2>
                                <i className={`fas ${editingUser ? 'fa-edit' : 'fa-user-plus'}`}></i>
                                {editingUser ? 'Edit User' : 'Add New User'}
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
                                                {userRoles.map(role => (
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

            {/* Header */}
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-users-cog"></i> User Management</h1>
                    <p>Manage all academy users and their roles</p>
                </div>
                <div className="header-right">
                    <button className="btn-primary" onClick={openCreateModal}>
                        <i className="fas fa-user-plus"></i> Add New User
                    </button>
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
                        placeholder="Search users by name, email or phone..."
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
                        <option value="all">All Roles</option>
                        <option value="super-admin">Super Admin</option>
                        <option value="admin">Admin/Manager</option>
                        <option value="teacher">Teacher</option>
                        <option value="accountant">Accountant</option>
                        <option value="student">Student</option>
                    </select>
                    
                    <button className="refresh-btn" onClick={fetchUsers}>
                        <i className="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            </div>

            {/* Users Table */}
            <div className="users-table-container">
                <table className="users-table">
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    type="checkbox"
                                    checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                                    onChange={toggleAllUsers}
                                />
                            </th>
                            <th>User</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Phone</th>
                            <th>Courses</th>
                            <th>Joined</th>
                            <th>Last Login</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user._id} className={selectedUsers.includes(user._id) ? 'selected' : ''}>
                                <td className="checkbox-cell">
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.includes(user._id)}
                                        onChange={() => toggleUserSelection(user._id)}
                                    />
                                </td>
                                <td>
                                    <div className="user-info">
                                        <div className="user-avatar">
                                            {user.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="user-details">
                                            <strong>{user.name}</strong>
                                            <span className="user-email">{user.email}</span>
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
                                <td>
                                    <div className="courses-count">
                                        <i className="fas fa-book"></i>
                                        {user.enrolledCourses || 0} course(s)
                                    </div>
                                </td>
                                <td>
                                    {user.joinDate ? new Date(user.joinDate).toLocaleDateString() : 'N/A'}
                                </td>
                                <td>
                                    {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                                </td>
                                <td>
                                    <div className="action-buttons">
                                        <button 
                                            className="action-btn edit-btn"
                                            title="Edit User"
                                            onClick={() => openEditModal(user)}
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
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
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filteredUsers.length === 0 && (
                    <div className="no-results">
                        <i className="fas fa-user-slash"></i>
                        <h3>No users found</h3>
                        <p>Try a different search term or filter</p>
                        <button className="btn-primary" onClick={openCreateModal}>
                            <i className="fas fa-user-plus"></i> Add First User
                        </button>
                    </div>
                )}
            </div>

            {/* Stats Summary */}
            <div className="stats-summary">
                <div className="stat-card">
                    <div className="stat-icon total">
                        <i className="fas fa-users"></i>
                    </div>
                    <div className="stat-details">
                        <h3>{users.length}</h3>
                        <p>Total Users</p>
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
                        <i className="fas fa-user-check"></i>
                    </div>
                    <div className="stat-details">
                        <h3>{users.filter(u => u.status === 'active').length}</h3>
                        <p>Active Users</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon admin">
                        <i className="fas fa-user-shield"></i>
                    </div>
                    <div className="stat-details">
                        <h3>{users.filter(u => ['super-admin', 'admin'].includes(u.role)).length}</h3>
                        <p>Admins</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UsersManagement;