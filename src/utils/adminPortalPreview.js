import { parseAuthUser, AUTH_REALM } from './authStorage';

const ADMIN_ROLES = ['super-admin', 'admin'];
const PREVIEW_SESSION_KEY = 'gorythm_admin_portal_preview';

/**
 * When true, admins see LMS portal shortcuts in the sidebar and on the dashboard.
 * Set REACT_APP_ADMIN_PORTAL_PREVIEW=false before `npm run build` to hide on production.
 */
export function isAdminPortalPreviewEnabled() {
  const v = (process.env.REACT_APP_ADMIN_PORTAL_PREVIEW || '').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'no') return false;
  if (v === 'true' || v === '1' || v === 'on' || v === 'yes') return true;
  return true;
}

export function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

export function setAdminPortalPreviewActive(active) {
  if (typeof sessionStorage === 'undefined') return;
  if (active) {
    sessionStorage.setItem(PREVIEW_SESSION_KEY, '1');
  } else {
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
  }
}

export function clearAdminPortalPreview() {
  setAdminPortalPreviewActive(false);
}

/**
 * True only when admin opened a portal from the admin sidebar (explicit preview),
 * not when a student/teacher logged in via /login.
 */
export function isViewingPortalAsAdmin() {
  if (typeof sessionStorage === 'undefined') return false;
  if (sessionStorage.getItem(PREVIEW_SESSION_KEY) !== '1') return false;
  const u = parseAuthUser(AUTH_REALM.ADMIN);
  return u ? isAdminRole(u.role) : false;
}
