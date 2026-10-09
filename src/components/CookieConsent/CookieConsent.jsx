import React from 'react';
import { Link } from 'react-router-dom';
import { useCookieConsent } from '../../hooks/useCookieConsent';
import { writeCookieConsent } from '../../utils/cookieConsent';
import './CookieConsent.scss';

const CookieConsent = () => {
  const consent = useCookieConsent();

  if (consent) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-label="Cookie consent">
      <p>
        We use essential storage for login, checkout, and basic site functions. Stripe checkout may
        set cookies to take payment. YouTube and Vimeo videos load only if you accept.{' '}
        <Link to="/cookies">Cookie policy</Link>
      </p>
      <div className="cookie-consent__actions">
        <button type="button" className="cookie-consent__ghost" onClick={() => writeCookieConsent('essential')}>
          Essential only
        </button>
        <button type="button" className="cookie-consent__ok" onClick={() => writeCookieConsent('all')}>
          Accept
        </button>
      </div>
    </div>
  );
};

export default CookieConsent;
