const DEFAULT_PLACEHOLDER = '/images/courses/placeholder.png';

/**
 * One-source-of-truth course card image:
 * - Put files in `public/images/courses/`
 * - Name them by course slug: `<slug>.png` (or `.webp`)
 *
 * We return a `.png` path by default (simple + compatible) and provide helpers
 * to swap to a fallback if the file is missing.
 */
export function getCourseImageSrc(course) {
  const slug = (course?.slug || course?._id || '').toString().trim();
  if (!slug) return DEFAULT_PLACEHOLDER;
  return `/images/courses/${encodeURIComponent(slug)}.png`;
}

export function setImageFallbackToPlaceholder(e) {
  if (!e?.currentTarget) return;
  if (e.currentTarget.dataset?.fallbackApplied === '1') return;
  e.currentTarget.dataset.fallbackApplied = '1';
  e.currentTarget.src = DEFAULT_PLACEHOLDER;
}

