import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { setAuthSession, getAuthToken, getAuthUserJson, setAuthUserJson } from '../../../utils/authStorage';
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

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            setIsSubmitting(true);
            const response = await axios.post('http://localhost:5000/api/auth/admin-login', {
                email,
                password,
                rememberMe,
            });

            setAuthSession(response.data.token, response.data.user, rememberMe);

            if (response.data.user?.mustChangePassword) {
                navigate('/admin/login?reset=1', { replace: true });
                return;
            }
            navigate('/admin', { replace: true });
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
                'http://localhost:5000/api/auth/change-initial-password',
                { newPassword },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const user = JSON.parse(rawUser);
            const updatedUser = { ...user, ...response.data.user, mustChangePassword: false };
            setAuthUserJson(JSON.stringify(updatedUser));
            navigate('/admin', { replace: true });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update password');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isResetMode) {
        return (
            <div className="admin-login">
                <div className="login-container">
                    <div className="login-header">
                        <h1>Gorythm Academy</h1>
                        <p>Set a new password to continue to the admin dashboard</p>
                    </div>
                    <form onSubmit={handlePasswordReset}>
                        <div className="form-group">
                            <label>New password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Confirm password</label>
                            <input
                                type="password"
                                value={confirmNewPassword}
                                onChange={(e) => setConfirmNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        {error && <div className="error-message">{error}</div>}
                        <button type="submit" className="login-btn" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving…' : 'Update password'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-login">
            <div className="login-container">
                <div className="login-header">
                    <h1>Gorythm Academy</h1>
                    <p>Admin Portal Login</p>
                </div>

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group admin-remember-row">
                        <label className="checkbox-inline">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                            />
                            <span>Remember me on this device</span>
                        </label>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" className="login-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Signing in…' : 'Login to Dashboard'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;
