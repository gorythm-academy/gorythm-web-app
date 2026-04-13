import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getAuthToken, getAuthUserJson, clearAuthSession } from '../../utils/authStorage';
import './Admin.scss';

const DashboardLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarFrozen, setSidebarFrozen] = useState(true);
    const footerRef = useRef(null);
    const dashboardRef = useRef(null);
    const sidebarRef = useRef(null);
    const [sidebarAbsoluteTop, setSidebarAbsoluteTop] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Unfreeze sidebar when footer enters viewport (works with Lenis smooth scroll)
    useEffect(() => {
        const footer = footerRef.current;
        if (!footer) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                const intersecting = entry.isIntersecting;

                // When the footer starts intersecting, "pin" the sidebar in-place
                // by switching to absolute positioning at its current visual top.
                if (intersecting) {
                    window.requestAnimationFrame(() => {
                        const dashboardEl = dashboardRef.current;
                        const sidebarEl = sidebarRef.current;
                        if (!dashboardEl || !sidebarEl) {
                            setSidebarFrozen(false);
                            return;
                        }

                        const dashboardRect = dashboardEl.getBoundingClientRect();
                        const sidebarRect = sidebarEl.getBoundingClientRect();

                        // Compute sidebar's top relative to the dashboard container.
                        // (Both rects are viewport-relative, so subtracting is sufficient.)
                        const nextTop = sidebarRect.top - dashboardRect.top;
                        setSidebarAbsoluteTop(nextTop);
                        setSidebarFrozen(false);
                    });
                } else {
                    setSidebarFrozen(true);
                    setSidebarAbsoluteTop(null);
                }
            },
            // Trigger a bit later (closer to footer) for smoother feel.
            { root: null, rootMargin: '0px 0px -120px 0px', threshold: 0 }
        );
        observer.observe(footer);
        return () => observer.disconnect();
    }, []);

    // Check authentication on mount
    useEffect(() => {
        const token = getAuthToken();
        const user = getAuthUserJson();
        
        if (!token || !user) {
            navigate('/admin/login');
        }
    }, [navigate]);

    // Logout function
    const handleLogout = () => {
        clearAuthSession();
        navigate('/admin/login');
    };



    // Get current user from localStorage
    const user = JSON.parse(getAuthUserJson() || '{}');

    const menuItems = [
        { path: '/admin', icon: 'fas fa-home', label: 'Dashboard' },
        { path: '/admin/users', icon: 'fas fa-users', label: 'Users' },
        { path: '/admin/people', icon: 'fas fa-people-group', label: 'People' },
        { path: '/admin/courses', icon: 'fas fa-book', label: 'Courses' },
        { path: '/admin/payments', icon: 'fas fa-credit-card', label: 'Payments' },
        { path: '/admin/students-data', icon: 'fas fa-user-graduate', label: 'Students data' },
        { path: '/admin/assignments', icon: 'fas fa-tasks', label: 'Assignments' },
        { path: '/admin/analytics', icon: 'fas fa-chart-bar', label: 'Analytics' },
        { path: '/admin/contact-messages', icon: 'fas fa-envelope-open-text', label: 'Contact Messages' },
        { path: '/admin/settings', icon: 'fas fa-cog', label: 'Settings' },
    ];

    return (
        <div ref={dashboardRef} className="admin-dashboard">
            {/* Sidebar */}
            <aside
                ref={sidebarRef}
                className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'} ${sidebarFrozen ? 'sidebar-frozen' : 'sidebar-unfrozen'}`}
                style={!sidebarFrozen && sidebarAbsoluteTop != null ? { top: `${sidebarAbsoluteTop}px` } : undefined}
            >
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
                                {user.email ? <p>{user.email}</p> : null}
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