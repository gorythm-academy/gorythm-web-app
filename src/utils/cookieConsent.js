export const COOKIE_CONSENT_STORAGE_KEY = 'gorythm_cookie_consent_v1';
export const COOKIE_CONSENT_EVENT = 'gorythm-cookie-consent';

export function readCookieConsent() {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasMediaConsent() {
  return readCookieConsent()?.media === true;
}

export function writeCookieConsent(choice) {
  const value = {
    essential: true,
    media: choice === 'all',
    choice,
    at: new Date().toISOString(),
  };
  localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(value));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  }
  return value;
}
