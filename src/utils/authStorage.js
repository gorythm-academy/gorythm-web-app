/**
 * Session vs persistent auth: "Remember me" uses localStorage; otherwise sessionStorage
 * (clears when the browser tab/session ends). Token reads must use these helpers everywhere.
 */

export function setAuthSession(token, user, rememberMe) {
  const userStr = typeof user === 'string' ? user : JSON.stringify(user);
  if (rememberMe) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', userStr);
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  } else {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', userStr);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}

export function getAuthToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

export function getAuthUserJson() {
  return sessionStorage.getItem('user') || localStorage.getItem('user');
}

export function setAuthUserJson(userStr) {
  if (sessionStorage.getItem('token')) {
    sessionStorage.setItem('user', userStr);
  } else if (localStorage.getItem('token')) {
    localStorage.setItem('user', userStr);
  }
}

export function clearAuthSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}
