import axios from 'axios';
import {
  getAuthToken,
  getAuthSession,
  hasAuthSession,
  clearAuthSession,
  setAuthUserJson,
  buildAuthHeaders,
  AUTH_REALM,
} from './authStorage';
import { API_BASE_URL } from '../config/constants';
import { isAuthSessionRevokedError } from './authLoginErrors';

const PORTAL_ROLES = new Set(['student', 'teacher', 'parent', 'accountant']);
const VERIFY_CACHE_MS = 60_000;

let loggingOut = false;
let interceptorInstalled = false;
let verifiedAt = 0;
let verifiedUserId = null;

export function invalidatePortalSessionVerifyCache() {
  verifiedAt = 0;
  verifiedUserId = null;
}

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

function isPortalAppPath() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname || '';
  return (
    path.startsWith('/student') ||
    path.startsWith('/teacher') ||
    path.startsWith('/parent') ||
    path.startsWith('/accountant')
  );
}

function isPortalLoginPath() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname || '';
  return path === '/login' || path.startsWith('/login?');
}

/** True when a failed API call was made under an active portal session (Bearer or cookie). */
function shouldForcePortalLogout(err) {
  if (!isAuthSessionRevokedError(err)) return false;
  if (!hasAuthSession(AUTH_REALM.PORTAL)) return false;
  const url = String(err?.config?.url || '');
  if (!url.includes('/api/')) return false;
  if (url.includes('/api/auth/login') || url.includes('/api/auth/admin-login')) return false;
  return true;
}

export function forcePortalLogout({ redirect = true } = {}) {
  if (loggingOut) return Promise.resolve();
  loggingOut = true;
  invalidatePortalSessionVerifyCache();
  return clearAuthSession(AUTH_REALM.PORTAL).finally(() => {
    if (redirect && typeof window !== 'undefined' && isPortalAppPath()) {
      window.location.assign('/login');
      return;
    }
    loggingOut = false;
  });
}

export function installPortalAuthInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;

  axios.interceptors.response.use(
    (response) => response,
    (err) => {
      if (isPortalAppPath() && shouldForcePortalLogout(err)) {
        forcePortalLogout({ redirect: true });
      }
      return Promise.reject(err);
    }
  );
}

export async function verifyPortalSession() {
  const { token, user: stored } = getAuthSession(AUTH_REALM.PORTAL);
  if (!token || !stored) return null;

  try {
    const res = await axios.get(`${apiBase()}/api/auth/me`, {
      headers: buildAuthHeaders(AUTH_REALM.PORTAL),
      withCredentials: true,
    });

    const live = res.data?.user;
    if (!live || !PORTAL_ROLES.has(live.role)) {
      invalidatePortalSessionVerifyCache();
      await clearAuthSession(AUTH_REALM.PORTAL);
      return null;
    }

    const merged = {
      ...stored,
      ...live,
      id: live.id || live._id || stored.id,
      mustChangePassword: !!live.mustChangePassword,
    };
    setAuthUserJson(JSON.stringify(merged), AUTH_REALM.PORTAL);
    verifiedAt = Date.now();
    verifiedUserId = String(merged.id || '');
    return merged;
  } catch (err) {
    if (isAuthSessionRevokedError(err)) {
      invalidatePortalSessionVerifyCache();
      await clearAuthSession(AUTH_REALM.PORTAL);
      return null;
    }
    throw err;
  }
}

/** Cached /me check for ProtectedRoute (avoids hitting the API on every nav). */
export async function ensurePortalSessionVerified() {
  const { token, user } = getAuthSession(AUTH_REALM.PORTAL);
  if (!token || !user) return null;
  const uid = String(user.id || user._id || '');
  if (verifiedUserId && verifiedUserId === uid && Date.now() - verifiedAt < VERIFY_CACHE_MS) {
    return user;
  }
  return verifyPortalSession();
}

export function getPortalAuthToken() {
  return getAuthToken(AUTH_REALM.PORTAL);
}

export { isPortalLoginPath };
