import { resolveMediaUrl } from './resolveMediaUrl';

const DEFAULT_PLACEHOLDER = '/images/courses/placeholder.png';

/**
 * Course card image: prefer admin-uploaded path (homepageImage), else static slug files.
 */
export function getCourseImageCandidates(course) {
  const uploaded = (course?.homepageImage || '').trim();
  if (uploaded) {
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

export function setImageFallbackToPlaceholder(e) {
  if (!e?.currentTarget) return;
  if (e.currentTarget.dataset?.fallbackApplied === '1') return;
  e.currentTarget.dataset.fallbackApplied = '1';
  e.currentTarget.src = DEFAULT_PLACEHOLDER;
}

