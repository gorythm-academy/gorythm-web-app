import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './NotFoundPage.scss';

export default function NotFoundPage() {
  useEffect(() => {
    let el = document.querySelector('meta[name="robots"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    const previous = el.getAttribute('content') || '';
    el.setAttribute('content', 'noindex');
    return () => {
      if (previous) el.setAttribute('content', previous);
      else el.remove();
    };
  }, []);

  return (
    <section className="not-found-page scheme_dark">
      <div className="not-found-page__inner">
        <p className="not-found-page__code" aria-hidden="true">404</p>
        <h1 className="not-found-page__title">Page Not Found</h1>
        <p className="not-found-page__text">
          This link may be outdated or mistyped. Try the homepage or browse our courses.
        </p>
        <div className="not-found-page__actions">
          <Link to="/" className="not-found-page__link">Go to Homepage</Link>
          <Link to="/courses" className="not-found-page__link not-found-page__link--secondary">
            Browse Courses
          </Link>
        </div>
      </div>
    </section>
  );
}
