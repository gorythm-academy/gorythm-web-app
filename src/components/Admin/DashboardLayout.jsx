import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import './Admin.scss';

const DashboardLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarFrozen, setSidebarFrozen] = useState(true);
    const footerRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Unfreeze sidebar when footer enters viewport (works with Lenis smooth scroll)
    useEffect(() => {
        const footer = footerRef.current;
        if (!footer) return;
        const observer = new IntersectionObserver(
            ([entry]) => setSidebarFrozen(!entry.isIntersecting),
            { root: null, rootMargin: '0px', threshold: 0 }
        );
        observer.observe(footer);
        return () => observer.disconnect();
    }, []);

    // Check authentication on mount
    useEffect(() => {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        
        if (!token || !user) {
            navigate('/admin/login');
        }
    }, [navigate]);

    // Logout function
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/admin/login');
    };



    // Get current user from localStorage
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const menuItems = [
        { path: '/admin', icon: 'fas fa-home', label: 'Dashboard' },
        { path: '/admin/users', icon: 'fas fa-users', label: 'Users' },
        { path: '/admin/courses', icon: 'fas fa-book', label: 'Courses' },
        { path: '/admin/payments', icon: 'fas fa-credit-card', label: 'Payments' },
        { path: '/admin/enrollments', icon: 'fas fa-user-graduate', label: 'Enrollments' },
        { path: '/admin/assignments', icon: 'fas fa-tasks', label: 'Assignments' },
        { path: '/admin/analytics', icon: 'fas fa-chart-bar', label: 'Analytics' },
        { path: '/admin/settings', icon: 'fas fa-cog', label: 'Settings' },
    ];

    return (
        <div className="admin-dashboard">
            {/* Sidebar */}
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'} ${sidebarFrozen ? 'sidebar-frozen' : 'sidebar-unfrozen'}`}>
                <div className="sidebar-header">
                    {sidebarOpen && (
                        <div className="sidebar-logo-wrap">
                            <div className="sidebar-logo-text sidebar-logo--full">
                                <span className="logo-primary">Gory</span>
                                <span className="logo-secondary">thm</span>
                            </div>
                        </div>
                    )}
                    <button 
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                    >
                        <i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`}></i>
                    </button>
                </div>
                
                <nav className="sidebar-menu">
                    {menuItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`menu-item ${location.pathname === item.path ? 'active' : ''}`}
                        >
                            <i className={item.icon}></i>
                            {sidebarOpen && <span>{item.label}</span>}
                        </Link>
                    ))}
                </nav>
                
                <div className="sidebar-footer">
                    <div className="admin-profile">
                        <div className="profile-avatar">
                            {user.name ? user.name.charAt(0).toUpperCase() : 'A'}
                        </div>
                        {sidebarOpen && (
                            <div className="profile-info">
                                <h4>{user.name || 'Admin User'}</h4>
                                <p>{user.email || 'admin@academy.com'}</p>
                                <span className="role-badge">{user.role || 'admin'}</span>
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <header className="admin-header">
                    <div className="header-left">
                        <h1>Admin Dashboard</h1>
                        <p>Welcome back, {user.name?.split(' ')[0] || 'Admin'}! Manage your academy efficiently</p>
                    </div>
                    <div className="header-right">
                        <button className="logout-btn" onClick={handleLogout}>
                            <i className="fas fa-sign-out-alt"></i> Logout
                        </button>
                    </div>
                </header>

                <div className="admin-content">
                    <Outlet />
                </div>
                
                {/* Footer */}
                <footer ref={footerRef} className="admin-footer">
                    <p>© {new Date().getFullYear()} Gorythm Academy. All rights reserved.</p>
                    <p>v1.0.0 • Backend Connected: ✅</p>
                </footer>
            </main>
        </div>
    );
};

export default DashboardLayout;