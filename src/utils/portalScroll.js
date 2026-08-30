/** Scroll a portal/admin element into view inside the main content scroll area. */
export function scrollPortalToElement(element, { behavior = 'smooth' } = {}) {
  if (!element) return;

  const scrollParent = element.closest('.admin-content');
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const elRect = element.getBoundingClientRect();
    const top = scrollParent.scrollTop + (elRect.top - parentRect.top) - 12;
    scrollParent.scrollTo({ top: Math.max(0, top), behavior });
    return;
  }

  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior, block: 'start' });
  }
}

/** Wait until an element exists (after React state/render) then scroll to it. */
export function scheduleScrollToElement(getElement, { maxAttempts = 12 } = {}) {
  let attempts = 0;

  const tryScroll = () => {
    const element = typeof getElement === 'function' ? getElement() : getElement?.current;
    if (element) {
      scrollPortalToElement(element);
      return;
    }
    attempts += 1;
    if (attempts < maxAttempts) {
      requestAnimationFrame(tryScroll);
    }
  };

  requestAnimationFrame(tryScroll);
}
