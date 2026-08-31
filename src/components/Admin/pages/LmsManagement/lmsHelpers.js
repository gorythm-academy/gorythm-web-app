import { TEACHER_MY_STATUS_OPTIONS } from '../../../../constants/attendanceStatuses';

export const PARENT_RELATION_OPTIONS = [
  { value: 'guardian', label: 'Guardian' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'other', label: 'Other' },
];

export const formatRelationLabel = (relation) =>
  PARENT_RELATION_OPTIONS.find((option) => option.value === relation)?.label || relation || '—';

export const formatMonthLabel = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

export const teacherInitials = (name) => {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

export const statusMeta = (status) =>
  TEACHER_MY_STATUS_OPTIONS.find((o) => o.value === status) || {
    value: status,
    label: status || '—',
    icon: 'fa-circle',
    color: '#64748b',
  };

export const formatPayrollMonth = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

export const payrollStatusLabel = (status) => {
  if (status === 'pending_review') return 'Pending review';
  if (status === 'stale') return 'Out of Date';
  if (status === 'paid') return 'Paid';
  if (status === 'rejected') return 'Rejected';
  return status || '—';
};

export const payrollStatusKey = (status) => {
  if (status === 'pending_review') return 'pending';
  if (status === 'stale') return 'stale';
  if (status === 'paid') return 'paid';
  if (status === 'rejected') return 'rejected';
  return 'unknown';
};

export const formatPaidDate = (paidAt) => {
  if (!paidAt) return null;
  const d = new Date(paidAt);
  if (Number.isNaN(d.getTime())) return null;
  return {
    display: d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    weekday: d.toLocaleDateString(undefined, { weekday: 'long' }),
    iso: d.toISOString().slice(0, 10),
  };
};
