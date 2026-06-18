import axios from 'axios';
import { getAuthToken, clearAuthSession, AUTH_REALM } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';

function buildHeaders() {
  const headers = {};
  const token = getAuthToken(AUTH_REALM.PORTAL);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function apiBase() {
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  return base;
}

export function getPortalErrorMessage(err, fallback = 'Request failed') {
  if (!err) return fallback;
  if (err.response?.data?.error) return String(err.response.data.error);
  if (err.response?.data?.message) return String(err.response.data.message);
  if (err.response?.status === 403) {
    return 'Access denied. Log in with the correct portal role.';
  }
  if (err.response?.status === 401) return 'Session expired. Please log in again.';
  if (err.code === 'ERR_NETWORK' || !err.response) {
    const base = apiBase() || window.location.origin;
    return `Cannot reach API (${base || 'server'}). Start the backend and check REACT_APP_API_URL.`;
  }
  return err.message || fallback;
}

function handleUnauthorized(status) {
  if (status !== 401 || typeof window === 'undefined') return;
  const path = window.location.pathname || '';
  if (
    path.startsWith('/student') ||
    path.startsWith('/teacher') ||
    path.startsWith('/parent') ||
    path.startsWith('/accountant')
  ) {
    clearAuthSession(AUTH_REALM.PORTAL);
    window.location.assign('/login');
  }
}

async function request(method, url, body) {
  try {
    const config = { method, url, headers: buildHeaders() };
    if (body !== undefined) config.data = body;
    const res = await axios(config);
    return res.data;
  } catch (err) {
    handleUnauthorized(err.response?.status);
    const wrapped = new Error(getPortalErrorMessage(err));
    wrapped.cause = err;
    wrapped.status = err.response?.status;
    throw wrapped;
  }
}

export async function portalGet(path) {
  return request('get', `${apiBase()}/api/portal${path}`);
}

export async function portalPost(path, body) {
  return request('post', `${apiBase()}/api/portal${path}`, body);
}

export async function portalPatch(path, body) {
  return request('patch', `${apiBase()}/api/portal${path}`, body);
}

export async function portalDelete(path) {
  return request('delete', `${apiBase()}/api/portal${path}`);
}

export async function payrollGet(path) {
  return request('get', `${apiBase()}/api/portal/accountant/payroll${path}`);
}

export async function payrollPost(path, body) {
  return request('post', `${apiBase()}/api/portal/accountant/payroll${path}`, body);
}

export async function payrollPatch(path, body) {
  return request('patch', `${apiBase()}/api/portal/accountant/payroll${path}`, body);
}

export async function payrollDelete(path) {
  return request('delete', `${apiBase()}/api/portal/accountant/payroll${path}`);
}

export const FEE_LABELS = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
};

/** Current month as YYYY-MM for `<input type="month">` */
export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
