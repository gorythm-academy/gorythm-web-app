import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import './LegalPage.scss';

const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState(token ? 'ready' : 'missing');
  const [message, setMessage] = useState('');

  const confirm = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/subscribers/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setStatus('done');
        setMessage('You have been unsubscribed from Gorythm Academy course updates.');
        return;
      }
      setStatus('error');
      setMessage(data.error || 'This unsubscribe link is not valid.');
    } catch {
      setStatus('error');
      setMessage('Could not unsubscribe right now. Please try again.');
    }
  };

  return (
    <article className="legal-page">
      <div className="legal-page__wrap">
        <p className="legal-page__kicker">Email updates</p>
        <h1 className="legal-page__title">Unsubscribe</h1>
        {status === 'missing' ? (
          <p>This unsubscribe link is missing. Use the link in the email we sent you.</p>
        ) : null}
        {status === 'ready' || status === 'loading' ? (
          <>
            <p>Course updates will stop after you confirm. Payment and account emails are not affected.</p>
            <p>
              <button type="button" className="legal-page__button" onClick={confirm} disabled={status === 'loading'}>
                {status === 'loading' ? 'Unsubscribing…' : 'Confirm unsubscribe'}
              </button>
            </p>
          </>
        ) : null}
        {status === 'done' || status === 'error' ? <p>{message}</p> : null}
        <p className="legal-page__contact">
          <Link to="/">Home</Link>
          {' · '}
          <Link to="/privacy">Privacy Policy</Link>
        </p>
      </div>
    </article>
  );
};

export default UnsubscribePage;
