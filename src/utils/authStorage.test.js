import {
  AUTH_REALM,
  COOKIE_SESSION_TOKEN,
  buildAuthHeaders,
  clearAuthSessionLocal,
  getAuthSession,
  getAuthToken,
  logoutGuardActive,
  markLogoutGuard,
  refreshCookieSession,
  setAuthSession,
  startCookieSession,
} from './authStorage';

const user = { id: 'u1', role: 'student', name: 'Amina' };

afterEach(() => {
  clearAuthSessionLocal();
  localStorage.clear();
  sessionStorage.clear();
});

describe('cookie-only sessions', () => {
  test('a login stores the user and a session flag, never a JWT', () => {
    startCookieSession(user, false, AUTH_REALM.PORTAL);
    expect(getAuthToken(AUTH_REALM.PORTAL)).toBe(COOKIE_SESSION_TOKEN);
    expect(getAuthSession(AUTH_REALM.PORTAL).user).toMatchObject({ id: 'u1' });
    const stored = [...Object.keys(sessionStorage), ...Object.keys(localStorage)];
    expect(stored.some((key) => key.endsWith('_token'))).toBe(false);
  });

  test('requests carry the realm header and no Authorization header', () => {
    startCookieSession(user, true, AUTH_REALM.PORTAL);
    const headers = buildAuthHeaders(AUTH_REALM.PORTAL);
    expect(headers['X-Auth-Realm']).toBe('portal');
    expect(headers.Authorization).toBeUndefined();
  });

  test('logging in again clears the sign-out guard', () => {
    markLogoutGuard(AUTH_REALM.ADMIN);
    expect(logoutGuardActive(AUTH_REALM.ADMIN)).toBe(true);
    startCookieSession({ ...user, role: 'manager' }, false, AUTH_REALM.ADMIN);
    expect(logoutGuardActive(AUTH_REALM.ADMIN)).toBe(false);
  });

  test('refreshing after a password change drops an older Bearer token', () => {
    setAuthSession('old.jwt.value', user, false, AUTH_REALM.PORTAL);
    expect(buildAuthHeaders(AUTH_REALM.PORTAL).Authorization).toBe('Bearer old.jwt.value');
    refreshCookieSession({ ...user, name: 'Amina K' }, AUTH_REALM.PORTAL);
    expect(buildAuthHeaders(AUTH_REALM.PORTAL).Authorization).toBeUndefined();
    expect(getAuthSession(AUTH_REALM.PORTAL).user.name).toBe('Amina K');
  });
});
