import DOMPurify from 'dompurify';

/** Client-side HTML sanitizer for research content display. */
export function sanitizeHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(String(html));
}
