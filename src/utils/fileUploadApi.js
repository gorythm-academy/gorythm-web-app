import axios from 'axios';
import { API_BASE_URL } from '../config/constants';
import { getAuthToken, AUTH_REALM } from './authStorage';
import { isViewingPortalAsAdmin } from './adminPortalPreview';

function resolveToken(realm) {
  if (isViewingPortalAsAdmin()) return getAuthToken(AUTH_REALM.ADMIN);
  return getAuthToken(realm);
}

/** Upload PDF/image for LMS; returns absolute URL */
export async function uploadLmsFile(file, realm = AUTH_REALM.PORTAL) {
  if (!file) throw new Error('No file selected');
  const form = new FormData();
  form.append('file', file);
  const token = resolveToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  const res = await axios.post(`${base}/api/upload`, form, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const path = res.data?.url;
  if (!path) throw new Error(res.data?.error || 'Upload failed');
  return path.startsWith('http') ? path : `${base}${path}`;
}
