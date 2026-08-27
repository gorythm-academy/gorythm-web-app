import axios from 'axios';
import { API_BASE_URL } from '../config/constants';
import { getAuthToken, AUTH_REALM } from './authStorage';
import { compressImageForUpload, IMAGE_UPLOAD_PRESETS } from './compressImageForUpload';

const BASE = '/api/admin/subscribe-popup';

function apiRoot() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

function authHeaders(realm = AUTH_REALM.ADMIN) {
  const token = getAuthToken(realm);
  if (!token) throw new Error('Not logged in');
  return { Authorization: `Bearer ${token}` };
}

function extractError(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback;
}

export async function fetchSubscribePopupSettings(realm = AUTH_REALM.ADMIN) {
  const res = await axios.get(`${apiRoot()}${BASE}/settings`, {
    headers: authHeaders(realm),
  });
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to load popup settings');
  return res.data.popup || {};
}

export async function saveSubscribePopupSettings(form, realm = AUTH_REALM.ADMIN) {
  const res = await axios.post(`${apiRoot()}${BASE}/settings`, form, {
    headers: authHeaders(realm),
  });
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to save popup settings');
  return res.data.popup || {};
}

export async function fetchSubscribePopupGallery(realm = AUTH_REALM.ADMIN) {
  const res = await axios.get(`${apiRoot()}${BASE}/gallery`, {
    headers: authHeaders(realm),
  });
  if (!res.data?.success) throw new Error(res.data?.error || 'Failed to load gallery');
  return res.data.images || [];
}

export async function uploadSubscribePopupImage(file, realm = AUTH_REALM.ADMIN) {
  if (!file) throw new Error('No file selected');
  const prepared = await compressImageForUpload(file, IMAGE_UPLOAD_PRESETS.subscribePopup);
  const form = new FormData();
  form.append('file', prepared);
  try {
    const res = await axios.post(`${apiRoot()}${BASE}/upload`, form, {
      headers: authHeaders(realm),
    });
    const imagePath = res.data?.imagePath;
    if (!imagePath) throw new Error(res.data?.error || 'Upload failed');
    return imagePath;
  } catch (err) {
    if (err.response?.status === 413) {
      throw new Error('Image is too large to upload. Try a smaller file.');
    }
    throw new Error(extractError(err, 'Upload failed'));
  }
}

export async function deleteSubscribePopupGalleryImage(
  imagePath,
  { force = false } = {},
  realm = AUTH_REALM.ADMIN
) {
  if (!imagePath) return;
  try {
    const res = await axios.post(
      `${apiRoot()}${BASE}/gallery/delete`,
      { path: imagePath, ...(force ? { force: '1' } : {}) },
      { headers: authHeaders(realm) }
    );
    if (res.data?.success === false) {
      throw new Error(res.data?.error || 'Delete failed');
    }
    return res.data;
  } catch (err) {
    const error = new Error(extractError(err, 'Delete failed'));
    error.inUse = Boolean(err.response?.data?.inUse);
    throw error;
  }
}

export async function checkSubscribePopupAdminApi(realm = AUTH_REALM.ADMIN) {
  try {
    const res = await axios.get(`${apiRoot()}${BASE}/health`);
    return res.data?.success === true;
  } catch {
    return false;
  }
}
