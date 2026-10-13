import { API_BASE_URL } from '../config/constants';

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

/** Don't block Sign out forever if the server never answers. keepalive still finishes later. */
const LOGOUT_WAIT_MS = 2500;

/**
 * Clear httpOnly auth cookie(s). Uses fetch keepalive so a following
 * navigation cannot abort the logout before Set-Cookie is applied.
 * Resolves when the response arrives, or after LOGOUT_WAIT_MS.
 */
export function clearServerAuthCookie(realm) {
  const body = realm === 'admin' || realm === 'portal' ? { realm } : {};
  const headers = { 'Content-Type': 'application/json' };
  if (realm === 'admin' || realm === 'portal') headers['X-Auth-Realm'] = realm;
  const url = `${apiBase()}/api/auth/logout`;
  const request = fetch(url, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers,
    body: JSON.stringify(body),
  }).catch(() => null);
  return Promise.race([
    request,
    new Promise((resolve) => {
      setTimeout(resolve, LOGOUT_WAIT_MS);
    }),
  ]);
}
