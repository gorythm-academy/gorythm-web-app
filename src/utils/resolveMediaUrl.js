import { API_BASE_URL } from '../config/constants';

/**
 * Turn API-relative upload paths into URLs that work in <img src>.
 * Uploads under /api/uploads/ use the page origin in the browser so the CRA
 * dev proxy (localhost:3000 → backend) serves images; avoids cross-port CORP issues.
 */
export function resolveMediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;

  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (typeof window !== 'undefined' && normalized.startsWith('/api/uploads/')) {
    return `${window.location.origin}${normalized}`;
  }

  const base = (API_BASE_URL || '').replace(/\/$/, '');
  if (!base) return normalized;
  return `${base}${normalized}`;
}
