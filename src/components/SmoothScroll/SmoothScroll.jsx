import React, { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import { useLocation } from 'react-router-dom';

const isMobile = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

const SmoothScroll = ({ children }) => {
  const lastWheelDeltaRef = useRef(0);
  const lenisRef = useRef(null);
  const location = useLocation();

  // Reset scroll to top immediately on every route change
  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    const mobile = isMobile();

    // Capture wheel delta (capture phase, before Lenis) so we can allow scroll chaining
    // when native-scroll-zone is at top/bottom.
    const onWheelCapture = (e) => {
      lastWheelDeltaRef.current = e.deltaY;
    };
    document.addEventListener('wheel', onWheelCapture, { capture: true, passive: true });

    const lenis = lenisRef.current = new Lenis({
      duration: mobile ? 0.5 : 0.7,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smooth: true,
      smoothTouch: true,
      touchMultiplier: mobile ? 3 : 2,
      wheelMultiplier: 1.4,

      // prevent: use native scroll inside .native-scroll-zone only when the zone can still scroll.
      // When zone is at top (scroll up) or at bottom (scroll down), return false so Lenis scrolls the page.
      prevent: (node) => {
        let el = node;
        while (el) {
          if (el.hasAttribute?.('data-lenis-prevent')) return true;
          if (el.classList?.contains?.('native-scroll-zone')) {
            const style = typeof window !== 'undefined' && window.getComputedStyle?.(el);
            const overflowY = style?.overflowY;
            const isScrollable =
              overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
            const hasOverflow = el.scrollHeight > el.clientHeight;
            if (!isScrollable || !hasOverflow) return false;
            const atTop = el.scrollTop <= 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            const deltaY = lastWheelDeltaRef.current;
            if (atTop && deltaY < 0) return false;
            if (atBottom && deltaY > 0) return false;
            return true;
          }
          el = el.parentElement;
        }
        return false;
      },
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      document.removeEventListener('wheel', onWheelCapture, { capture: true });
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return <>{children}</>;
};

export default SmoothScroll;
