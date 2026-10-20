import { resolveMediaUrl } from './resolveMediaUrl';

const DEFAULT_PLACEHOLDER = '/images/courses/placeholder.png';

/** Uploaded or on-site course art. Unsplash and other outside links are ignored. */
export function isOwnCourseImage(path) {
  const raw = String(path || '').trim();
  if (!raw || /unsplash\.com/i.test(raw)) return false;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = new URL(raw).pathname || '';
      return pathname.startsWith('/api/uploads/') || pathname.startsWith('/images/');
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Course card image: prefer admin-uploaded path (homepageImage), else static slug files.
 */
export function getCourseImageCandidates(course) {
  const uploaded = (course?.homepageImage || '').trim();
  if (isOwnCourseImage(uploaded)) {
    return [resolveMediaUrl(uploaded), DEFAULT_PLACEHOLDER];
  }

  const slug = (course?.slug || course?._id || '').toString().trim();
  if (!slug) return [DEFAULT_PLACEHOLDER];
  const encoded = encodeURIComponent(slug);
  const base = `/images/courses/${encoded}`;
  return [`${base}.avif`, `${base}.webp`, `${base}.png`, DEFAULT_PLACEHOLDER];
}

export function getCourseImageSrc(course) {
  const candidates = getCourseImageCandidates(course);
  return candidates[0] || DEFAULT_PLACEHOLDER;
}

const CARD_WIDTHS = [480, 800, 1200];

/**
 * Smaller copies of uploaded course art. Static /images/courses files are unchanged.
 * The server ignores unknown widths and serves the original.
 */
export function getCourseImageSrcSet(src) {
  const raw = String(src || '');
  if (!raw.includes('/api/uploads/courses-images/')) return undefined;

  const hashAt = raw.indexOf('#');
  const withoutHash = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const queryAt = withoutHash.indexOf('?');
  const base = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  if (!/\.(avif|webp|png|jpe?g)$/i.test(base)) return undefined;

  const extra = queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '';
  return CARD_WIDTHS.map((width) => {
    const query = extra ? `w=${width}&${extra}` : `w=${width}`;
    return `${base}?${query} ${width}w`;
  }).join(', ');
}

