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

/** Turn stored upload path or full URL into a browser-openable link */
export function absFileUrl(path, options = {}) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = (API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    ''
  );
  let url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  if (pathNeedsUploadAuth(path)) {
    const proofToken = options.proofToken || options.uploadToken;
    if (proofToken) {
      url += `${url.includes('?') ? '&' : '?'}proofToken=${encodeURIComponent(proofToken)}`;
    } else if (typeof window !== 'undefined') {
      const token = getAuthToken(AUTH_REALM.PORTAL) || getAuthToken(AUTH_REALM.ADMIN);
      if (token) {
        url += `${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
      }
    }
  }

  return url;
}
