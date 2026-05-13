import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { setAuthSession, getAuthToken, getAuthUserJson, setAuthUserJson } from '../../utils/authStorage';
import { API_BASE_URL } from '../../config/constants';
import headerLogo from '../../assets/images/home/logo.png';
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
        password: '',
    });
    const [rememberMe, setRememberMe] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
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
            const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
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
                `${API_BASE_URL}/api/auth/change-initial-password`,
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
            <div className="auth-login">
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
                                For security, choose a new password before continuing.
                            </p>
                        </header>
                        <form className="auth-login__form" onSubmit={handleInitialPasswordReset} noValidate>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="portal-reset-password">
                                    New password
                                </label>
                                <div className="auth-login__input-wrap">
                                    <input
                                        id="portal-reset-password"
                                        className="auth-login__input"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="At least 6 characters"
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                            </div>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="portal-reset-password-confirm">
                                    Confirm password
                                </label>
                                <div className="auth-login__input-wrap">
                                    <input
                                        id="portal-reset-password-confirm"
                                        className="auth-login__input"
                                        type="password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        placeholder="Re-enter password"
                                        autoComplete="new-password"
                                        required
                                    />
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
                            <img src={headerLogo} alt="" className="auth-login__logo" width={180} height={48} />
                        </Link>
                        <h1 className="auth-login__title">Welcome back</h1>
                        <p className="auth-login__subtitle">Sign in to your portal to continue learning.</p>
                    </header>
                    <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
                        <div className="auth-login__field">
                            <label className="auth-login__label" htmlFor="portal-login-email">
                                Email
                            </label>
                            <div className="auth-login__input-wrap">
                                <input
                                    id="portal-login-email"
                                    className="auth-login__input"
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="you@example.com"
                                    autoComplete="username"
                                    required
                                />
                            </div>
                        </div>
                        <div className="auth-login__field">
                            <label className="auth-login__label" htmlFor="portal-login-password">
                                Password
                            </label>
                            <div className="auth-login__input-wrap">
                                <input
                                    id="portal-login-password"
                                    className="auth-login__input"
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="Your password"
                                    autoComplete="current-password"
                                    required
                                />
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
                            <Link to="/contact" className="auth-login__link">
                                Need account help?
                            </Link>
                        </div>
                        {error ? <div className="auth-login__error">{error}</div> : null}
                        <button type="submit" className="auth-login__submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
