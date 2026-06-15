export const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'leave', label: 'Leave' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'weekend', label: 'Weekend' },
];

/**
 * Student attendance marking — weekend is academy calendar only, not teacher-selected.
 * Teacher self-attendance: Sunday is locked as academy weekend (auto-counted, not selectable).
 * Present and late are counted separately in monthly rollups (late does not add to present).
 */
export const STUDENT_MARK_ATTENDANCE_STATUS_OPTIONS = ATTENDANCE_STATUS_OPTIONS.filter(
  (o) => o.value !== 'weekend'
);

export const TEACHER_MY_STATUS_OPTIONS = [
  { value: 'present', label: 'Present', icon: 'fa-check-circle', color: '#22c55e' },
  { value: 'absent', label: 'Absent', icon: 'fa-times-circle', color: '#ef4444' },
  { value: 'late', label: 'Late', icon: 'fa-clock', color: '#9333ea' },
  { value: 'leave', label: 'Leave', icon: 'fa-umbrella-beach', color: '#475569' },
  { value: 'holiday', label: 'Holiday', icon: 'fa-star', color: '#2563eb' },
];

/** Short label shown on teacher calendar cells */
export const statusCalendarLabel = (status) => {
  const opt = TEACHER_MY_STATUS_OPTIONS.find((o) => o.value === status);
  return opt?.label || status || '';
};

export const statusChipClass = (status) => {
  const map = {
    present: 'portal-attendance-chip--present',
    absent: 'portal-attendance-chip--absent',
    late: 'portal-attendance-chip--late',
    leave: 'portal-attendance-chip--leave',
    holiday: 'portal-attendance-chip--holiday',
    weekend: 'portal-attendance-chip--weekend',
  };
  return map[status] || '';
};
