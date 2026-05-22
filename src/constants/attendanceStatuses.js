export const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'leave', label: 'Leave' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'weekend', label: 'Weekend' },
];

export const TEACHER_MY_STATUS_OPTIONS = [
  { value: 'present', label: 'Present', icon: 'fa-check-circle', color: '#10b981' },
  { value: 'absent', label: 'Absent', icon: 'fa-times-circle', color: '#ef4444' },
  { value: 'late', label: 'Late', icon: 'fa-clock', color: '#f59e0b' },
  { value: 'leave', label: 'Leave', icon: 'fa-umbrella-beach', color: '#64748b' },
  { value: 'holiday', label: 'Holiday', icon: 'fa-star', color: '#ea580c' },
  { value: 'weekend', label: 'Weekend', icon: 'fa-calendar-minus', color: '#94a3b8' },
];

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
