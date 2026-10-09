import { useEffect, useState } from 'react';
import {
  COOKIE_CONSENT_EVENT,
  readCookieConsent,
} from '../utils/cookieConsent';

export function useCookieConsent() {
  const [consent, setConsent] = useState(() =>
    typeof window === 'undefined' ? null : readCookieConsent()
  );

  useEffect(() => {
    setConsent(readCookieConsent());
    const onChange = () => setConsent(readCookieConsent());
    window.addEventListener(COOKIE_CONSENT_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  return consent;
}
