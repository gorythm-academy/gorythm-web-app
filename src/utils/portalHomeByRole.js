export function portalHomeByRole(role) {
  if (role === 'teacher') return '/teacher';
  if (role === 'parent') return '/parent';
  if (role === 'accountant') return '/accountant';
  if (role === 'manager' || role === 'super-admin') return '/admin';
  return '/student';
}
