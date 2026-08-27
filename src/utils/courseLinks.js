/** URL slug from course title (matches backend slugFromTitle). */
export function slugifyCourseTitle(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Prefer URL slug from title; fall back to id for legacy rows with no slug. */
export function courseUrlSegment(course) {
  if (!course) return '';
  const slug = course.slug != null && String(course.slug).trim();
  if (slug) return slug;
  if (course._id != null) return String(course._id);
  if (course.id != null) return String(course.id);
  return '';
}
