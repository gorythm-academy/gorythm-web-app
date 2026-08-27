import axios from 'axios';
import { API_BASE_URL } from '../config/constants';
import { getAuthToken, AUTH_REALM } from './authStorage';

export const MEDIA_CATEGORY = {
  COURSES: 'courses-images',
  VIDEO_THUMBNAILS: 'video-thumbnails',
  RESEARCH: 'research-images',
  SUBSCRIBE_POPUP: 'subscribe-popup-images',
};

function apiBase() {
  return (API_BASE_URL || '').replace(/\/$/, '');
}

function requireToken(realm = AUTH_REALM.ADMIN) {
  const token = getAuthToken(realm);
  if (!token) throw new Error('Not logged in');
  return token;
}

/** List images for a media category (admin gallery). */
export async function fetchAdminMediaGallery(category, realm = AUTH_REALM.ADMIN) {
  const token = requireToken(realm);
  const res = await axios.get(`${apiBase()}/api/admin/media`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { category },
  });
  return res.data?.images || [];
}

/** Delete a file only when no record still references it. */
export async function cleanupAdminMedia(category, path, realm = AUTH_REALM.ADMIN) {
  if (!path) return;
  const token = getAuthToken(realm);
  if (!token) return;
  try {
    await axios.post(
      `${apiBase()}/api/admin/media/cleanup`,
      { category, path },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    /* best-effort */
  }
}

/** Permanently delete a media file; optional force detaches DB references first. */
export async function deleteAdminMedia(
  category,
  path,
  { force = false, excludeCourseId = null } = {},
  realm = AUTH_REALM.ADMIN
) {
  if (!path) return;
  const token = requireToken(realm);
  try {
    const res = await axios.post(
      `${apiBase()}/api/admin/media/delete`,
      {
        category,
        path,
        ...(force ? { force: '1' } : {}),
        ...(excludeCourseId ? { excludeCourseId } : {}),
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.data?.success === false) {
      throw new Error(res.data?.error || 'Delete failed');
    }
    return res.data;
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Delete failed';
    const error = new Error(msg);
    error.inUse = Boolean(err.response?.data?.inUse);
    error.status = err.response?.status;
    error.usedByTitles = err.response?.data?.usedByTitles || [];
    throw error;
  }
}
