import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LEGAL_CONTACT_EMAIL, LEGAL_LAST_UPDATED, getLegalDocument } from '../../content/legalDocuments';
import NotFoundPage from './NotFoundPage';
import './LegalPage.scss';

const NAV = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/refunds', label: 'Refund Policy' },
  { to: '/cookies', label: 'Cookie Policy' },
];

const LegalPage = ({ slug }) => {
  const { hash } = useLocation();
  const doc = getLegalDocument(slug);

  useEffect(() => {
    if (!hash) return undefined;
    const id = hash.replace('#', '');
    const el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return undefined;
  }, [hash, slug]);

  if (!doc) return <NotFoundPage />;

  return (
    <article className="legal-page">
      <div className="legal-page__wrap">
        <p className="legal-page__kicker">Legal</p>
        <h1 className="legal-page__title">{doc.title}</h1>
        <p className="legal-page__updated">Last updated {LEGAL_LAST_UPDATED}</p>

        <nav className="legal-page__switch" aria-label="Legal documents">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={item.to === doc.path ? 'is-active' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {doc.sections.map((section) => (
          <section key={section.heading} id={section.id} className="legal-page__section">
            <h2>{section.heading}</h2>
            {section.paragraphs.map((text, index) => (
              <p key={`${section.heading}-${index}`}>{text}</p>
            ))}
          </section>
        ))}

        <p className="legal-page__contact">
          Questions: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
          {' · '}
          <Link to="/contact">Contact form</Link>
          {' · '}
          <Link to="/privacy#deletion">Data deletion</Link>
        </p>
      </div>
    </article>
  );
};

export default LegalPage;
