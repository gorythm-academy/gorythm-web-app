import axios from 'axios';
import { API_BASE_URL } from '../config/constants';
import { getAuthToken, AUTH_REALM } from './authStorage';

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

function authHeaders() {
  const token = getAuthToken(AUTH_REALM.ADMIN);
  if (!token) {
    throw new Error('Not logged in. Please sign in to the admin dashboard again.');
  }
  return { Authorization: `Bearer ${token}` };
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
    const res = await axios(config);
    return res.data;
  } catch (err) {
    throw new Error(formatError(err));
  }
}

export const lmsAdminGet = (path) => request('get', path);
export const lmsAdminPost = (path, body) => request('post', path, body);
export const lmsAdminPatch = (path, body) => request('patch', path, body);
export const lmsAdminDelete = (path) => request('delete', path);
