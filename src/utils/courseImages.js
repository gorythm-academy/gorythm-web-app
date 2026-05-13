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

/**
 * Build ordered course image candidates:
 * 1) AVIF (smallest, modern browsers)
 * 2) WebP (widely supported modern fallback)
 * 3) PNG (legacy-safe fallback)
 * 4) Placeholder (last-resort if course image files are missing)
 */
export function getCourseImageCandidates(course) {
  const slug = (course?.slug || course?._id || '').toString().trim();
  if (!slug) return [DEFAULT_PLACEHOLDER];
  const encoded = encodeURIComponent(slug);
  const base = `/images/courses/${encoded}`;
  return [`${base}.avif`, `${base}.webp`, `${base}.png`, DEFAULT_PLACEHOLDER];
}

export function setImageFallbackToPlaceholder(e) {
  if (!e?.currentTarget) return;
  if (e.currentTarget.dataset?.fallbackApplied === '1') return;
  e.currentTarget.dataset.fallbackApplied = '1';
  e.currentTarget.src = DEFAULT_PLACEHOLDER;
}

