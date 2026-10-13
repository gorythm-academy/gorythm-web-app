import axios from 'axios';
import { API_BASE_URL } from '../config/constants';
import { buildAuthHeaders, hasAuthSession, AUTH_REALM } from './authStorage';
import { forceAdminLogout } from './adminAuthSession';
import { isAuthSessionRevokedError } from './authLoginErrors';

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

function authHeaders() {
  if (!hasAuthSession(AUTH_REALM.ADMIN)) {
    throw new Error('Not logged in. Please sign in to the admin dashboard again.');
  }
  return buildAuthHeaders(AUTH_REALM.ADMIN);
}

function formatError(err, fallback = 'Request failed') {
  if (err?.response?.data?.error) return String(err.response.data.error);
  if (err?.response?.data?.message) return String(err.response.data.message);
  if (err?.message) return err.message;
  return fallback;
}

async function request(method, path, data) {
  try {
    const config = {
      method,
      url: `${apiBase()}/api/lms-admin${path}`,
      headers: authHeaders(),
    };
    if (data !== undefined) config.data = data;
    config.withCredentials = true;
    const res = await axios(config);
    return res.data;
  } catch (err) {
    if (isAuthSessionRevokedError(err)) {
      forceAdminLogout();
    }
    throw new Error(formatError(err));
  }
}

export const lmsAdminGet = (path) => request('get', path);
export const lmsAdminPost = (path, body) => request('post', path, body);
export const lmsAdminPatch = (path, body) => request('patch', path, body);
export const lmsAdminDelete = (path) => request('delete', path);
