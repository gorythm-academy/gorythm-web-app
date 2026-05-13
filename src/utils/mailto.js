/**
 * Open the OS mail client with the given address.
 * Uses assign() so navigation works when default <a href="mailto:"> handling is unreliable.
 * Modified clicks (new tab, etc.) keep native behavior.
 */
export function navigateToMailto(email, event) {
  if (!email || typeof email !== 'string') return;
  if (event && typeof event.preventDefault === 'function') {
    const e = event;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }
  window.location.assign(`mailto:${email}`);
}
