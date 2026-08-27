import axios from 'axios';
import { API_BASE_URL } from '../config/constants';
import { getAuthToken, AUTH_REALM } from './authStorage';
import { compressImageForUpload, IMAGE_UPLOAD_PRESETS } from './compressImageForUpload';
import {
  cleanupAdminMedia,
  deleteAdminMedia,
  fetchAdminMediaGallery,
  MEDIA_CATEGORY,
} from './mediaApi';

function uploadTooLargeMessage() {
  return 'Image is too large to upload. It will be resized automatically — try again, or use a smaller file.';
}

/** Upload PDF/image for LMS; returns absolute URL */
export async function uploadLmsFile(file, category = 'assignments', realm = AUTH_REALM.PORTAL) {
  if (!file) throw new Error('No file selected');
  const prepared = String(file.type || '').startsWith('image/')
    ? await compressImageForUpload(file, IMAGE_UPLOAD_PRESETS.lms)
    : file;
  const form = new FormData();
  form.append('file', prepared);
  form.append('category', category);
  const token = getAuthToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    const res = await axios.post(`${base}/api/upload`, form, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const path = res.data?.url;
    if (!path) throw new Error(res.data?.error || 'Upload failed');
    return path.startsWith('http') ? path : `${base}${path}`;
  } catch (err) {
    if (err.response?.status === 413) {
      throw new Error(uploadTooLargeMessage());
    }
    const msg = err.response?.data?.error || err.message || 'Upload failed';
    throw new Error(msg);
  }
}

/** True if the field holds an uploaded URL or a file waiting to upload on submit. */
export function hasLmsUploadValue(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.some((item) => hasLmsUploadValue(item));
  if (typeof value === 'string') return value.trim().length > 0;
  if (value?.defer && value?.file) return true;
  return false;
}

/** Upload pending files on submit; pass through existing URL strings unchanged. */
export async function resolveLmsUploadList(values, category = 'assignments', realm = AUTH_REALM.PORTAL) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const resolved = [];
  for (const item of list) {
    const url = await resolveLmsUploadValue(item, category, realm);
    if (url) resolved.push(url);
  }
  return resolved;
}

/** Upload pending file on submit; pass through existing URL strings unchanged. */
export async function resolveLmsUploadValue(value, category = 'assignments', realm = AUTH_REALM.PORTAL) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (value?.defer && value?.file) {
    return uploadLmsFile(value.file, category, realm);
  }
  return '';
}

/** Upload promo video thumbnail (admin); returns public path e.g. /api/uploads/video-thumbnails/… */
export async function uploadPromoVideoThumbnail(file, replacePath = '', realm = AUTH_REALM.ADMIN) {
  if (!file) throw new Error('No file selected');
  const prepared = await compressImageForUpload(file, IMAGE_UPLOAD_PRESETS.promoThumbnail);
  const form = new FormData();
  form.append('file', prepared);
  if (replacePath) form.append('replacePath', replacePath);
  const token = getAuthToken(realm);
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
    if (err.response?.status === 413) {
      throw new Error(uploadTooLargeMessage());
    }
    const msg = err.response?.data?.error || err.message || 'Upload failed';
    throw new Error(msg);
  }
}

/** Delete a thumbnail file only if no video in the library still uses it. */
export async function cleanupPromoVideoThumbnail(thumbnailPath, realm = AUTH_REALM.ADMIN) {
  return cleanupAdminMedia(MEDIA_CATEGORY.VIDEO_THUMBNAILS, thumbnailPath, realm);
}

/** List promo video thumbnails on the server (admin gallery). */
export async function fetchPromoThumbnailGallery(realm = AUTH_REALM.ADMIN) {
  return fetchAdminMediaGallery(MEDIA_CATEGORY.VIDEO_THUMBNAILS, realm);
}

/** Permanently delete a thumbnail file from uploads/video-thumbnails. */
export async function deletePromoThumbnailGalleryImage(
  thumbnailPath,
  { force = false } = {},
  realm = AUTH_REALM.ADMIN
) {
  return deleteAdminMedia(MEDIA_CATEGORY.VIDEO_THUMBNAILS, thumbnailPath, { force }, realm);
}

/** Upload course image (admin); returns public path e.g. /api/uploads/courses-images/… */
export async function uploadCourseImage(file, replacePath = '', filename = '', realm = AUTH_REALM.ADMIN) {
  if (!file) throw new Error('No file selected');
  const prepared = await compressImageForUpload(file, IMAGE_UPLOAD_PRESETS.course);
  const form = new FormData();
  if (filename) form.append('filename', filename);
  if (replacePath) form.append('replacePath', replacePath);
  form.append('file', prepared);
  const token = getAuthToken(realm);
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
    if (err.response?.status === 413) {
      throw new Error(uploadTooLargeMessage());
    }
    const msg = err.response?.data?.error || err.message || 'Upload failed';
    throw new Error(msg);
  }
}

/** Delete orphan course image when closing form without saving. */
export async function cleanupCourseImage(imagePath, realm = AUTH_REALM.ADMIN) {
  return cleanupAdminMedia(MEDIA_CATEGORY.COURSES, imagePath, realm);
}

/** Rename course image file on disk (updates all courses using that path). */
export async function renameCourseImage(imagePath, filename, realm = AUTH_REALM.ADMIN) {
  if (!imagePath || !filename) throw new Error('imagePath and filename are required');
  const token = getAuthToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    const res = await axios.post(
      `${base}/api/admin/course-images/rename`,
      { imagePath, filename },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const newPath = res.data?.imagePath;
    if (!newPath) throw new Error(res.data?.error || 'Rename failed');
    return newPath;
  } catch (err) {
    const msg = err.response?.data?.error || err.message || 'Rename failed';
    throw new Error(msg);
  }
}

/** List course images on the server (admin gallery). */
export async function fetchCourseGalleryImages(realm = AUTH_REALM.ADMIN) {
  return fetchAdminMediaGallery(MEDIA_CATEGORY.COURSES, realm);
}

/** Delete course image from gallery (force detaches courses still using it). */
export async function deleteCourseGalleryImage(
  imagePath,
  { excludeCourseId = null, force = false, realm = AUTH_REALM.ADMIN } = {}
) {
  return deleteAdminMedia(
    MEDIA_CATEGORY.COURSES,
    imagePath,
    { force, excludeCourseId },
    realm
  );
}

/** Upload research cover image (admin); returns public path e.g. /api/uploads/research-images/… */
export async function uploadResearchImage(file, replacePath = '', filename = '', realm = AUTH_REALM.ADMIN) {
  if (!file) throw new Error('No file selected');
  const prepared = await compressImageForUpload(file, IMAGE_UPLOAD_PRESETS.research);
  const form = new FormData();
  if (filename) form.append('filename', filename);
  if (replacePath) form.append('replacePath', replacePath);
  form.append('file', prepared);
  const token = getAuthToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  try {
    const res = await axios.post(`${base}/api/admin/research-images`, form, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const imagePath = res.data?.imagePath;
    if (!imagePath) throw new Error(res.data?.error || 'Upload failed');
    return imagePath;
  } catch (err) {
    if (err.response?.status === 413) {
      throw new Error(uploadTooLargeMessage());
    }
    const msg = err.response?.data?.error || err.message || 'Upload failed';
    throw new Error(msg);
  }
}

/** Delete orphan research image when closing form without saving. */
export async function cleanupResearchImage(imagePath, realm = AUTH_REALM.ADMIN) {
  return cleanupAdminMedia(MEDIA_CATEGORY.RESEARCH, imagePath, realm);
}

/** List research cover images on the server (admin gallery). */
export async function fetchResearchGalleryImages(realm = AUTH_REALM.ADMIN) {
  return fetchAdminMediaGallery(MEDIA_CATEGORY.RESEARCH, realm);
}

/** Delete research image from gallery (force detaches articles still using it). */
export async function deleteResearchGalleryImage(
  imagePath,
  { force = false, realm = AUTH_REALM.ADMIN } = {}
) {
  return deleteAdminMedia(MEDIA_CATEGORY.RESEARCH, imagePath, { force }, realm);
}

/** Rename research image file on server. */
export async function renameResearchImage(imagePath, filename, realm = AUTH_REALM.ADMIN) {
  if (!imagePath || !filename) throw new Error('imagePath and filename are required');
  const token = getAuthToken(realm);
  if (!token) throw new Error('Not logged in');
  const base = (API_BASE_URL || '').replace(/\/$/, '');
  const res = await axios.post(
    `${base}/api/admin/research-images/rename`,
    { imagePath, filename },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const newPath = res.data?.imagePath;
  if (!newPath) throw new Error(res.data?.error || 'Rename failed');
  return newPath;
}

