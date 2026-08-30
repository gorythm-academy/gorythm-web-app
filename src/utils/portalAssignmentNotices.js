import { getPortalSeenCutoff } from './portalNewItems';

function cutoffMs(storageKey) {
  return new Date(getPortalSeenCutoff(storageKey)).getTime();
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString();
}

/** Assignment changed since the user last opened the page (new, due-date extension, or edit). */
export function assignmentUpdatedSince(assignment, sinceMs) {
  if (!assignment) return false;
  const created = assignment.createdAt ? new Date(assignment.createdAt).getTime() : 0;
  if (created > sinceMs) return true;

  const extensions = Array.isArray(assignment.dueDateExtensions) ? assignment.dueDateExtensions : [];
  const latestExt = extensions.length ? extensions[extensions.length - 1] : null;
  if (latestExt?.extendedAt && new Date(latestExt.extendedAt).getTime() > sinceMs) return true;

  const updated = assignment.updatedAt ? new Date(assignment.updatedAt).getTime() : 0;
  return updated > sinceMs && updated > created + 60_000;
}

/** Human-readable update lines for banners (no "admin" wording for students). */
export function getAssignmentUpdateMessages(assignment, { viewerRole = 'student' } = {}) {
  if (!assignment) return [];
  const messages = [];
  if (assignment.dueDateNotice) {
    messages.push(assignment.dueDateNotice);
    return [...new Set(messages)];
  }
  const extensions = Array.isArray(assignment.dueDateExtensions) ? assignment.dueDateExtensions : [];
  if (extensions.length) {
    const latest = extensions[extensions.length - 1];
    const newDate = formatDate(latest.newDueDate);
    messages.push(`Due date extended to ${newDate}.`);
    return messages;
  }
  const created = assignment.createdAt ? new Date(assignment.createdAt).getTime() : 0;
  const updated = assignment.updatedAt ? new Date(assignment.updatedAt).getTime() : 0;
  if (updated > created + 60_000) {
    if (viewerRole === 'student') {
      messages.push(`"${assignment.title || 'Assignment'}" was updated.`);
    } else {
      messages.push(`"${assignment.title || 'Assignment'}" was updated — review changes.`);
    }
  }
  return [...new Set(messages)];
}

export function collectAssignmentUpdateNotices(assignments, storageKey, options = {}) {
  const since = cutoffMs(storageKey);
  const rows = [];
  for (const assignment of assignments || []) {
    const created = assignment.createdAt ? new Date(assignment.createdAt).getTime() : 0;
    if (created > since) continue;
    if (!assignmentUpdatedSince(assignment, since)) continue;
    for (const message of getAssignmentUpdateMessages(assignment, options)) {
      rows.push({ id: assignment._id, title: assignment.title, message });
    }
  }
  return rows;
}

export function countAssignmentsUpdatedSince(assignments, storageKey) {
  const since = cutoffMs(storageKey);
  return (assignments || []).filter((a) => {
    const created = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    if (created > since) return false;
    return assignmentUpdatedSince(a, since);
  }).length;
}

export function isSubmissionRevisedClient(submission) {
  if (!submission) return false;
  if (Number(submission.revisionCount) > 0) return true;
  const created = submission.createdAt ? new Date(submission.createdAt).getTime() : 0;
  const updated = submission.updatedAt ? new Date(submission.updatedAt).getTime() : 0;
  return updated > created + 60_000;
}

export function getSubmissionRevisionLabel(submission) {
  if (submission?.revisionNotice) return submission.revisionNotice;
  if (!isSubmissionRevisedClient(submission)) return null;
  const count = Number(submission.revisionCount) || 1;
  return count > 1 ? 'Re-submitted' : 'Edited';
}

export function submissionRevisedSince(submission, sinceMs) {
  if (!isSubmissionRevisedClient(submission)) return false;
  const created = submission.createdAt ? new Date(submission.createdAt).getTime() : 0;
  if (created > sinceMs) return false;
  const updated = submission.updatedAt ? new Date(submission.updatedAt).getTime() : 0;
  const submitted = submission.submittedAt ? new Date(submission.submittedAt).getTime() : 0;
  return Math.max(updated, submitted) > sinceMs;
}

export function collectSubmissionRevisionNotices(submissions, storageKey) {
  const since = cutoffMs(storageKey);
  const rows = [];
  for (const submission of submissions || []) {
    if (!submissionRevisedSince(submission, since)) continue;
    const label = getSubmissionRevisionLabel(submission) || 'Re-submitted';
    const studentName = submission.student?.name || 'A student';
    const title = submission.assignment?.title || 'assignment';
    rows.push({
      id: submission._id,
      title: `${studentName} — ${title}`,
      message: `${label} on ${formatDate(submission.submittedAt || submission.updatedAt)}.`,
    });
  }
  return rows;
}

export function countSubmissionsRevisedSince(submissions, storageKey) {
  const since = cutoffMs(storageKey);
  return (submissions || []).filter((s) => submissionRevisedSince(s, since)).length;
}

/** True when existing assignments were edited (not newly created) since last visit. */
export function hasAssignmentEditsSince(assignments, storageKey) {
  return countAssignmentsUpdatedSince(assignments, storageKey) > 0;
}

/** True when existing submissions were revised since last visit. */
export function hasSubmissionEditsSince(submissions, storageKey) {
  return countSubmissionsRevisedSince(submissions, storageKey) > 0;
}

const DISMISSED_REMOVALS_PREFIX = 'gorythm_portal_dismissed_submission_removals_';

function removalDismissKey(assignmentId, removedAt) {
  return `${assignmentId}_${new Date(removedAt).getTime()}`;
}

export function getDismissedSubmissionRemovals(storageKey) {
  try {
    const raw = localStorage.getItem(`${DISMISSED_REMOVALS_PREFIX}${storageKey}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function dismissSubmissionRemoval(storageKey, assignmentId, removedAt) {
  if (!assignmentId || !removedAt) return;
  const key = removalDismissKey(assignmentId, removedAt);
  const existing = new Set(getDismissedSubmissionRemovals(storageKey));
  if (existing.has(key)) return;
  existing.add(key);
  localStorage.setItem(`${DISMISSED_REMOVALS_PREFIX}${storageKey}`, JSON.stringify([...existing]));
}

export function collectSubmissionRemovalNotices(assignments, storageKey) {
  const dismissed = new Set(getDismissedSubmissionRemovals(storageKey));
  const rows = [];
  for (const assignment of assignments || []) {
    const removedAt = assignment.submissionRemovedAt;
    if (!removedAt) continue;
    const key = removalDismissKey(assignment._id, removedAt);
    if (dismissed.has(key)) continue;
    rows.push({
      id: assignment._id,
      title: assignment.title || 'Assignment',
      removedAt,
      message: 'Your previous submission was removed. You may submit again before the due date.',
    });
  }
  return rows;
}

const DISMISSED_ACTIVITY_PREFIX = 'gorythm_portal_dismissed_activity_';

export function getDismissedActivityNotices(storageKey) {
  try {
    const raw = localStorage.getItem(`${DISMISSED_ACTIVITY_PREFIX}${storageKey}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function dismissActivityNotices(storageKey, keys) {
  if (!keys?.length) return;
  const existing = new Set(getDismissedActivityNotices(storageKey));
  keys.forEach((key) => existing.add(key));
  localStorage.setItem(`${DISMISSED_ACTIVITY_PREFIX}${storageKey}`, JSON.stringify([...existing]));
}

export function filterDismissedActivityNotices(storageKey, rows, getKey = (row) => `${row.id}-${row.message}`) {
  const dismissed = new Set(getDismissedActivityNotices(storageKey));
  return (rows || []).filter((row) => !dismissed.has(getKey(row)));
}

export function collectTeacherSubmissionRemovalNotices(removals, storageKey) {
  const dismissed = new Set(getDismissedSubmissionRemovals(storageKey));
  const rows = [];
  for (const row of removals || []) {
    const removedAt = row.removedAt;
    if (!removedAt) continue;
    const id = row.id || row._id;
    const key = removalDismissKey(id, removedAt);
    if (dismissed.has(key)) continue;
    const studentName = row.studentName || row.student?.name || 'Student';
    const assignmentTitle = row.assignmentTitle || row.assignment?.title || 'assignment';
    rows.push({
      id,
      title: `${studentName} — ${assignmentTitle}`,
      removedAt,
      message: 'Admin removed this submission. The student may submit again before the due date.',
    });
  }
  return rows;
}
