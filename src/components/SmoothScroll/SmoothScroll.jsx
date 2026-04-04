import React from 'react';

/**
 * Layout wrapper only. The site uses native browser scrolling (no Lenis) for
 * predictable behavior on mobile and correct sync with window scroll + header.
 * Scroll-to-top on route change: ScrollToTop.jsx
 */
const SmoothScroll = ({ children }) => <>{children}</>;

export default SmoothScroll;
