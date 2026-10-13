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

const ADMIN_ROLES = new Set(['manager', 'super-admin']);
const VERIFY_CACHE_MS = 60_000;

let loggingOut = false;
let interceptorInstalled = false;
let verifiedAt = 0;
let verifiedUserId = null;

export function invalidateAdminSessionVerifyCache() {
  verifiedAt = 0;
  verifiedUserId = null;
}

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

function isAdminAppPath() {
  if (typeof window === 'undefined') return false;
  return (window.location.pathname || '').startsWith('/admin');
}

function isAdminLoginPath() {
  if (typeof window === 'undefined') return false;
  return (window.location.pathname || '').startsWith('/admin/login');
}

/** True when a failed API call was made under an active admin session (Bearer or cookie). */
function shouldForceAdminLogout(err) {
  if (!isAuthSessionRevokedError(err)) return false;
  if (!hasAuthSession(AUTH_REALM.ADMIN)) return false;
  const url = String(err?.config?.url || '');
  if (!url.includes('/api/')) return false;
  if (url.includes('/api/auth/login') || url.includes('/api/auth/admin-login')) return false;
  return true;
}

/**
 * Clear admin session once, then redirect to login (unless already there).
 * Safe to call from multiple 401 handlers concurrently.
 */
export function forceAdminLogout({ redirect = true } = {}) {
  if (loggingOut) return Promise.resolve();
  loggingOut = true;
  invalidateAdminSessionVerifyCache();
  // Cookie must be cleared before navigation, or restoreSessionFromCookie signs the user back in.
  return clearAuthSession(AUTH_REALM.ADMIN).finally(() => {
    if (
      redirect &&
      typeof window !== 'undefined' &&
      isAdminAppPath() &&
      !isAdminLoginPath()
    ) {
      window.location.assign('/admin/login');
      return;
    }
    loggingOut = false;
  });
}

/**
 * Global axios interceptor: 401 / session-revoked 403 on /admin/*
 * clears the admin session and redirects once (cookie or Bearer).
 */
export function installAdminAuthInterceptor() {
  if (interceptorInstalled || typeof window === 'undefined') return;
  interceptorInstalled = true;

  axios.interceptors.response.use(
    (response) => response,
    (err) => {
      if (isAdminAppPath() && shouldForceAdminLogout(err)) {
        forceAdminLogout({ redirect: !isAdminLoginPath() });
      }
      return Promise.reject(err);
    }
  );
}

/**
 * Ask the server if the stored admin token is still valid.
 * - null: no session or invalid (storage cleared)
 * - user: valid dashboard role
 * Throws on network / server errors (caller should not auto-enter dashboard).
 */
export async function verifyAdminSession() {
  const { token, user: stored } = getAuthSession(AUTH_REALM.ADMIN);
  if (!token || !stored) return null;

  try {
    const res = await axios.get(`${apiBase()}/api/auth/me`, {
      headers: buildAuthHeaders(AUTH_REALM.ADMIN),
      withCredentials: true,
    });

    const live = res.data?.user;
    if (!live || !ADMIN_ROLES.has(live.role)) {
      invalidateAdminSessionVerifyCache();
      await clearAuthSession(AUTH_REALM.ADMIN);
      return null;
    }

    const merged = {
      ...stored,
      ...live,
      id: live.id || live._id || stored.id,
      mustChangePassword: !!live.mustChangePassword,
    };
    setAuthUserJson(JSON.stringify(merged), AUTH_REALM.ADMIN);
    verifiedAt = Date.now();
    verifiedUserId = String(merged.id || '');
    return merged;
  } catch (err) {
    if (isAuthSessionRevokedError(err)) {
      invalidateAdminSessionVerifyCache();
      await clearAuthSession(AUTH_REALM.ADMIN);
      return null;
    }
    throw err;
  }
}

/** Cached /me check for ProtectedRoute (avoids hitting the API on every nav). */
export async function ensureAdminSessionVerified() {
  const { token, user } = getAuthSession(AUTH_REALM.ADMIN);
  if (!token || !user) return null;
  const uid = String(user.id || user._id || '');
  if (verifiedUserId && verifiedUserId === uid && Date.now() - verifiedAt < VERIFY_CACHE_MS) {
    return user;
  }
  return verifyAdminSession();
}

export function getAdminAuthToken() {
  return getAuthToken(AUTH_REALM.ADMIN);
}
