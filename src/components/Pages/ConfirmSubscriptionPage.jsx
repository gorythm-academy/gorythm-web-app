import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import './LegalPage.scss';

const ConfirmSubscriptionPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState(token ? 'ready' : 'missing');
  const [message, setMessage] = useState('');

  const confirm = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribers/confirm-resubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setStatus('done');
        setMessage(data.message || 'You are subscribed to course updates again.');
        return;
      }
      setStatus('error');
      setMessage(data.error || 'This confirmation link is not valid or has expired.');
    } catch {
      setStatus('error');
      setMessage('Could not confirm right now. Please try again.');
    }
  };

  return (
    <article className="legal-page">
      <div className="legal-page__wrap">
        <p className="legal-page__kicker">Email updates</p>
        <h1 className="legal-page__title">Confirm course updates</h1>
        {status === 'missing' ? (
          <p>This confirmation link is missing. Use the link in the email we sent you.</p>
        ) : null}
        {status === 'ready' || status === 'loading' ? (
          <>
            <p>Course updates stay off until you confirm this address.</p>
            <p>
              <button type="button" className="legal-page__button" onClick={confirm} disabled={status === 'loading'}>
                {status === 'loading' ? 'Confirming…' : 'Turn updates back on'}
              </button>
            </p>
          </>
        ) : null}
        {status === 'done' || status === 'error' ? <p>{message}</p> : null}
        <p className="legal-page__contact">
          <Link to="/">Home</Link>
          {' · '}
          <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
        </p>
      </div>
    </article>
  );
};

export default ConfirmSubscriptionPage;
