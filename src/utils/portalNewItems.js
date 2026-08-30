const PREFIX = 'gorythm_portal_seen_';

export const ADMIN_SEEN_RESOURCES_SUBMISSIONS = 'admin_resources_submissions';
export const ADMIN_SEEN_TAB_ASSIGNMENTS = 'admin_tab_assignments';
export const ADMIN_SEEN_TAB_RESOURCES = 'admin_tab_resources';
export const ADMIN_SEEN_TAB_SUBMISSIONS = 'admin_tab_submissions';
export const TEACHER_SEEN_ADMIN_ASSIGNMENTS = 'teacher_admin_assignments';
export const TEACHER_SEEN_ADMIN_RESOURCES = 'teacher_admin_resources';

export function getPortalSeenCutoff(storageKey, fallbackDays = 7) {
  const raw = localStorage.getItem(`${PREFIX}${storageKey}`);
  return raw || new Date(Date.now() - fallbackDays * 24 * 60 * 60 * 1000).toISOString();
}

export function getItemsNewSinceLastVisit(
  storageKey,
  items,
  { dateField = 'createdAt', fallbackDays = 7 } = {}
) {
  const raw = localStorage.getItem(`${PREFIX}${storageKey}`);
  const cutoff = raw
    ? new Date(raw).getTime()
    : Date.now() - fallbackDays * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const created = item[dateField] ? new Date(item[dateField]).getTime() : 0;
    return created > cutoff;
  });
}

export function markPortalPageVisited(storageKey) {
  localStorage.setItem(`${PREFIX}${storageKey}`, new Date().toISOString());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('portal-seen-updated', { detail: { storageKey } })
    );
  }
}

export function filterPortalItemsByCourse(items, courseFilter) {
  if (!courseFilter) return [];
  if (courseFilter === 'all') return items;
  return items.filter((item) => {
    const courseId = item.course?._id || item.course;
    return courseId && String(courseId) === String(courseFilter);
  });
}

/** Filter list items when course id is nested (e.g. submission.assignment.course). */
export function filterPortalItemsByCourseField(items, courseFilter, getCourseId) {
  if (!courseFilter || courseFilter === 'all') return items;
  return items.filter((item) => {
    const courseId = getCourseId(item);
    return courseId && String(courseId) === String(courseFilter);
  });
}

/** Group items under course headings for teacher/admin lists. */
export function groupPortalItemsByCourse(items, getCourseId, getCourseTitle) {
  const groups = new Map();
  for (const item of items) {
    const courseId = String(getCourseId(item) || 'unknown');
    const title = getCourseTitle(item) || 'Other';
    if (!groups.has(courseId)) {
      groups.set(courseId, { courseId, title, items: [] });
    }
    groups.get(courseId).items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}
