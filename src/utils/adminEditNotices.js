import { getPortalSeenCutoff, TEACHER_SEEN_ADMIN_ASSIGNMENTS, TEACHER_SEEN_ADMIN_RESOURCES } from './portalNewItems';

const isAdminPublished = (item) => !!(item?.lockedForTeacher || item?.createdByRole === 'admin');

function seenCutoffMs(storageKey) {
  return new Date(getPortalSeenCutoff(storageKey)).getTime();
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}

/** Notices for admin-edited assignments since the teacher last dismissed updates. */
export function getAdminAssignmentEditNotices(assignment, sinceMs) {
  if (!isAdminPublished(assignment)) return [];
  const cutoff = typeof sinceMs === 'number' ? sinceMs : seenCutoffMs(TEACHER_SEEN_ADMIN_ASSIGNMENTS);
  const updatedAt = assignment.updatedAt ? new Date(assignment.updatedAt).getTime() : 0;
  const createdAt = assignment.createdAt ? new Date(assignment.createdAt).getTime() : 0;
  if (updatedAt <= cutoff) return [];

  const notices = [];
  const extensions = Array.isArray(assignment.dueDateExtensions) ? assignment.dueDateExtensions : [];
  const latestExt = extensions.length ? extensions[extensions.length - 1] : null;
  const extensionSince = Boolean(
    latestExt?.extendedAt && new Date(latestExt.extendedAt).getTime() > cutoff
  );

  if (extensionSince) {
    if (assignment.dueDateNotice) {
      notices.push(assignment.dueDateNotice);
    } else {
      notices.push(`Admin updated due date to ${formatDate(latestExt.newDueDate)}`);
    }
  }
  if (updatedAt > createdAt + 60_000) {
    if (!extensionSince) {
      notices.push(`Admin updated "${assignment.title || 'assignment'}"`);
    } else if (updatedAt > new Date(latestExt?.extendedAt || 0).getTime() + 60_000) {
      notices.push(`Admin changed title, files, or details for "${assignment.title || 'assignment'}"`);
    }
  }
  return [...new Set(notices)];
}

export function collectAdminAssignmentEditNotices(assignments, storageKey = TEACHER_SEEN_ADMIN_ASSIGNMENTS) {
  const sinceMs = seenCutoffMs(storageKey);
  const rows = [];
  for (const assignment of assignments || []) {
    for (const message of getAdminAssignmentEditNotices(assignment, sinceMs)) {
      rows.push({ id: assignment._id, title: assignment.title, message });
    }
  }
  return rows;
}

/** Notices for admin-edited books/resources since last Resources visit. */
export function getAdminResourceEditNotices(resource) {
  if (!isAdminPublished(resource)) return [];
  const cutoff = seenCutoffMs(TEACHER_SEEN_ADMIN_RESOURCES);
  const updatedAt = resource.updatedAt ? new Date(resource.updatedAt).getTime() : 0;
  const createdAt = resource.createdAt ? new Date(resource.createdAt).getTime() : 0;
  if (updatedAt <= cutoff || updatedAt <= createdAt + 60_000) return [];
  return [`Admin updated "${resource.title || 'resource'}"`];
}

export function collectAdminResourceEditNotices(resources) {
  const rows = [];
  for (const resource of resources || []) {
    for (const message of getAdminResourceEditNotices(resource)) {
      rows.push({ id: resource._id, title: resource.title, message });
    }
  }
  return rows;
}

/** Notices when the other side edits a published quiz after this page was last dismissed. */
export function collectQuizUpdateNotices(quizzes, { storageKey, audience }) {
  const cutoff = seenCutoffMs(storageKey);
  const rows = [];
  for (const quiz of quizzes || []) {
    const adminQuiz = isAdminPublished(quiz);
    if (audience === 'teacher' && !adminQuiz) continue;
    if (audience === 'admin' && adminQuiz) continue;
    const updatedAt = quiz.updatedAt ? new Date(quiz.updatedAt).getTime() : 0;
    const createdAt = quiz.createdAt ? new Date(quiz.createdAt).getTime() : 0;
    if (!updatedAt || updatedAt <= cutoff || updatedAt <= createdAt + 60_000) continue;
    const title = quiz.title || 'Quiz';
    const message =
      audience === 'student'
        ? 'This quiz was updated. Open it to see the latest version.'
        : adminQuiz
          ? `Admin updated "${title}"`
          : `Teacher updated "${title}"`;
    rows.push({ id: quiz._id || quiz.id, title, message });
  }
  return rows;
}

export { isAdminPublished };
