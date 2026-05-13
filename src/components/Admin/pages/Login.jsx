import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { setAuthSession, getAuthToken, getAuthUserJson, setAuthUserJson } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import headerLogo from '../../../assets/images/home/logo.png';
import './Login.scss';

const AdminLogin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isResetMode = useMemo(() => {
        const q = new URLSearchParams(location.search);
        return q.get('reset') === '1';
    }, [location.search]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const routeByRole = (role) => {
        if (role === 'teacher') return '/teacher';
        if (role === 'parent') return '/parent';
        if (role === 'accountant') return '/accountant';
        if (role === 'admin' || role === 'super-admin') return '/admin';
        return '/student';
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            setIsSubmitting(true);
            const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
                email,
                password,
                rememberMe,
            });

            setAuthSession(response.data.token, response.data.user, rememberMe);

            if (response.data.user?.mustChangePassword) {
                const resetPath = ['admin', 'super-admin'].includes(response.data.user.role)
                    ? '/admin/login?reset=1'
                    : '/login?reset=1';
                navigate(resetPath, { replace: true });
                return;
            }
            navigate(routeByRole(response.data.user.role), { replace: true });
        } catch (err) {
            const msg = err.response?.data?.error;
            setError(msg || 'Invalid credentials.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async (e) => {
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
            setError('Session expired. Please log in again.');
            navigate('/admin/login', { replace: true });
            return;
        }
        try {
            setIsSubmitting(true);
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/change-initial-password`,
                { newPassword },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const user = JSON.parse(rawUser);
            const updatedUser = { ...user, ...response.data.user, mustChangePassword: false };
            setAuthUserJson(JSON.stringify(updatedUser));
            navigate(routeByRole(updatedUser.role), { replace: true });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update password');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isResetMode) {
        return (
            <div className="auth-login auth-login--admin">
                <div className="auth-login__center">
                    <Link to="/" className="auth-login__back">
                        ← Back to website
                    </Link>
                    <div className="auth-login__card">
                        <header className="auth-login__brand">
                            <Link to="/" className="auth-login__logo-link" aria-label="Gorythm Academy home">
                                <img src={headerLogo} alt="" className="auth-login__logo" width={180} height={48} />
                            </Link>
                            <h1 className="auth-login__title">Set a new password</h1>
                            <p className="auth-login__subtitle">
                                Choose a secure password to continue to the admin dashboard.
                            </p>
                        </header>
                        <form className="auth-login__form" onSubmit={handlePasswordReset} noValidate>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="admin-reset-password">
                                    New password
                                </label>
                                <div className="auth-login__input-wrap">
                                    <input
                                        id="admin-reset-password"
                                        className="auth-login__input"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="admin-reset-password-confirm">
                                    Confirm password
                                </label>
                                <div className="auth-login__input-wrap">
                                    <input
                                        id="admin-reset-password-confirm"
                                        className="auth-login__input"
                                        type="password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                            </div>
                            {error ? <div className="auth-login__error">{error}</div> : null}
                            <button type="submit" className="auth-login__submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Saving…' : 'Update password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-login auth-login--admin">
            <div className="auth-login__center">
                <Link to="/" className="auth-login__back">
                    ← Back to website
                </Link>
                <div className="auth-login__card">
                    <header className="auth-login__brand">
                        <Link to="/" className="auth-login__logo-link" aria-label="Gorythm Academy home">
                            <img src={headerLogo} alt="" className="auth-login__logo" width={180} height={48} />
                        </Link>
                        <h1 className="auth-login__title">Admin sign in</h1>
                        <p className="auth-login__subtitle">Authorized access to the academy dashboard.</p>
                    </header>
                    <form className="auth-login__form" onSubmit={handleLogin} noValidate>
                        <div className="auth-login__field">
                            <label className="auth-login__label" htmlFor="admin-login-email">
                                Email
                            </label>
                            <div className="auth-login__input-wrap">
                                <input
                                    id="admin-login-email"
                                    className="auth-login__input"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>
                        <div className="auth-login__field">
                            <label className="auth-login__label" htmlFor="admin-login-password">
                                Password
                            </label>
                            <div className="auth-login__input-wrap">
                                <input
                                    id="admin-login-password"
                                    className="auth-login__input"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                        </div>
                        <div className="auth-login__field">
                            <label className="auth-login__checkbox">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                />
                                <span>Remember me on this device</span>
                            </label>
                        </div>
                        {error ? <div className="auth-login__error">{error}</div> : null}
                        <button type="submit" className="auth-login__submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Signing in…' : 'Sign in to dashboard'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
