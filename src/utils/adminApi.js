import axios from 'axios';
import { buildAuthHeaders, AUTH_REALM } from './authStorage';
import { API_BASE_URL } from '../config/constants';
import { forceAdminLogout } from './adminAuthSession';
import { isAuthSessionRevokedError } from './authLoginErrors';

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

export function getAdminErrorMessage(err, fallback = 'Request failed') {
  if (!err) return fallback;
  if (err.response?.data?.error) return String(err.response.data.error);
  if (err.response?.data?.message) return String(err.response.data.message);
  if (err.response?.status === 401) return 'Session expired. Please log in again.';
  if (err.response?.status === 403) return 'Access denied.';
  if (err.code === 'ERR_NETWORK' || !err.response) {
    return `Cannot reach API (${apiBase() || 'server'}). Check that the backend is running.`;
  }
  return err.message || fallback;
}

function handleUnauthorized(err) {
  if (!isAuthSessionRevokedError(err)) return;
  forceAdminLogout();
}

export async function adminRequest(method, url, body, config = {}) {
  const headers = { ...buildAuthHeaders(AUTH_REALM.ADMIN), ...(config.headers || {}) };

  try {
    const res = await axios({
      method,
      url,
      data: body,
      ...config,
      headers,
      withCredentials: true,
    });
    return res;
  } catch (err) {
    handleUnauthorized(err);
    const wrapped = new Error(getAdminErrorMessage(err));
    wrapped.cause = err;
    wrapped.status = err.response?.status;
    throw wrapped;
  }
}

function adminApiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${apiBase()}/api/admin${normalized}`;
}

async function adminApiDataRequest(method, path, body, config) {
  const res = await adminRequest(method, adminApiUrl(path), body, config);
  return res.data;
}

export const adminApiGet = (path, config) => adminApiDataRequest('get', path, undefined, config);
export const adminApiPost = (path, body, config) => adminApiDataRequest('post', path, body, config);
export const adminApiPatch = (path, body, config) => adminApiDataRequest('patch', path, body, config);
export const adminApiDelete = (path, config) => adminApiDataRequest('delete', path, undefined, config);
