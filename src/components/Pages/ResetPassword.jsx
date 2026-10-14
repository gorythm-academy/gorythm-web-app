import RequiredMark from '../shared/RequiredMark';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../../config/constants';
import { validatePasswordPair } from '../../utils/studentAdminValidation';
import { getLoginFormError } from '../../utils/authLoginErrors';
import BrandLogo from '../BrandLogo/BrandLogo';
import './Login.scss';

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [canSignIn, setCanSignIn] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!done) return;
        document.title = 'Password updated | Gorythm Academy';
    }, [done]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        const passwordErr = validatePasswordPair(newPassword, confirmPassword, { required: true });
        if (passwordErr) {
            setError(passwordErr);
            return;
        }
        if (!token) {
            setError('This reset link is missing. Request a new one.');
            return;
        }
        try {
            setIsSubmitting(true);
            const response = await axios.post(`${API_BASE_URL}/api/auth/reset-password`, {
                token,
                newPassword,
            });
            const message = response.data?.message || '';
            setCanSignIn(!/sets this account to Active/i.test(message));
            setDone(true);
        } catch (err) {
            setError(getLoginFormError(err, 'This reset link is not valid or has expired.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-login">
            <div className="auth-login__center">
                <Link to="/login" className="auth-login__back">
                    ← Back to sign in
                </Link>
                <div className="auth-login__card">
                    <header className="auth-login__brand">
                        <Link to="/" className="auth-login__logo-link" aria-label="Gorythm Academy home">
                            <BrandLogo className="auth-login__logo" alt="" width={180} height={48} />
                        </Link>
                        {done ? (
                            <h1 className="auth-login__title">Password updated</h1>
                        ) : (
                            <>
                                <h1 className="auth-login__title">Choose a new password</h1>
                                <p className="auth-login__subtitle">
                                    Sign in afterwards with the username from your academy email, not the inbox that received this link.
                                </p>
                            </>
                        )}
                    </header>
                    {done ? (
                        <div className="auth-login__form">
                            <p className="auth-login__note" role="status">
                                {canSignIn
                                    ? 'Sign in with the username from your academy email, not the inbox that received this link.'
                                    : 'You can sign in once the academy sets this account to Active.'}
                            </p>
                            {canSignIn ? (
                                <Link to="/login" className="auth-login__submit">
                                    Sign in
                                </Link>
                            ) : null}
                        </div>
                    ) : (
                        <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="reset-new-password">
                                    New password <RequiredMark />
                                </label>
                                <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                    <input
                                        id="reset-new-password"
                                        className="auth-login__input"
                                        type={showNew ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        placeholder="At least 8 characters"
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-login__password-toggle"
                                        onClick={() => setShowNew((value) => !value)}
                                        aria-label={showNew ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fas ${showNew ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="reset-confirm-password">
                                    Confirm password <RequiredMark />
                                </label>
                                <div className="auth-login__input-wrap auth-login__input-wrap--password">
                                    <input
                                        id="reset-confirm-password"
                                        className="auth-login__input"
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        placeholder="Re-enter password"
                                        autoComplete="new-password"
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-login__password-toggle"
                                        onClick={() => setShowConfirm((value) => !value)}
                                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                                    >
                                        <i className={`fas ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            {error ? <div className="auth-login__error">{error}</div> : null}
                            <button type="submit" className="auth-login__submit" disabled={isSubmitting || !token}>
                                {isSubmitting ? 'Saving…' : 'Update password'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
