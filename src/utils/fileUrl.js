import { API_BASE_URL } from '../config/constants';
import { getAuthToken, AUTH_REALM } from './authStorage';

const PROTECTED_UPLOAD_PREFIXES = [
  '/api/uploads/payment-proofs/',
  '/api/uploads/payments/',
  '/api/uploads/assignments/',
  '/api/uploads/quizzes/',
  '/api/uploads/content/',
];

function pathNeedsUploadAuth(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return PROTECTED_UPLOAD_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Extract /api/uploads/… from a stored relative or absolute path. */
export function normalizeStoredUploadPath(path) {
  const raw = String(path || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/api/uploads/')) return raw.split('?')[0];

  const idx = raw.indexOf('/api/uploads/');
  if (idx >= 0) return raw.slice(idx).split('?')[0];

  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    const relative = raw.startsWith('/') ? raw : `/${raw}`;
    return relative.split('?')[0];
  }

  try {
    const url = new URL(raw);
    if (url.pathname.startsWith('/api/uploads/')) return url.pathname;
  } catch {
    /* ignore */
  }

  return '';
}

function appendUploadAuth(url, options = {}) {
  const proofToken = options.proofToken || options.uploadToken;
  if (proofToken) {
    return `${url}${url.includes('?') ? '&' : '?'}proofToken=${encodeURIComponent(proofToken)}`;
  }
  if (typeof window === 'undefined') return url;

  const token = getAuthToken(AUTH_REALM.PORTAL) || getAuthToken(AUTH_REALM.ADMIN);
  if (!token) return url;

  return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
}

/** Turn stored upload path or full URL into a browser-openable link */
export function absFileUrl(path, options = {}) {
  if (!path) return '';

  const stored = String(path).trim();
  const uploadPath = normalizeStoredUploadPath(stored);

  // External link (not our protected upload path)
  if ((stored.startsWith('http://') || stored.startsWith('https://')) && !uploadPath) {
    return stored;
  }

  const relative = uploadPath || (stored.startsWith('/') ? stored.split('?')[0] : `/${stored}`.split('?')[0]);
  const base = (API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    ''
  );
  let url = `${base}${relative.startsWith('/') ? relative : `/${relative}`}`;

  if (pathNeedsUploadAuth(relative)) {
    url = appendUploadAuth(url, options);
  }

  return url;
}

/** Human-readable filename from a stored upload path or URL. */
export function uploadDisplayName(path) {
  const stored = normalizeStoredUploadPath(path) || String(path || '').trim();
  const segment = stored.split('/').pop() || 'File';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
