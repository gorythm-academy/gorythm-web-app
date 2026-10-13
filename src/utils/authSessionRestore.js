import axios from 'axios';
import {
  getAuthSession,
  setAuthSession,
  logoutGuardActive,
  COOKIE_SESSION_TOKEN,
  AUTH_REALM,
  buildAuthHeaders,
} from './authStorage';
import { API_BASE_URL } from '../config/constants';

const ADMIN_ROLES = new Set(['manager', 'super-admin']);
const PORTAL_ROLES = new Set(['student', 'teacher', 'parent', 'accountant']);

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

/**
 * New tab with Remember-me off has no sessionStorage flag, but the httpOnly
 * browser-session cookie may still be valid. Probe /api/auth/me and hydrate
 * this tab's sessionStorage when the cookie authenticates.
 *
 * @param {'admin'|'portal'} realm
 * @returns {Promise<{ token: string, user: object }|null>}
 */
export async function restoreSessionFromCookie(realm) {
  if (logoutGuardActive(realm)) return null;
  const existing = getAuthSession(realm);
  if (existing?.token && existing?.user) return existing;

  try {
    const res = await axios.get(`${apiBase()}/api/auth/me`, {
      headers: buildAuthHeaders(realm),
      withCredentials: true,
    });
    // Sign out may have started while /me was in flight.
    if (logoutGuardActive(realm)) return null;
    const live = res.data?.user;
    if (!live) return null;

    if (realm === AUTH_REALM.ADMIN) {
      if (!ADMIN_ROLES.has(live.role)) return null;
    } else if (!PORTAL_ROLES.has(live.role)) {
      return null;
    }

    // Cookie already carries durability; hydrate this tab only (sessionStorage).
    setAuthSession(COOKIE_SESSION_TOKEN, live, false, realm);
    return getAuthSession(realm);
  } catch {
    return null;
  }
}
