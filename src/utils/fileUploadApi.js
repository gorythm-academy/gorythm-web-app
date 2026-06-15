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

/** Upload promo video thumbnail (admin); returns public path e.g. /api/uploads/video-thumbnails/… */
export async function uploadPromoVideoThumbnail(file, replacePath = '', realm = AUTH_REALM.ADMIN) {
  if (!file) throw new Error('No file selected');
  const form = new FormData();
  form.append('file', file);
  if (replacePath) form.append('replacePath', replacePath);
  const token = resolveToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    const res = await axios.post(`${base}/api/admin/promo-videos/thumbnail`, form, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const thumbPath = res.data?.thumbnailPath;
    if (!thumbPath) throw new Error(res.data?.error || 'Upload failed');
    return thumbPath;
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Upload failed';
    throw new Error(msg);
  }
}

/** Delete a thumbnail file only if no video in the library still uses it. */
export async function cleanupPromoVideoThumbnail(thumbnailPath, realm = AUTH_REALM.ADMIN) {
  if (!thumbnailPath) return;
  const token = resolveToken(realm);
  if (!token) return;
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    await axios.post(
      `${base}/api/admin/promo-videos/thumbnail/cleanup`,
      { thumbnailPath },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    /* best-effort */
  }
}

/** Upload course image (admin); returns public path e.g. /api/uploads/courses-images/… */
export async function uploadCourseImage(file, replacePath = '', realm = AUTH_REALM.ADMIN) {
  if (!file) throw new Error('No file selected');
  const form = new FormData();
  form.append('file', file);
  if (replacePath) form.append('replacePath', replacePath);
  const token = resolveToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    const res = await axios.post(`${base}/api/admin/course-images`, form, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const imagePath = res.data?.imagePath;
    if (!imagePath) throw new Error(res.data?.error || 'Upload failed');
    return imagePath;
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Upload failed';
    throw new Error(msg);
  }
}

/** Delete orphan course image when closing form without saving. */
export async function cleanupCourseImage(imagePath, realm = AUTH_REALM.ADMIN) {
  if (!imagePath) return;
  const token = resolveToken(realm);
  if (!token) return;
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    await axios.post(
      `${base}/api/admin/course-images/cleanup`,
      { imagePath },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    /* best-effort */
  }
}

/** Delete course image from gallery (fails if still assigned to a course). */
export async function deleteCourseGalleryImage(imagePath, realm = AUTH_REALM.ADMIN) {
  if (!imagePath) throw new Error('No image path');
  const token = resolveToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  const res = await axios.delete(`${base}/api/admin/course-images`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { imagePath },
  });
  if (!res.data?.success) throw new Error(res.data?.error || 'Delete failed');
}
