import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { setAuthSession, getAuthToken, getAuthUserJson, setAuthUserJson } from '../../utils/authStorage';
import './Login.scss';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isResetMode = useMemo(() => {
        const query = new URLSearchParams(location.search);
        return query.get('reset') === '1';
    }, [location.search]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [rememberMe, setRememberMe] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const routeByRole = (role) => {
        if (role === 'teacher') return '/teacher';
        if (role === 'parent') return '/parent';
        if (role === 'accountant') return '/accountant';
        if (role === 'admin' || role === 'super-admin') return '/admin';
        return '/student';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            setIsSubmitting(true);
            const response = await axios.post('http://localhost:5000/api/auth/login', {
                email: formData.email,
                password: formData.password,
                rememberMe,
            });
            setAuthSession(response.data.token, response.data.user, rememberMe);
            if (response.data.user?.mustChangePassword) {
                navigate('/login?reset=1', { replace: true });
                return;
            }
            navigate(routeByRole(response.data.user.role), { replace: true });
        } catch (err) {
            setError(err.response?.data?.error || 'Authentication failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInitialPasswordReset = async (e) => {
        e.preventDefault();
        setError('');

        if (!newPassword || newPassword.length < 6) {
            setError('New password must be at least 6 characters');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setError('Passwords do not match');
            return;
        }

        const token = getAuthToken();
        const rawUser = getAuthUserJson();
        if (!token || !rawUser) {
            setError('Session expired. Please login again.');
            navigate('/login');
            return;
        }

        try {
            setIsSubmitting(true);
            const response = await axios.post(
                'http://localhost:5000/api/auth/change-initial-password',
                { newPassword },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const user = JSON.parse(rawUser);
            const updatedUser = { ...user, ...response.data.user, mustChangePassword: false };
            setAuthUserJson(JSON.stringify(updatedUser));
            navigate(routeByRole(updatedUser.role));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update password');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isResetMode) {
        return (
            <div className="login-page">
                <div className="login-container">
                    <div className="login-header">
                        <h1>Reset Your Password</h1>
                        <p>For security, please set a new password before continuing.</p>
                    </div>
                    <form className="login-form" onSubmit={handleInitialPasswordReset}>
                        <div className="form-group">
                            <label>New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Confirm New Password</label>
                            <input
                                type="password"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                placeholder="Confirm new password"
                                required
                            />
                        </div>
                        {error && <div className="auth-error">{error}</div>}
                        <button type="submit" className="submit-btn" disabled={isSubmitting}>
                            {isSubmitting ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header">
                    <h1>Welcome Back</h1>
                    <p>Sign in to continue your learning journey</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>

                    <div className="form-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="Enter your email"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Enter your password"
                            required
                        />
                    </div>

                    <div className="form-options">
                        <label className="remember-me">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                            />
                            Remember me
                        </label>
                        <a href="/forgot-password" className="forgot-password">
                            Forgot Password?
                        </a>
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <button type="submit" className="submit-btn">
                        {isSubmitting ? 'Please wait...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;