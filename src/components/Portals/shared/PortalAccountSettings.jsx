import RequiredMark from '../../shared/RequiredMark';
import React, { useEffect, useState } from 'react';
import { PortalAlert, PortalDataSection, PortalPageHeader } from './PortalUi';
import { changePortalPassword, portalGet, readPortalCache } from './portalApi';
import { StudentProfileFields } from './StudentIdentity';
import { validatePasswordPair } from '../../../utils/studentAdminValidation';
import { parseAuthUser, setAuthUserJson, AUTH_REALM } from '../../../utils/authStorage';
import './PortalAccountSettings.scss';

const PortalAccountSettings = ({ subtitle = 'Update your portal login password.' }) => {
    const user = parseAuthUser(AUTH_REALM.PORTAL) || {};
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [profile, setProfile] = useState(() => readPortalCache('/student/profile')?.profile || null);
    const [profileLoading, setProfileLoading] = useState(user.role === 'student' && !readPortalCache('/student/profile'));
    const [profileError, setProfileError] = useState('');

    useEffect(() => {
        if (user.role !== 'student') return undefined;
        let cancelled = false;
        portalGet('/student/profile')
            .then((res) => {
                if (cancelled) return;
                if (res.success) setProfile(res.profile || null);
                else setProfileError(res.error || 'Could not load your student profile.');
            })
            .catch((err) => {
                if (!cancelled) setProfileError(err.message || 'Could not load your student profile.');
            })
            .finally(() => {
                if (!cancelled) setProfileLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [user.role]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess('');

        const trimmedCurrent = currentPassword.trim();
        if (!trimmedCurrent) {
            setError('Enter your current password.');
            return;
        }

        const passwordErr = validatePasswordPair(newPassword, confirmPassword);
        if (passwordErr) {
            setError(passwordErr);
            return;
        }

        setSubmitting(true);
        try {
            const res = await changePortalPassword({
                currentPassword: trimmedCurrent,
                newPassword,
            });
            if (res.user) {
                setAuthUserJson(JSON.stringify({ ...user, ...res.user, mustChangePassword: false }), AUTH_REALM.PORTAL);
            }
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setSuccess(res.message || 'Password updated successfully.');
        } catch (err) {
            setError(err.message || 'Failed to change password.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="portal-page portal-account-settings">
            <PortalPageHeader title="Account" subtitle={subtitle} />

            {user.role === 'student' ? (
                <div className="portal-panel">
                    <div className="portal-panel__head">
                        <div>
                            <h2>Student profile</h2>
                            <p>These details come from the academy record. Contact the academy to change them.</p>
                        </div>
                    </div>
                    <div className="portal-panel__body portal-panel__body--padded">
                        <PortalDataSection loading={profileLoading} error={profileError} loadingLabel="Loading profile…">
                            <StudentProfileFields profile={profile} />
                        </PortalDataSection>
                    </div>
                </div>
            ) : null}

            <div className="portal-panel portal-account-settings__panel">
                <div className="portal-panel__head">
                    <div>
                        <h2>Change Password</h2>
                        <p>Signed in as {user.email || 'your account'}</p>
                    </div>
                </div>
                <div className="portal-panel__body portal-panel__body--padded">
                    {error ? <PortalAlert type="error">{error}</PortalAlert> : null}
                    {success ? <PortalAlert type="success">{success}</PortalAlert> : null}

                    <form className="portal-account-settings__form" onSubmit={handleSubmit}>
                        <div className="portal-account-settings__field">
                            <label htmlFor="portal-current-password">Current Password <RequiredMark /></label>
                            <div className="portal-account-settings__password-wrap">
                                <input
                                    id="portal-current-password"
                                    type={showCurrent ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    autoComplete="current-password"
                                    disabled={submitting}
                                    required
                                />
                                <button
                                    type="button"
                                    className="portal-account-settings__toggle"
                                    onClick={() => setShowCurrent((v) => !v)}
                                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                >
                                    <i className={`fas ${showCurrent ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden />
                                </button>
                            </div>
                        </div>

                        <div className="portal-account-settings__field">
                            <label htmlFor="portal-new-password">New Password <RequiredMark /></label>
                            <div className="portal-account-settings__password-wrap">
                                <input
                                    id="portal-new-password"
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    autoComplete="new-password"
                                    disabled={submitting}
                                    required
                                />
                                <button
                                    type="button"
                                    className="portal-account-settings__toggle"
                                    onClick={() => setShowNew((v) => !v)}
                                    aria-label={showNew ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                >
                                    <i className={`fas ${showNew ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden />
                                </button>
                            </div>
                        </div>

                        <div className="portal-account-settings__field">
                            <label htmlFor="portal-confirm-password">Confirm New Password <RequiredMark /></label>
                            <div className="portal-account-settings__password-wrap">
                                <input
                                    id="portal-confirm-password"
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    autoComplete="new-password"
                                    disabled={submitting}
                                    required
                                />
                                <button
                                    type="button"
                                    className="portal-account-settings__toggle"
                                    onClick={() => setShowConfirm((v) => !v)}
                                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                                    tabIndex={-1}
                                >
                                    <i className={`fas ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden />
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="portal-account-settings__submit" disabled={submitting}>
                            {submitting ? 'Saving…' : 'Update password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default PortalAccountSettings;
