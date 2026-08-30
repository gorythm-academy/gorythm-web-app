import { getPortalSeenCutoff, TEACHER_SEEN_ADMIN_ASSIGNMENTS, TEACHER_SEEN_ADMIN_RESOURCES } from './portalNewItems';

const isAdminPublished = (item) => !!(item?.lockedForTeacher || item?.createdByRole === 'admin');

function seenCutoffMs(storageKey) {
  return new Date(getPortalSeenCutoff(storageKey)).getTime();
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}

/** Notices for admin-edited assignments since the teacher last opened Assignments. */
export function getAdminAssignmentEditNotices(assignment) {
  if (!isAdminPublished(assignment)) return [];
  const cutoff = seenCutoffMs(TEACHER_SEEN_ADMIN_ASSIGNMENTS);
  const updatedAt = assignment.updatedAt ? new Date(assignment.updatedAt).getTime() : 0;
  const createdAt = assignment.createdAt ? new Date(assignment.createdAt).getTime() : 0;
  if (updatedAt <= cutoff) return [];

  const notices = [];
  if (assignment.dueDateNotice) {
    notices.push(assignment.dueDateNotice);
  }
  const extensions = Array.isArray(assignment.dueDateExtensions) ? assignment.dueDateExtensions : [];
  if (!assignment.dueDateNotice && extensions.length) {
    const latest = extensions[extensions.length - 1];
    notices.push(`Admin updated due date to ${formatDate(latest.newDueDate)}`);
  }
  if (updatedAt > createdAt + 60_000) {
    if (!extensions.length) {
      notices.push(`Admin updated "${assignment.title || 'assignment'}"`);
    } else if (updatedAt > new Date(extensions[extensions.length - 1]?.extendedAt || 0).getTime() + 60_000) {
      notices.push(`Admin changed title, files, or details for "${assignment.title || 'assignment'}"`);
    }
  }
  return [...new Set(notices)];
}

export function collectAdminAssignmentEditNotices(assignments) {
  const rows = [];
  for (const assignment of assignments || []) {
    for (const message of getAdminAssignmentEditNotices(assignment)) {
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

export { isAdminPublished };
