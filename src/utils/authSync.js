/**
 * Cross-tab auth sync: logout in one tab clears the others immediately.
 * Uses BroadcastChannel when available, with a localStorage ping fallback.
 */

const AUTH_REALM = { ADMIN: 'admin', PORTAL: 'portal' };

const SYNC_KEY = 'gorythm_auth_sync';
const CHANNEL_NAME = 'gorythm-auth';

const TAB_ID = `t_${Math.random().toString(36).slice(2)}_${Date.now()}`;

let channel = null;
let installed = false;
let suppressBroadcast = false;

function getChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      channel = null;
    }
  }
  return channel;
}

function isPortalAppPath(path) {
  return (
    path.startsWith('/student') ||
    path.startsWith('/teacher') ||
    path.startsWith('/parent') ||
    path.startsWith('/accountant')
  );
}

/**
 * Apply a logout that originated in another tab (cookie already cleared there).
 * @param {'admin'|'portal'|'all'|null|undefined} realm
 */
export function applyRemoteAuthLogout(realm) {
  // Lazy import to avoid circular init with authStorage ↔ authSync
  const {
    clearAuthSessionLocal,
  } = require('./authStorage');
  const { invalidateAdminSessionVerifyCache } = require('./adminAuthSession');
  const { invalidatePortalSessionVerifyCache } = require('./portalAuthSession');

  suppressBroadcast = true;
  try {
    invalidateAdminSessionVerifyCache();
    invalidatePortalSessionVerifyCache();
    if (!realm || realm === 'all') {
      clearAuthSessionLocal();
    } else if (realm === AUTH_REALM.ADMIN || realm === AUTH_REALM.PORTAL) {
      clearAuthSessionLocal(realm);
    }
  } finally {
    suppressBroadcast = false;
  }

  if (typeof window === 'undefined') return;
  const path = window.location.pathname || '';
  if (
    (realm === AUTH_REALM.ADMIN || realm === 'all' || !realm) &&
    path.startsWith('/admin') &&
    !path.startsWith('/admin/login')
  ) {
    window.location.assign('/admin/login');
    return;
  }
  if (
    (realm === AUTH_REALM.PORTAL || realm === 'all' || !realm) &&
    isPortalAppPath(path)
  ) {
    window.location.assign('/login');
  }
}

export function broadcastAuthLogout(realm) {
  if (suppressBroadcast || typeof window === 'undefined') return;
  const payload = {
    type: 'logout',
    realm: realm || 'all',
    sourceTabId: TAB_ID,
    t: Date.now(),
  };
  writeSyncPayload(payload);
  try {
    getChannel()?.postMessage(payload);
  } catch {
    /* ignore */
  }
}

/** Leave the key in place. Deleting it in the same turn drops the storage event in some browsers. */
function writeSyncPayload(payload) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
}

/**
 * Another tab signed in (possibly as a different user). Drop the verify cache
 * and reload this tab when the signed-in id changed so UI cannot stay stale.
 */
export function applyRemoteAuthLogin(realm, userId) {
  const { getAuthSession } = require('./authStorage');
  const { invalidateAdminSessionVerifyCache } = require('./adminAuthSession');
  const { invalidatePortalSessionVerifyCache } = require('./portalAuthSession');
  invalidateAdminSessionVerifyCache();
  invalidatePortalSessionVerifyCache();
  if (typeof window === 'undefined') return;
  const path = window.location.pathname || '';
  const inAdmin = path.startsWith('/admin') && !path.startsWith('/admin/login');
  const inPortal = isPortalAppPath(path);
  const relevant =
    (realm === AUTH_REALM.ADMIN && inAdmin) ||
    (realm === AUTH_REALM.PORTAL && inPortal);
  if (!relevant) return;
  const local = getAuthSession(realm)?.user;
  const localId = local?.id || local?._id || '';
  if (localId && userId && String(localId) === String(userId)) return;
  window.location.reload();
}

export function broadcastAuthLogin(realm, userId) {
  if (suppressBroadcast || typeof window === 'undefined') return;
  const payload = {
    type: 'login',
    realm: realm || 'portal',
    userId: userId ? String(userId) : '',
    sourceTabId: TAB_ID,
    t: Date.now(),
  };
  writeSyncPayload(payload);
  try {
    getChannel()?.postMessage(payload);
  } catch {
    /* ignore */
  }
}

function handleSyncPayload(payload) {
  if (!payload || payload.sourceTabId === TAB_ID) return;
  if (payload.type === 'logout') {
    applyRemoteAuthLogout(payload.realm);
    return;
  }
  if (payload.type === 'login') {
    applyRemoteAuthLogin(payload.realm, payload.userId);
  }
}

/** Install once at app boot. */
export function installAuthSyncListener() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const ch = getChannel();
  if (ch) {
    ch.onmessage = (ev) => handleSyncPayload(ev?.data);
  }

  window.addEventListener('storage', (ev) => {
    if (ev.key !== SYNC_KEY || !ev.newValue) return;
    try {
      handleSyncPayload(JSON.parse(ev.newValue));
    } catch {
      /* ignore */
    }
  });
}

export function isAuthSyncBroadcastSuppressed() {
  return suppressBroadcast;
}
