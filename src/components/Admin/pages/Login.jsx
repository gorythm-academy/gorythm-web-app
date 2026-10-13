import RequiredMark from '../../shared/RequiredMark';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
    setAuthSession,
    getAuthUserJson,
    setAuthUserJson,
    replaceAuthSession,
    getAuthSession,
    clearAuthSession,
    isRememberedSession,
    hasAuthSession,
    buildAuthHeaders,
    AUTH_REALM,
} from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { validatePasswordPair } from '../../../utils/studentAdminValidation';
import { verifyAdminSession } from '../../../utils/adminAuthSession';
import { restoreSessionFromCookie } from '../../../utils/authSessionRestore';
import { getLoginFormError } from '../../../utils/authLoginErrors';
import BrandLogo from '../../BrandLogo/BrandLogo';
import './Login.scss';

const AdminLogin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isSetPasswordMode = useMemo(() => {
        const q = new URLSearchParams(location.search);
        return q.get('set-password') === '1';
    }, [location.search]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(() => !isSetPasswordMode);
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

    const redirectMessage = location.state?.message;

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            setIsSubmitting(true);
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/admin-login`,
                { email, password, rememberMe },
                {
                    withCredentials: true,
                    headers: { 'X-Auth-Realm': 'admin' },
                }
            );

            setAuthSession(response.data.token, response.data.user, rememberMe, AUTH_REALM.ADMIN);

            if (response.data.user?.mustChangePassword) {
                navigate('/admin/login?set-password=1', { replace: true });
                return;
            }
            const from = location.state?.from;
            navigate(typeof from === 'string' && from.startsWith('/admin') ? from : '/admin', {
                replace: true,
            });
        } catch (err) {
            setError(getLoginFormError(err, 'Invalid credentials.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setError('');
        const passwordErr = validatePasswordPair(newPassword, confirmNewPassword, { required: true });
        if (passwordErr) {
            setError(passwordErr);
            return;
        }
        const rawUser = getAuthUserJson(AUTH_REALM.ADMIN);
        if (!hasAuthSession(AUTH_REALM.ADMIN) || !rawUser) {
            await clearAuthSession(AUTH_REALM.ADMIN);
            setError('Session expired. Please log in again.');
            navigate('/admin/login', { replace: true });
            return;
        }
        try {
            setIsSubmitting(true);
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/change-initial-password`,
                {
                    newPassword,
                    rememberMe: isRememberedSession(AUTH_REALM.ADMIN),
                },
                { headers: buildAuthHeaders(AUTH_REALM.ADMIN), withCredentials: true }
            );
            const user = JSON.parse(rawUser);
            const updatedUser = { ...user, ...response.data.user, mustChangePassword: false };
            if (response.data.token) {
                replaceAuthSession(response.data.token, updatedUser, AUTH_REALM.ADMIN);
            } else {
                setAuthUserJson(JSON.stringify(updatedUser), AUTH_REALM.ADMIN);
            }
            navigate(adminDestAfterAuth(), { replace: true });
        } catch (err) {
            setError(getLoginFormError(err, 'Failed to update password'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const adminDestAfterAuth = useCallback(() => {
        const from = location.state?.from;
        return typeof from === 'string' && from.startsWith('/admin') ? from : '/admin';
    }, [location.state]);

    useEffect(() => {
        if (isSetPasswordMode) return undefined;
        let cancelled = false;

        const run = async () => {
            let { token, user } = getAuthSession(AUTH_REALM.ADMIN);
            if (!token || !user) {
                const restored = await restoreSessionFromCookie(AUTH_REALM.ADMIN);
                token = restored?.token;
                user = restored?.user;
            }
            if (!token || !user) {
                setIsCheckingSession(false);
                return;
            }

            setIsCheckingSession(true);
            try {
                const live = await verifyAdminSession();
                if (cancelled) return;
                if (!live) {
                    setIsCheckingSession(false);
                    return;
                }
                if (live.mustChangePassword) {
                    navigate('/admin/login?set-password=1', { replace: true });
                    return;
                }
                navigate(adminDestAfterAuth(), { replace: true });
            } catch {
                if (cancelled) return;
                // Network/server error: stay on login — do not bounce into dashboard.
                setError('Cannot reach the server. Check your connection and try signing in.');
                setIsCheckingSession(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [adminDestAfterAuth, isSetPasswordMode, navigate]);

    useEffect(() => {
        if (!isSetPasswordMode) return undefined;
        let cancelled = false;

        const run = async () => {
            let { token, user } = getAuthSession(AUTH_REALM.ADMIN);
            if (!token || !user) {
                const restored = await restoreSessionFromCookie(AUTH_REALM.ADMIN);
                token = restored?.token;
                user = restored?.user;
            }
            if (!token || !user) {
                await clearAuthSession(AUTH_REALM.ADMIN);
                if (cancelled) return;
                navigate('/admin/login', { replace: true });
                return;
            }
            try {
                const live = await verifyAdminSession();
                if (cancelled) return;
                if (!live) {
                    navigate('/admin/login', { replace: true });
                    return;
                }
                if (!live.mustChangePassword) {
                    navigate(adminDestAfterAuth(), { replace: true });
                }
            } catch {
                if (cancelled) return;
                setError('Cannot reach the server. Check your connection and try again.');
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [adminDestAfterAuth, isSetPasswordMode, navigate]);

    if (isCheckingSession) {
        return (
            <div className="auth-login auth-login--admin">
                <div className="auth-login__center">
                    <div className="auth-login__card">
                        <p className="auth-login__subtitle" role="status">
                            Checking your session…
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (isSetPasswordMode) {
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
                            <h1 className="auth-login__title">Set a New Password</h1>
                            <p className="auth-login__subtitle">
                                Choose a secure password to continue to the admin dashboard.
                            </p>
                        </header>
                        <form className="auth-login__form" onSubmit={handlePasswordReset} noValidate>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="admin-reset-password">
                                    New password <RequiredMark />
                                </label>
                                <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                    <input
                                        id="admin-reset-password"
                                        className="auth-login__input"
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="At least 8 characters"
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
                                    Confirm password <RequiredMark />
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
                        <h1 className="auth-login__title">Admin Sign In</h1>
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
                                Email <RequiredMark />
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
                                Password <RequiredMark />
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
                        <div className="auth-login__options">
                            <label className="auth-login__checkbox">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                />
                                <span>Remember me on this device (up to 12 hours)</span>
                            </label>
                            <Link to="/forgot-password?from=admin" className="auth-login__link">
                                Forgot password?
                            </Link>
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
