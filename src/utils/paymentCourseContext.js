const STORAGE_KEY = 'gorythm.payment.courseId';

export function rememberPaymentCourseId(courseId) {
  if (typeof sessionStorage === 'undefined') return;
  const id = String(courseId || '').trim();
  if (id) sessionStorage.setItem(STORAGE_KEY, id);
}

export function readPaymentCourseId() {
  if (typeof sessionStorage === 'undefined') return '';
  return sessionStorage.getItem(STORAGE_KEY) || '';
}
