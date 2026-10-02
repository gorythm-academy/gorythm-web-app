import { API_BASE_URL } from '../config/constants';
import { getAuthToken, AUTH_REALM, inferAuthRealm } from './authStorage';

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
    if (relative.startsWith('/api/uploads/')) return relative.split('?')[0];
    if (!relative.includes('..')) {
      return `/api/uploads/${relative.replace(/^\//, '')}`.split('?')[0];
    }
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

  const realm = options.realm || inferAuthRealm();
  const token =
    getAuthToken(realm) ||
    getAuthToken(realm === AUTH_REALM.ADMIN ? AUTH_REALM.PORTAL : AUTH_REALM.ADMIN);
  if (!token) return url;

  return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
}

/** Download a protected upload using JWT (falls back to opening in a new tab). */
export async function downloadProtectedUpload(path, options = {}) {
  const href = absFileUrl(path, options);
  if (!href) return;

  const realm = options.realm || inferAuthRealm();
  const token =
    getAuthToken(realm) ||
    getAuthToken(realm === AUTH_REALM.ADMIN ? AUTH_REALM.PORTAL : AUTH_REALM.ADMIN);

  if (token) {
    try {
      const res = await fetch(href, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = uploadDisplayName(path);
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        return;
      }
    } catch {
      /* fall through to open in new tab */
    }
  }

  window.open(href, '_blank', 'noopener,noreferrer');
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
