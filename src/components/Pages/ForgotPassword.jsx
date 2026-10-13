import RequiredMark from '../shared/RequiredMark';
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../../config/constants';
import { getLoginFormError } from '../../utils/authLoginErrors';
import BrandLogo from '../BrandLogo/BrandLogo';
import './Login.scss';

const ForgotPassword = () => {
    const [searchParams] = useSearchParams();
    const fromAdmin = searchParams.get('from') === 'admin';
    const backTo = fromAdmin ? '/admin/login' : '/login';
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const title = useMemo(
        () => (fromAdmin ? 'Reset admin password' : 'Reset portal password'),
        [fromAdmin]
    );

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');
        const trimmed = email.trim();
        if (!trimmed) {
            setError('Enter the email on the account.');
            return;
        }
        try {
            setIsSubmitting(true);
            const response = await axios.post(`${API_BASE_URL}/api/auth/forgot-password`, { email: trimmed });
            setMessage(response.data?.message || 'If an account uses that email, we sent a reset link.');
            setEmail('');
        } catch (err) {
            setError(getLoginFormError(err, 'Please try again later.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={`auth-login${fromAdmin ? ' auth-login--admin' : ''}`}>
            <div className="auth-login__center">
                <Link to={backTo} className="auth-login__back">
                    ← Back to sign in
                </Link>
                <div className="auth-login__card">
                    <header className="auth-login__brand">
                        <Link to="/" className="auth-login__logo-link" aria-label="Gorythm Academy home">
                            <BrandLogo className="auth-login__logo" alt="" width={180} height={48} />
                        </Link>
                        <h1 className="auth-login__title">{title}</h1>
                        <p className="auth-login__subtitle">
                            Use the portal username or the personal email saved on the account. The link is sent to the personal inbox when one is on file.
                        </p>
                    </header>
                    {message ? (
                        <p className="auth-login__note" role="status">{message}</p>
                    ) : (
                        <form className="auth-login__form" onSubmit={handleSubmit} noValidate>
                            <div className="auth-login__field">
                                <label className="auth-login__label" htmlFor="forgot-email">
                                    Email <RequiredMark />
                                </label>
                                <div className="auth-login__input-wrap">
                                    <input
                                        id="forgot-email"
                                        className="auth-login__input"
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="Portal username or personal email"
                                        autoComplete="username"
                                        required
                                    />
                                </div>
                            </div>
                            {error ? <div className="auth-login__error">{error}</div> : null}
                            <button type="submit" className="auth-login__submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Sending…' : 'Send reset link'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
