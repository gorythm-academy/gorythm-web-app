import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
    setAuthSession,
    getAuthToken,
    getAuthUserJson,
    setAuthUserJson,
    AUTH_REALM,
} from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import BrandLogo from '../../BrandLogo/BrandLogo';
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
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

    const redirectMessage = location.state?.message;

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            setIsSubmitting(true);
            const response = await axios.post(`${API_BASE_URL}/api/auth/admin-login`, {
                email,
                password,
                rememberMe,
            });

            setAuthSession(response.data.token, response.data.user, rememberMe, AUTH_REALM.ADMIN);

            if (response.data.user?.mustChangePassword) {
                navigate('/admin/login?reset=1', { replace: true });
                return;
            }
            const from = location.state?.from;
            navigate(typeof from === 'string' && from.startsWith('/admin') ? from : '/admin', {
                replace: true,
            });
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
        const token = getAuthToken(AUTH_REALM.ADMIN);
        const rawUser = getAuthUserJson(AUTH_REALM.ADMIN);
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
            setAuthUserJson(JSON.stringify(updatedUser), AUTH_REALM.ADMIN);
            navigate('/admin', { replace: true });
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
                                <BrandLogo className="auth-login__logo" alt="" width={180} height={48} />
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
                                <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                    <input
                                        id="admin-reset-password"
                                        className="auth-login__input"
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-login__password-toggle"
                                        onClick={() => setShowNewPassword((v) => !v)}
                                        aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fas ${showNewPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="admin-reset-password-confirm">
                                    Confirm password
                                </label>
                                <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                    <input
                                        id="admin-reset-password-confirm"
                                        className="auth-login__input"
                                        type={showConfirmNewPassword ? 'text' : 'password'}
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-login__password-toggle"
                                        onClick={() => setShowConfirmNewPassword((v) => !v)}
                                        aria-label={showConfirmNewPassword ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fas ${showConfirmNewPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                                    </button>
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
                            <BrandLogo className="auth-login__logo" alt="" width={180} height={48} />
                        </Link>
                        <h1 className="auth-login__title">Admin sign in</h1>
                        <p className="auth-login__subtitle">Authorized access to the academy dashboard.</p>
                    </header>
                    <form className="auth-login__form" onSubmit={handleLogin} noValidate>
                        {redirectMessage ? (
                            <div className="auth-login__error" style={{ color: '#b45309', marginBottom: '0.75rem' }}>
                                {redirectMessage}
                            </div>
                        ) : null}
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
                            <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                <input
                                    id="admin-login-password"
                                    className="auth-login__input"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="auth-login__password-toggle"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                                </button>
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
