/** Visible teacher account label: active, inactive, complete, or quarantine. */
export function teacherAccountStatus(teacher, { quarantined = false } = {}) {
  if (quarantined || teacher?.deletedAt) return 'quarantine';
  const status = String(teacher?.status || 'active').toLowerCase();
  if (status === 'completed' || status === 'complete') return 'complete';
  if (status === 'inactive') return 'inactive';
  return 'active';
}
