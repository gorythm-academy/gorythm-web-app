import { useEffect, useMemo, useRef, useState } from 'react';

export const useStickyPanel = ({
  layoutRef,
  asideRef,
  stickyRef,
  boundaryRef,
  deps = [],
  topOffset = 132,
}) => {
  const naturalHeightRef = useRef(0);
  const [stickyState, setStickyState] = useState({ mode: 'static', width: null, left: null });
  const staticState = useMemo(
    () => ({ mode: 'static', width: null, left: null }),
    []
  );
  const depsKey = Array.isArray(deps) ? deps.join('|') : '';

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (stickyRef.current) {
      naturalHeightRef.current = stickyRef.current.offsetHeight;
    }
  }, [stickyRef, depsKey]);

  useEffect(() => {
    const updateSticky = () => {
      if (
        typeof window === 'undefined' ||
        !layoutRef.current ||
        !asideRef.current ||
        !stickyRef.current ||
        window.innerWidth <= 992
      ) {
        setStickyState((prev) =>
          prev.mode === staticState.mode &&
          prev.width === staticState.width &&
          prev.left === staticState.left
            ? prev
            : staticState
        );
        return;
      }

      const layoutRect = layoutRef.current.getBoundingClientRect();
      const boundaryRect = (boundaryRef?.current || layoutRef.current).getBoundingClientRect();
      const asideRect = asideRef.current.getBoundingClientRect();
      const stickyHeight = naturalHeightRef.current || stickyRef.current.offsetHeight;
      const scrollTop = window.scrollY;
      const layoutTop = layoutRect.top + scrollTop;
      const layoutBottom = boundaryRect.bottom + scrollTop;
      const startStickAt = layoutTop - topOffset;
      const stopStickAt = layoutBottom - stickyHeight - topOffset;
      const stickRange = stopStickAt - startStickAt;
      const boundaryHeight = boundaryRect.height;
      const minStickRange = 100;
      const minContentHeight = window.innerHeight;
      const hysteresis = 8;

      const hasEnoughContent =
        boundaryHeight >= minContentHeight &&
        stickRange >= minStickRange &&
        stopStickAt > startStickAt;

      let nextState = staticState;

      if (hasEnoughContent) {
        if (scrollTop <= startStickAt + hysteresis) {
          nextState = { mode: 'static', width: null, left: null };
        } else if (scrollTop >= stopStickAt - hysteresis) {
          nextState = {
            mode: 'bottom',
            width: asideRect.width,
            left: null,
          };
        } else {
          nextState = {
            mode: 'fixed',
            width: asideRect.width,
            left: asideRect.left,
          };
        }
      }

      const baseStaticState = { mode: 'static', width: null, left: null };

      setStickyState((prev) =>
        prev.mode === nextState.mode &&
        prev.width === nextState.width &&
        prev.left === nextState.left
          ? prev
          : nextState.mode === baseStaticState.mode &&
              nextState.width === baseStaticState.width &&
              nextState.left === baseStaticState.left
            ? baseStaticState
            : nextState
      );
    };

    updateSticky();
    window.addEventListener('scroll', updateSticky, { passive: true });
    window.addEventListener('resize', updateSticky);

    return () => {
      window.removeEventListener('scroll', updateSticky);
      window.removeEventListener('resize', updateSticky);
    };
  }, [layoutRef, asideRef, stickyRef, boundaryRef, topOffset, depsKey, staticState]);

  const stickyStyle =
    stickyState.mode === 'fixed' && stickyState.width != null
      ? { width: `${stickyState.width}px`, left: `${stickyState.left}px` }
      : stickyState.mode === 'bottom' && stickyState.width != null
        ? { width: `${stickyState.width}px` }
        : undefined;

  const asideStyle =
    stickyState.mode !== 'static' && naturalHeightRef.current
      ? { minHeight: naturalHeightRef.current }
      : undefined;

  return {
    stickyMode: stickyState.mode,
    stickyStyle,
    asideStyle,
  };
};
