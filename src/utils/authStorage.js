/**
 * Two independent sessions: admin dashboard vs LMS portals.
 * JWTs live in httpOnly cookies (+ in-memory for same-tab Bearer).
 * localStorage/sessionStorage keep user profile + session flag only (XSS-safer).
 */

import { clearServerAuthCookie } from './authCookieClient';
// authStorage <-> authSync import each other; both only call the other's functions at runtime
// (never while the module is loading), so the cycle is safe.
import {
  broadcastAuthLogin,
  broadcastAuthLogout,
  isAuthSyncBroadcastSuppressed,
} from './authSync';

export const AUTH_REALM = {
  ADMIN: 'admin',
  PORTAL: 'portal',
};

/** Sentinel: session is cookie-backed; do not send as Bearer. */
export const COOKIE_SESSION_TOKEN = '__cookie_session__';

const ADMIN_ROLES = new Set(['manager', 'super-admin']);
const PREVIEW_SESSION_KEY = 'gorythm_admin_portal_preview';

/** @deprecated legacy single-bucket keys */
const LEGACY_TOKEN = 'token';
const LEGACY_USER = 'user';

/** Blocks cookie restore after Sign out, including when logout is slower than the wait timeout. */
const LOGOUT_GUARD_KEY = 'gorythm_logout_guard';

function readLogoutGuards() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOGOUT_GUARD_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function markLogoutGuard(realm) {
  const guards = readLogoutGuards();
  const stamp = Date.now();
  if (!realm) {
    guards[AUTH_REALM.ADMIN] = stamp;
    guards[AUTH_REALM.PORTAL] = stamp;
  } else {
    guards[realm] = stamp;
  }
  try {
    localStorage.setItem(LOGOUT_GUARD_KEY, JSON.stringify(guards));
  } catch {
    /* private mode */
  }
}

export function logoutGuardActive(realm) {
  const guards = readLogoutGuards();
  if (!realm) return Boolean(guards[AUTH_REALM.ADMIN] || guards[AUTH_REALM.PORTAL]);
  return Boolean(guards[realm]);
}

export function clearLogoutGuard(realm) {
  if (!realm) {
    try {
      localStorage.removeItem(LOGOUT_GUARD_KEY);
    } catch {
      /* private mode */
    }
    return;
  }
  const guards = readLogoutGuards();
  delete guards[realm];
  try {
    if (!guards[AUTH_REALM.ADMIN] && !guards[AUTH_REALM.PORTAL]) {
      localStorage.removeItem(LOGOUT_GUARD_KEY);
    } else {
      localStorage.setItem(LOGOUT_GUARD_KEY, JSON.stringify(guards));
    }
  } catch {
    /* private mode */
  }
}

/** Same-tab Bearer cache (lost on full page reload; cookie remains). */
const memoryTokens = {
  [AUTH_REALM.ADMIN]: null,
  [AUTH_REALM.PORTAL]: null,
};

function realmKeys(realm) {
  return {
    token: `gorythm_${realm}_token`,
    user: `gorythm_${realm}_user`,
    flag: `gorythm_${realm}_session`,
  };
}

function parseUserObject(user) {
  if (!user) return null;
  if (typeof user === 'object') return user;
  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

function clearAdminPortalPreviewFlag() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
  }
}

function resolveRealmStorage(realm) {
  const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);

  for (const storage of [sessionStorage, localStorage]) {
    const user = storage.getItem(userKey);
    if (!user) continue;
    const token = storage.getItem(tokenKey);
    const flag = storage.getItem(flagKey);
    // Cookie-primary: user + flag. Legacy: user + token.
    if (flag === '1' || token) return storage;
  }

  return null;
}

function readSessionFromStorage(storage, realm) {
  const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);
  const rawUser = storage.getItem(userKey);
  if (!rawUser) return null;
  try {
    const user = JSON.parse(rawUser);
    if (!user || typeof user !== 'object') return null;
    const legacyToken = storage.getItem(tokenKey);
    const flag = storage.getItem(flagKey) === '1';
    const memory = memoryTokens[realm] || null;
    const token = memory || legacyToken || (flag ? COOKIE_SESSION_TOKEN : null);
    if (!token) return null;
    return { token, user };
  } catch {
    return null;
  }
}

/** One-time migration from old shared token/user keys. */
function migrateLegacyAuth() {
  const legacyToken = localStorage.getItem(LEGACY_TOKEN) || sessionStorage.getItem(LEGACY_TOKEN);
  const legacyUser =
    localStorage.getItem(LEGACY_USER) || sessionStorage.getItem(LEGACY_USER);
  if (!legacyToken || !legacyUser) return;

  let user;
  try {
    user = JSON.parse(legacyUser);
  } catch {
    localStorage.removeItem(LEGACY_TOKEN);
    localStorage.removeItem(LEGACY_USER);
    sessionStorage.removeItem(LEGACY_TOKEN);
    sessionStorage.removeItem(LEGACY_USER);
    return;
  }

  const realm = user?.role && ADMIN_ROLES.has(user.role) ? AUTH_REALM.ADMIN : AUTH_REALM.PORTAL;
  if (!resolveRealmStorage(realm)) {
    const fromLocal = !!localStorage.getItem(LEGACY_TOKEN);
    const storage = fromLocal ? localStorage : sessionStorage;
    const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);
    // Keep legacy token until next login; also set flag for cookie era.
    storage.setItem(tokenKey, legacyToken);
    storage.setItem(userKey, legacyUser);
    storage.setItem(flagKey, '1');
    memoryTokens[realm] = legacyToken;
  }

  localStorage.removeItem(LEGACY_TOKEN);
  localStorage.removeItem(LEGACY_USER);
  sessionStorage.removeItem(LEGACY_TOKEN);
  sessionStorage.removeItem(LEGACY_USER);
}

/**
 * Move any persisted JWT into memory and keep only user + session flag in storage.
 * Durable auth is the httpOnly cookie; web storage must not hold JWTs.
 */
function liftLegacyTokenToMemory(realm) {
  const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);
  for (const storage of [sessionStorage, localStorage]) {
    const legacy = storage.getItem(tokenKey);
    const user = storage.getItem(userKey);
    if (!legacy || !user) continue;
    if (legacy !== COOKIE_SESSION_TOKEN && !memoryTokens[realm]) {
      memoryTokens[realm] = legacy;
    }
    storage.setItem(flagKey, '1');
    storage.removeItem(tokenKey);
  }
}

function reconcileRealmStorage(realm) {
  const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);
  liftLegacyTokenToMemory(realm);

  for (const storage of [sessionStorage, localStorage]) {
    const token = storage.getItem(tokenKey);
    const user = storage.getItem(userKey);
    const flag = storage.getItem(flagKey);
    if (user && !token && flag !== '1') {
      storage.removeItem(userKey);
    }
    if (!user && (token || flag)) {
      storage.removeItem(tokenKey);
      storage.removeItem(flagKey);
    }
  }

  const active = resolveRealmStorage(realm);
  if (!active) return;

  const inactive = active === sessionStorage ? localStorage : sessionStorage;
  inactive.removeItem(tokenKey);
  inactive.removeItem(userKey);
  inactive.removeItem(flagKey);
}

function hasSessionFlag(realm) {
  const { flag: flagKey, user: userKey } = realmKeys(realm);
  for (const storage of [sessionStorage, localStorage]) {
    if (storage.getItem(userKey) && storage.getItem(flagKey) === '1') return true;
  }
  return false;
}

function writeSession(storage, realm, token, userStr) {
  const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);
  storage.setItem(userKey, userStr);
  storage.setItem(flagKey, '1');
  // Never persist JWT in web storage (XSS). Durable auth is the httpOnly cookie;
  // memory holds Bearer only for this tab until reload.
  localStorage.removeItem(tokenKey);
  sessionStorage.removeItem(tokenKey);
  if (token && token !== COOKIE_SESSION_TOKEN) {
    memoryTokens[realm] = token;
  } else {
    // Cookie-only session: drop any older in-memory Bearer so it cannot override the fresh cookie.
    memoryTokens[realm] = null;
  }
}

/** Keep the current session storage (remember-me or this tab) and swap in a fresh token. */
export function replaceAuthSession(token, user, realm = AUTH_REALM.PORTAL) {
  const storage = resolveRealmStorage(realm) || sessionStorage;
  const userObj = parseUserObject(user);
  const userStr = userObj ? JSON.stringify(userObj) : JSON.stringify(user);
  writeSession(storage, realm, token, userStr);
}

export function setAuthSession(token, user, rememberMe, realm = AUTH_REALM.PORTAL) {
  const userObj = parseUserObject(user);
  const userStr = userObj ? JSON.stringify(userObj) : typeof user === 'string' ? user : JSON.stringify(user);
  const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);
  const persist = Boolean(rememberMe);

  if (realm === AUTH_REALM.PORTAL) {
    clearAdminPortalPreviewFlag();
  }

  // A real login (not a cookie hydrate) ends the post-logout restore block.
  if (token !== COOKIE_SESSION_TOKEN) {
    clearLogoutGuard(realm);
  }

  if (persist) {
    writeSession(localStorage, realm, token, userStr);
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
    sessionStorage.removeItem(flagKey);
  } else {
    writeSession(sessionStorage, realm, token, userStr);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    localStorage.removeItem(flagKey);
  }

  try {
    if (!isAuthSyncBroadcastSuppressed()) {
      const id = userObj?.id || userObj?._id || '';
      broadcastAuthLogin(realm, id);
    }
  } catch {
    /* sync optional at boot */
  }
}

/**
 * After a successful login the server has set the httpOnly cookie and returns only the user.
 * Store the user + session flag and end the post-logout restore block.
 */
export function startCookieSession(user, rememberMe, realm = AUTH_REALM.PORTAL) {
  clearLogoutGuard(realm);
  setAuthSession(COOKIE_SESSION_TOKEN, user, rememberMe, realm);
}

/** After a password change the server re-issued the cookie; keep the same storage and refresh the user. */
export function refreshCookieSession(user, realm = AUTH_REALM.PORTAL) {
  replaceAuthSession(COOKIE_SESSION_TOKEN, user, realm);
}

export function inferAuthRealm() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return AUTH_REALM.ADMIN;
  }
  return AUTH_REALM.PORTAL;
}

/**
 * Auth credential for request builders.
 * - Real JWT when available in memory (or legacy storage during migration)
 * - COOKIE_SESSION_TOKEN sentinel when only httpOnly cookie + session flag exist
 *   (truthy so legacy `if (!token)` checks pass; must be stripped before send)
 * - null when logged out
 */
export function getAuthToken(realm = inferAuthRealm()) {
  migrateLegacyAuth();
  reconcileRealmStorage(realm);
  if (memoryTokens[realm]) return memoryTokens[realm];
  const { token: tokenKey } = realmKeys(realm);
  const legacy = sessionStorage.getItem(tokenKey) || localStorage.getItem(tokenKey);
  if (legacy) return legacy;
  if (hasSessionFlag(realm)) return COOKIE_SESSION_TOKEN;
  return null;
}

/** True when a portal/admin session exists (Bearer and/or httpOnly cookie). */
export function hasAuthSession(realm = inferAuthRealm()) {
  const { user } = getAuthSession(realm);
  return Boolean(user && getAuthToken(realm));
}

/** Headers for API calls: realm hint + Bearer only when a real JWT is in memory. */
export function buildAuthHeaders(realm = inferAuthRealm(), extra = {}) {
  const headers = {
    'X-Auth-Realm': realm === AUTH_REALM.ADMIN ? 'admin' : 'portal',
    ...extra,
  };
  const token = getAuthToken(realm);
  if (token && token !== COOKIE_SESSION_TOKEN) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function isCookieSessionToken(token) {
  return token === COOKIE_SESSION_TOKEN;
}

export function getAuthUserJson(realm = inferAuthRealm()) {
  migrateLegacyAuth();
  reconcileRealmStorage(realm);
  const storage = resolveRealmStorage(realm);
  return storage?.getItem(realmKeys(realm).user) || null;
}

export function parseAuthUser(realm = inferAuthRealm()) {
  const raw = getAuthUserJson(realm);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    return user && typeof user === 'object' ? user : null;
  } catch {
    return null;
  }
}

/**
 * @param {'admin'|'portal'} realm
 */
export function getAuthSession(realm) {
  migrateLegacyAuth();
  reconcileRealmStorage(realm);
  const storage = resolveRealmStorage(realm);
  if (!storage) return { token: null, user: null };
  return readSessionFromStorage(storage, realm) || { token: null, user: null };
}

export function isRememberedSession(realm = AUTH_REALM.PORTAL) {
  migrateLegacyAuth();
  reconcileRealmStorage(realm);
  return resolveRealmStorage(realm) === localStorage;
}

export function setAuthUserJson(userStr, realm = inferAuthRealm()) {
  const storage = resolveRealmStorage(realm);
  if (storage) {
    storage.setItem(realmKeys(realm).user, userStr);
  }
}

function wipeRealm(realm) {
  const { token: tokenKey, user: userKey, flag: flagKey } = realmKeys(realm);
  memoryTokens[realm] = null;
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  localStorage.removeItem(flagKey);
  sessionStorage.removeItem(tokenKey);
  sessionStorage.removeItem(userKey);
  sessionStorage.removeItem(flagKey);
}

/**
 * Wipe client session storage only (no cookie clear, no cross-tab broadcast).
 * Used when another tab already cleared the httpOnly cookie.
 * @param {'admin'|'portal'} [realm] — omit to clear both
 */
export function clearAuthSessionLocal(realm) {
  if (!realm) {
    clearAdminPortalPreviewFlag();
    wipeRealm(AUTH_REALM.ADMIN);
    wipeRealm(AUTH_REALM.PORTAL);
    localStorage.removeItem(LEGACY_TOKEN);
    localStorage.removeItem(LEGACY_USER);
    sessionStorage.removeItem(LEGACY_TOKEN);
    sessionStorage.removeItem(LEGACY_USER);
    return;
  }
  if (realm === AUTH_REALM.PORTAL) {
    clearAdminPortalPreviewFlag();
  }
  wipeRealm(realm);
}

/**
 * Clear the httpOnly cookie first, then local session + cross-tab notice.
 * Callers that redirect must await this so restore-from-cookie cannot revive the session.
 * @param {'admin'|'portal'} [realm] — omit to clear both sessions (full sign-out)
 * @returns {Promise<void>}
 */
export function clearAuthSession(realm) {
  markLogoutGuard(realm);
  const cookieDone = realm ? clearServerAuthCookie(realm) : clearServerAuthCookie();
  return Promise.resolve(cookieDone)
    .catch(() => null)
    .then(() => {
      clearAuthSessionLocal(realm);
      try {
        if (!isAuthSyncBroadcastSuppressed()) {
          broadcastAuthLogout(realm || 'all');
        }
      } catch {
        /* sync optional at boot */
      }
    });
}
