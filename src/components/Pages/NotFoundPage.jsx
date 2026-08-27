import React from 'react';
import { Link } from 'react-router-dom';
import './NotFoundPage.scss';

export default function NotFoundPage() {
  return (
    <section className="not-found-page scheme_dark">
      <div className="not-found-page__inner">
        <p className="not-found-page__code" aria-hidden="true">404</p>
        <h1 className="not-found-page__title">Page not found</h1>
        <p className="not-found-page__text">
          This link may be outdated or mistyped. Try the homepage or browse our courses.
        </p>
        <div className="not-found-page__actions">
          <Link to="/" className="not-found-page__link">Go to homepage</Link>
          <Link to="/courses" className="not-found-page__link not-found-page__link--secondary">
            Browse courses
          </Link>
        </div>
      </div>
    </section>
  );
}
