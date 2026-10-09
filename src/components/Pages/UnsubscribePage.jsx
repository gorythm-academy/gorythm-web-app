import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config/constants';
import './LegalPage.scss';

const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState(token ? 'loading' : 'missing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    setStatus('loading');
    fetch(`${API_BASE_URL}/api/subscribers/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok && data.success) {
          setStatus('done');
          setMessage('You have been unsubscribed from Gorythm Academy course updates.');
          return;
        }
        setStatus('error');
        setMessage(data.error || 'This unsubscribe link is not valid.');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          setMessage('Could not unsubscribe right now. Please try again.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <article className="legal-page">
      <div className="legal-page__wrap">
        <p className="legal-page__kicker">Email updates</p>
        <h1 className="legal-page__title">Unsubscribe</h1>
        {status === 'loading' ? <p>Please wait…</p> : null}
        {status === 'missing' ? (
          <p>This unsubscribe link is missing. Use the link in the email we sent you.</p>
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
