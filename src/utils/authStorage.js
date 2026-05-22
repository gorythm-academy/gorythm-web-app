/**
 * Two independent sessions: admin dashboard vs LMS portals.
 * Logging into one does not clear the other.
 */

export const AUTH_REALM = {
  ADMIN: 'admin',
  PORTAL: 'portal',
};

const ADMIN_ROLES = new Set(['admin', 'super-admin']);
const PREVIEW_SESSION_KEY = 'gorythm_admin_portal_preview';

/** @deprecated legacy single-bucket keys */
const LEGACY_TOKEN = 'token';
const LEGACY_USER = 'user';

function realmKeys(realm) {
  return {
    token: `gorythm_${realm}_token`,
    user: `gorythm_${realm}_user`,
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
  const { token: tokenKey, user: userKey } = realmKeys(realm);

  const sessionToken = sessionStorage.getItem(tokenKey);
  const sessionUser = sessionStorage.getItem(userKey);
  if (sessionToken && sessionUser) return sessionStorage;

  const localToken = localStorage.getItem(tokenKey);
  const localUser = localStorage.getItem(userKey);
  if (localToken && localUser) return localStorage;

  return null;
}

function readSessionFromStorage(storage, realm) {
  const { token: tokenKey, user: userKey } = realmKeys(realm);
  const token = storage.getItem(tokenKey);
  const rawUser = storage.getItem(userKey);
  if (!token || !rawUser) return null;
  try {
    const user = JSON.parse(rawUser);
    if (!user || typeof user !== 'object') return null;
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
    const { token: tokenKey, user: userKey } = realmKeys(realm);
    storage.setItem(tokenKey, legacyToken);
    storage.setItem(userKey, legacyUser);
  }

  localStorage.removeItem(LEGACY_TOKEN);
  localStorage.removeItem(LEGACY_USER);
  sessionStorage.removeItem(LEGACY_TOKEN);
  sessionStorage.removeItem(LEGACY_USER);
}

function reconcileRealmStorage(realm) {
  const { token: tokenKey, user: userKey } = realmKeys(realm);

  for (const storage of [sessionStorage, localStorage]) {
    const token = storage.getItem(tokenKey);
    const user = storage.getItem(userKey);
    if ((token && !user) || (!token && user)) {
      storage.removeItem(tokenKey);
      storage.removeItem(userKey);
    }
  }

  const active = resolveRealmStorage(realm);
  if (!active) return;

  const inactive = active === sessionStorage ? localStorage : sessionStorage;
  const activeToken = active.getItem(tokenKey);
  const inactiveToken = inactive.getItem(tokenKey);
  if (inactiveToken && inactiveToken !== activeToken) {
    inactive.removeItem(tokenKey);
    inactive.removeItem(userKey);
  } else if (!inactiveToken && inactive.getItem(userKey)) {
    inactive.removeItem(userKey);
  }
}

/**
 * @param {'admin'|'portal'} realm
 */
export function setAuthSession(token, user, rememberMe, realm = AUTH_REALM.PORTAL) {
  const userObj = parseUserObject(user);
  const userStr = userObj ? JSON.stringify(userObj) : typeof user === 'string' ? user : JSON.stringify(user);
  const { token: tokenKey, user: userKey } = realmKeys(realm);
  const persist =
    rememberMe || (realm === AUTH_REALM.ADMIN && userObj?.role && ADMIN_ROLES.has(userObj.role));

  if (realm === AUTH_REALM.PORTAL) {
    clearAdminPortalPreviewFlag();
  }

  if (persist) {
    localStorage.setItem(tokenKey, token);
    localStorage.setItem(userKey, userStr);
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
  } else {
    sessionStorage.setItem(tokenKey, token);
    sessionStorage.setItem(userKey, userStr);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
  }
}

/**
 * @param {'admin'|'portal'} [realm] — defaults from URL (/admin → admin)
 */
export function inferAuthRealm() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return AUTH_REALM.ADMIN;
  }
  return AUTH_REALM.PORTAL;
}

export function getAuthToken(realm = inferAuthRealm()) {
  migrateLegacyAuth();
  reconcileRealmStorage(realm);
  const storage = resolveRealmStorage(realm);
  return storage?.getItem(realmKeys(realm).token) || null;
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

export function setAuthUserJson(userStr, realm = inferAuthRealm()) {
  const storage = resolveRealmStorage(realm);
  if (storage) {
    storage.setItem(realmKeys(realm).user, userStr);
  }
}

/**
 * @param {'admin'|'portal'} [realm] — omit to clear both sessions (full sign-out)
 */
export function clearAuthSession(realm) {
  if (!realm) {
    clearAdminPortalPreviewFlag();
    for (const r of [AUTH_REALM.ADMIN, AUTH_REALM.PORTAL]) {
      const { token: tokenKey, user: userKey } = realmKeys(r);
      localStorage.removeItem(tokenKey);
      localStorage.removeItem(userKey);
      sessionStorage.removeItem(tokenKey);
      sessionStorage.removeItem(userKey);
    }
    localStorage.removeItem(LEGACY_TOKEN);
    localStorage.removeItem(LEGACY_USER);
    sessionStorage.removeItem(LEGACY_TOKEN);
    sessionStorage.removeItem(LEGACY_USER);
    return;
  }

  if (realm === AUTH_REALM.PORTAL) {
    clearAdminPortalPreviewFlag();
  }

  const { token: tokenKey, user: userKey } = realmKeys(realm);
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  sessionStorage.removeItem(tokenKey);
  sessionStorage.removeItem(userKey);
}

export function reconcileAuthStorage() {
  migrateLegacyAuth();
  reconcileRealmStorage(AUTH_REALM.ADMIN);
  reconcileRealmStorage(AUTH_REALM.PORTAL);
}
