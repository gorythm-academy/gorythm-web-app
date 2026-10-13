/** User-facing message for login / auth form failures. */
export function getLoginFormError(err, fallback = 'Authentication failed') {
  if (!err) return fallback;
  if (!err.response) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  const data = err.response.data;
  if (data?.error) return String(data.error);
  if (data?.message) return String(data.message);
  return fallback;
}

/**
 * 403 responses that mean the session is no longer valid (not a permission denial
 * on a specific admin action).
 */
export function isAuthSessionRevokedError(err) {
  const status = err?.response?.status;
  if (status === 401) return true;
  if (status !== 403) return false;
  const data = err.response?.data || {};
  if (data.mustChangePassword) return false;
  const msg = String(data.error || data.message || '').toLowerCase();
  return (
    msg.includes('removed') ||
    msg.includes('deactivated') ||
    msg.includes('login access is disabled') ||
    msg.includes('session is out of date') ||
    msg.includes('account cannot access') ||
    msg.includes('user not found') ||
    msg.includes('unauthorized')
  );
}
