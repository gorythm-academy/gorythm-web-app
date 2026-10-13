import axios from 'axios';
import {
  inferAuthRealm,
  AUTH_REALM,
  COOKIE_SESSION_TOKEN,
  isCookieSessionToken,
} from './authStorage';

let installed = false;

function headerGet(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  if (typeof headers.get === 'function') {
    const v = headers.get(name);
    if (v != null && v !== '') return v;
  }
  return headers[name] || headers[name.toLowerCase()] || undefined;
}

function headerSet(headers, name, value) {
  if (!headers || typeof headers !== 'object') return;
  if (typeof headers.set === 'function') {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
}

function headerDelete(headers, name) {
  if (!headers || typeof headers !== 'object') return;
  if (typeof headers.delete === 'function') {
    headers.delete(name);
  }
  delete headers[name];
  delete headers[name.toLowerCase()];
}

function stripCookieSessionBearer(headers) {
  if (!headers || typeof headers !== 'object') return;
  const value = String(headerGet(headers, 'Authorization') || '').trim();
  const bearer = value.replace(/^Bearer\s+/i, '').trim();
  if (
    !value ||
    !bearer ||
    bearer === COOKIE_SESSION_TOKEN ||
    bearer === 'null' ||
    bearer === 'undefined' ||
    isCookieSessionToken(bearer)
  ) {
    headerDelete(headers, 'Authorization');
  }
}

/** Send cookies on API calls; strip sentinel Bearer; tag auth realm. */
export function installAuthHttpDefaults() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  axios.defaults.withCredentials = true;

  axios.interceptors.request.use((config) => {
    config.withCredentials = true;
    const headers = config.headers || {};
    // Always ensure realm for cookie-primary /api/auth/* (strict server reader).
    if (!headerGet(headers, 'X-Auth-Realm')) {
      const realm = inferAuthRealm();
      headerSet(headers, 'X-Auth-Realm', realm === AUTH_REALM.ADMIN ? 'admin' : 'portal');
    }
    stripCookieSessionBearer(headers);
    config.headers = headers;
    return config;
  });
}

export { isCookieSessionToken };
