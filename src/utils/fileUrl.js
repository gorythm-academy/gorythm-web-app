import { API_BASE_URL } from '../config/constants';

/** Turn stored upload path or full URL into a browser-openable link */
export function absFileUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = (API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/$/,
    ''
  );
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
