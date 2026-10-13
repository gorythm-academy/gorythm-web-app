import RequiredMark from '../shared/RequiredMark';
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
} from '../../utils/authStorage';
import { API_BASE_URL } from '../../config/constants';
import { validatePasswordPair } from '../../utils/studentAdminValidation';
import { portalHomeByRole } from '../../utils/portalHomeByRole';
import { verifyPortalSession } from '../../utils/portalAuthSession';
import { restoreSessionFromCookie } from '../../utils/authSessionRestore';
import { getLoginFormError } from '../../utils/authLoginErrors';
import BrandLogo from '../BrandLogo/BrandLogo';
import './Login.scss';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isSetPasswordMode = useMemo(() => {
        const query = new URLSearchParams(location.search);
        return query.get('set-password') === '1';
    }, [location.search]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [rememberMe, setRememberMe] = useState(false);
    const [isCheckingSession, setIsCheckingSession] = useState(() => !isSetPasswordMode);
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const postLoginPath = useCallback(() => {
        const from = location.state?.from;
        if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('/admin')) {
            return from;
        }
        return null;
    }, [location.state]);

    useEffect(() => {
        if (isSetPasswordMode) return undefined;
        let cancelled = false;

        const run = async () => {
            let { token, user } = getAuthSession(AUTH_REALM.PORTAL);
            if (!token || !user) {
                const restored = await restoreSessionFromCookie(AUTH_REALM.PORTAL);
                token = restored?.token;
                user = restored?.user;
            }
            if (!token || !user) {
                setIsCheckingSession(false);
                return;
            }
            const adminRoles = ['manager', 'super-admin'];
            if (adminRoles.includes(user.role)) {
                await clearAuthSession(AUTH_REALM.PORTAL);
                if (cancelled) return;
                setIsCheckingSession(false);
                return;
            }

            setIsCheckingSession(true);
            try {
                const live = await verifyPortalSession();
                if (cancelled) return;
                if (!live) {
                    setIsCheckingSession(false);
                    return;
                }
                if (live.mustChangePassword) {
                    navigate('/login?set-password=1', { replace: true });
                    return;
                }
                navigate(postLoginPath() || portalHomeByRole(live.role), { replace: true });
            } catch {
                if (cancelled) return;
                setError('Cannot reach the server. Check your connection and try signing in.');
                setIsCheckingSession(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [isSetPasswordMode, navigate, postLoginPath]);

    useEffect(() => {
        if (!isSetPasswordMode) return undefined;
        let cancelled = false;

        const run = async () => {
            let { token, user } = getAuthSession(AUTH_REALM.PORTAL);
            if (!token || !user) {
                const restored = await restoreSessionFromCookie(AUTH_REALM.PORTAL);
                token = restored?.token;
                user = restored?.user;
            }
            if (!token || !user) {
                await clearAuthSession(AUTH_REALM.PORTAL);
                if (cancelled) return;
                navigate('/login', { replace: true });
                return;
            }
            try {
                const live = await verifyPortalSession();
                if (cancelled) return;
                if (!live) {
                    navigate('/login', { replace: true });
                    return;
                }
                if (!live.mustChangePassword) {
                    navigate(postLoginPath() || portalHomeByRole(live.role), { replace: true });
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
    }, [isSetPasswordMode, navigate, postLoginPath]);

    const portalMessage = location.state?.message;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        try {
            setIsSubmitting(true);
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/login`,
                {
                    email: formData.email,
                    password: formData.password,
                    rememberMe,
                },
                {
                    withCredentials: true,
                    headers: { 'X-Auth-Realm': 'portal' },
                }
            );
            const role = response.data.user?.role;
            if (role === 'manager' || role === 'super-admin') {
                setError('Admin accounts must use the admin login page at /admin/login.');
                return;
            }
            setAuthSession(response.data.token, response.data.user, rememberMe, AUTH_REALM.PORTAL);
            if (response.data.user?.mustChangePassword) {
                navigate('/login?set-password=1', { replace: true });
                return;
            }
            navigate(postLoginPath() || portalHomeByRole(response.data.user.role), { replace: true });
        } catch (err) {
            setError(getLoginFormError(err, 'Authentication failed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInitialPasswordReset = async (e) => {
        e.preventDefault();
        setError('');

        const passwordErr = validatePasswordPair(newPassword, confirmNewPassword, { required: true });
        if (passwordErr) {
            setError(passwordErr);
            return;
        }

        const rawUser = getAuthUserJson(AUTH_REALM.PORTAL);
        if (!hasAuthSession(AUTH_REALM.PORTAL) || !rawUser) {
            await clearAuthSession(AUTH_REALM.PORTAL);
            setError('Session expired. Please login again.');
            navigate('/login');
            return;
        }

        try {
            setIsSubmitting(true);
            const response = await axios.post(
                `${API_BASE_URL}/api/auth/change-initial-password`,
                {
                    newPassword,
                    rememberMe: isRememberedSession(AUTH_REALM.PORTAL),
                },
                { headers: buildAuthHeaders(AUTH_REALM.PORTAL), withCredentials: true }
            );

            const user = JSON.parse(rawUser);
            const updatedUser = { ...user, ...response.data.user, mustChangePassword: false };
            if (response.data.token) {
                replaceAuthSession(response.data.token, updatedUser, AUTH_REALM.PORTAL);
            } else {
                setAuthUserJson(JSON.stringify(updatedUser), AUTH_REALM.PORTAL);
            }
            navigate(postLoginPath() || portalHomeByRole(updatedUser.role), { replace: true });
        } catch (err) {
            setError(getLoginFormError(err, 'Failed to update password'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isCheckingSession) {
        return (
            <div className="auth-login">
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
            <div className="auth-login">
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
                                For security, choose a new password before continuing.
                            </p>
                        </header>
                        <form className="auth-login__form" onSubmit={handleInitialPasswordReset} noValidate>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="portal-reset-password">
                                    New password <RequiredMark />
                                </label>
                                <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                    <input
                                        id="portal-reset-password"
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
                                <label className="auth-login__label" htmlFor="portal-reset-password-confirm">
                                    Confirm password <RequiredMark />
                                </label>
                            <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                <input
                                    id="portal-reset-password-confirm"
                                    className="auth-login__input"
                                    type={showConfirmNewPassword ? 'text' : 'password'}
                                    value={confirmNewPassword}
                                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                                    placeholder="Re-enter password"
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
                                {isSubmitting ? 'Updating…' : 'Update password'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-login">
            <div className="auth-login__center">
                <Link to="/" className="auth-login__back">
                    ← Back to website
                </Link>
                <div className="auth-login__card">
                    <header className="auth-login__brand">
                        <Link to="/" className="auth-login__logo-link" aria-label="Gorythm Academy home">
                            <BrandLogo className="auth-login__logo" alt="" width={180} height={48} />
                        </Link>
                        <h1 className="auth-login__title">Welcome Back</h1>
                        <p className="auth-login__subtitle">Sign in to your portal to continue learning.</p>
                    </header>
                    {portalMessage ? (
                        <div className="auth-login__error" role="status">{portalMessage}</div>
                    ) : null}
                    <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
                        <div className="auth-login__field">
                            <label className="auth-login__label" htmlFor="portal-login-email">
                                Email <RequiredMark />
                            </label>
                            <div className="auth-login__input-wrap">
                                <input
                                    id="portal-login-email"
                                    className="auth-login__input"
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="Portal username or personal email"
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>
                        <div className="auth-login__field">
                            <label className="auth-login__label" htmlFor="portal-login-password">
                                Password <RequiredMark />
                            </label>
                            <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                <input
                                    id="portal-login-password"
                                    className="auth-login__input"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="Your password"
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
                                <span>Remember me</span>
                            </label>
                            <Link to="/forgot-password" className="auth-login__link">
                                Forgot password?
                            </Link>
                        </div>
                        {error ? <div className="auth-login__error">{error}</div> : null}
                        <button type="submit" className="auth-login__submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>
                    <div className="auth-login__divider" role="presentation">
                        <span>or</span>
                    </div>
                    <Link to="/admin/login" className="auth-login__admin-cta">
                        <span className="auth-login__admin-cta-icon" aria-hidden="true">
                            <i className="fas fa-shield-alt" />
                        </span>
                        <span className="auth-login__admin-cta-copy">
                            <strong>Admin Access</strong>
                        </span>
                        <i className="fas fa-arrow-right auth-login__admin-cta-arrow" aria-hidden="true" />
                    </Link>
                    <p className="auth-login__legal">
                        <Link to="/privacy">Privacy</Link>
                        <span aria-hidden="true"> · </span>
                        <Link to="/terms">Terms</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
