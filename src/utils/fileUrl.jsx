import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/constants';
import {
  getAuthToken,
  buildAuthHeaders,
  isCookieSessionToken,
  AUTH_REALM,
  inferAuthRealm,
} from './authStorage';

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
  return url;
}

const fileLinkCache = new Map();

function authTokenFor(options = {}) {
  const realm = options.realm || inferAuthRealm();
  const primary = getAuthToken(realm);
  if (primary || options.realm) return primary;
  // Only cross-fallback when caller did not pin a realm.
  return getAuthToken(realm === AUTH_REALM.ADMIN ? AUTH_REALM.PORTAL : AUTH_REALM.ADMIN);
}

/**
 * Rewrite protected /api/uploads URLs inside HTML (img/src, a/href) to short-lived
 * authorized links so inline content does not rely on headerless dual-cookie heuristics.
 */
export async function authorizeHtmlUploadUrls(html, options = {}) {
  const source = String(html || '');
  if (!source.includes('/api/uploads/')) return source;

  const realm = options.realm || inferAuthRealm();
  const re = /\b(src|href)=["']([^"']*\/api\/uploads\/[^"']+)["']/gi;
  const found = new Map();
  let match;
  while ((match = re.exec(source)) !== null) {
    const rawUrl = match[2];
    const stored = normalizeStoredUploadPath(rawUrl);
    if (!stored || !pathNeedsUploadAuth(stored)) continue;
    if (!found.has(rawUrl)) found.set(rawUrl, stored);
  }
  if (!found.size) return source;

  let out = source;
  for (const [rawUrl, stored] of found) {
    const authorized = await fileAccessUrl(stored, { realm });
    if (authorized) {
      out = out.split(rawUrl).join(authorized);
    }
  }
  return out;
}

/** Short-lived link for one protected file. The login token is not put in the address. */
export async function fileAccessUrl(path, options = {}) {
  const plain = absFileUrl(path, { ...options, proofToken: options.proofToken, uploadToken: options.uploadToken });
  if (!plain || !pathNeedsUploadAuth(normalizeStoredUploadPath(path) || path) || options.proofToken || options.uploadToken) {
    return plain;
  }
  const cached = fileLinkCache.get(plain);
  if (cached && cached.expiresAt > Date.now() + 15000) return cached.url;
  const token = authTokenFor(options);
  if (!token) return plain;
  const realm = options.realm || inferAuthRealm();
  const base = (API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  const headers = {
    ...buildAuthHeaders(realm),
    'Content-Type': 'application/json',
  };
  // fetch is not covered by axios interceptor — never send the cookie sentinel as Bearer.
  if (isCookieSessionToken(token) || isCookieSessionToken(headers.Authorization?.replace(/^Bearer\s+/i, ''))) {
    delete headers.Authorization;
  }
  const res = await fetch(`${base}/api/auth/file-link`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ path: normalizeStoredUploadPath(path) || path }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) return '';
  const url = data.url.startsWith('http') ? data.url : `${base}${data.url}`;
  fileLinkCache.set(plain, { url, expiresAt: Date.now() + (Number(data.expiresIn) || 180) * 1000 });
  return url;
}

export function useAuthorizedFileUrl(path, options = {}) {
  const proofToken = options.proofToken || '';
  const uploadToken = options.uploadToken || '';
  const realm = options.realm;
  const stored = normalizeStoredUploadPath(path);
  const needsLink = pathNeedsUploadAuth(stored) && !(proofToken || uploadToken);
  const [url, setUrl] = useState(() => (
    needsLink ? '' : absFileUrl(path, { proofToken, uploadToken, realm })
  ));

  useEffect(() => {
    const linkOptions = { proofToken, uploadToken, realm };
    if (!path) {
      setUrl('');
      return undefined;
    }
    if (!needsLink) {
      setUrl(absFileUrl(path, linkOptions));
      return undefined;
    }
    let cancel = false;
    fileAccessUrl(path, linkOptions).then((next) => {
      if (!cancel) setUrl(next || '');
    });
    return () => {
      cancel = true;
    };
  }, [path, needsLink, proofToken, uploadToken, realm]);

  return url;
}

/** Download a protected upload using session cookie / Bearer (falls back to new tab). */
export async function downloadProtectedUpload(path, options = {}) {
  const href = absFileUrl(path, options);
  if (!href) return;

  const realm = options.realm || inferAuthRealm();
  const token = authTokenFor(options);
  if (token) {
    try {
      const headers = { ...buildAuthHeaders(realm) };
      if (isCookieSessionToken(token) || isCookieSessionToken(headers.Authorization?.replace(/^Bearer\s+/i, ''))) {
        delete headers.Authorization;
      }
      const res = await fetch(href, {
        credentials: 'include',
        headers,
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

export function ProtectedFileLink({ path, linkOptions, children, ...rest }) {
  const href = useAuthorizedFileUrl(path, linkOptions);
  return (
    <a href={href || undefined} {...rest}>
      {children}
    </a>
  );
}

export function ProtectedFileImage({ path, linkOptions, ...rest }) {
  const src = useAuthorizedFileUrl(path, linkOptions);
  if (!src) return null;
  return <img src={src} alt="" {...rest} />;
}

function isPdfUploadPath(path) {
  const stored = normalizeStoredUploadPath(path) || String(path || '').split('?')[0];
  return stored.toLowerCase().endsWith('.pdf');
}

/**
 * PDF proofs are shown from a blob URL. The upload response carries
 * Content-Security-Policy: object-src 'none', which blocks Chrome's PDF viewer
 * when the iframe points at the file itself.
 */
export function ProtectedFileFrame({ path, linkOptions, ...rest }) {
  const proofToken = linkOptions?.proofToken || linkOptions?.uploadToken || '';
  const realm = linkOptions?.realm;
  const pdf = isPdfUploadPath(path);
  const directSrc = useAuthorizedFileUrl(pdf ? '' : path, linkOptions);
  const [blobSrc, setBlobSrc] = useState('');

  useEffect(() => {
    if (!pdf || !path) {
      setBlobSrc('');
      return undefined;
    }

    let cancel = false;
    let objectUrl = '';

    fileAccessUrl(path, { proofToken, uploadToken: proofToken, realm })
      .then(async (href) => {
        if (!href || cancel) return;
        const requestUrl = new URL(href, window.location.origin).href;
        const res = await fetch(requestUrl, { credentials: 'include' });
        if (!res.ok || cancel) return;
        const bytes = await res.arrayBuffer();
        if (cancel) return;
        const nextUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        if (cancel) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setBlobSrc(nextUrl);
      })
      .catch(() => {
        if (!cancel) setBlobSrc('');
      });

    return () => {
      cancel = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobSrc('');
    };
  }, [path, pdf, proofToken, realm]);

  const src = pdf ? blobSrc : directSrc;
  if (!src) return null;
  return <iframe src={src} title="File" {...rest} />;
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
