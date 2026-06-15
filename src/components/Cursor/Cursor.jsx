import React, { useState, useEffect, useRef } from 'react';
import './Cursor.scss';

const INTERACTIVE_SELECTOR =
  'a,button,input:not([type="hidden"]),textarea,select,option,label,label[for],[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="radio"],[role="switch"],summary,details,[contenteditable=""],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

const NATIVE_CURSOR_KEYWORDS = new Set([
  'pointer',
  'text',
  'grab',
  'grabbing',
  'move',
  'col-resize',
  'row-resize',
  'n-resize',
  's-resize',
  'e-resize',
  'w-resize',
  'ne-resize',
  'nw-resize',
  'se-resize',
  'sw-resize',
  'ew-resize',
  'ns-resize',
  'nesw-resize',
  'nwse-resize',
  'zoom-in',
  'zoom-out',
  'crosshair',
  'help',
  'progress',
  'wait',
  'not-allowed',
  'cell',
  'copy',
  'alias',
  'vertical-text',
  'all-scroll',
  'no-drop',
  'context-menu',
]);

function cursorDeclaresNative(cursorValue) {
  if (!cursorValue || cursorValue === 'auto' || cursorValue === 'default' || cursorValue === 'none') {
    return false;
  }
  return cursorValue.split(',').some((part) => {
    const token = part.trim().split(' ')[0];
    return NATIVE_CURSOR_KEYWORDS.has(token);
  });
}

function shouldUseNativeCursor(el) {
  if (!el || !(el instanceof Element)) return false;

  if (el.closest(INTERACTIVE_SELECTOR) || el.closest('.hover-effect,[data-hover]')) {
    return true;
  }

  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (cursorDeclaresNative(getComputedStyle(node).cursor)) {
      return true;
    }
    node = node.parentElement;
  }

  return false;
}

const Cursor = () => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState(false);
  const [clicked, setClicked] = useState(false);
  const [nativeCursorZone, setNativeCursorZone] = useState(false);
  const nativeCursorZoneRef = useRef(false);

  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0);

  useEffect(() => {
    if (isTouchDevice) return;

    let timeoutId;

    const applyBodyCursor = (useNative) => {
      document.documentElement.classList.toggle('custom-cursor-native', useNative);
      document.body.classList.toggle('custom-cursor-native', useNative);
      if (useNative) {
        document.documentElement.style.cursor = '';
        document.body.style.cursor = '';
      }
    };

    const handleMouseMove = (e) => {
      setPosition({ x: e.clientX, y: e.clientY });
      setHidden((prev) => (prev ? false : prev));

      const target =
        document.elementFromPoint(e.clientX, e.clientY) ||
        (e.target instanceof Element ? e.target : null);
      const useNative = shouldUseNativeCursor(target);
      if (nativeCursorZoneRef.current !== useNative) {
        nativeCursorZoneRef.current = useNative;
        applyBodyCursor(useNative);
        setNativeCursorZone(useNative);
      }

      clearTimeout(timeoutId);
    };

    const handleMouseLeave = () => {
      timeoutId = setTimeout(() => setHidden(true), 100);
    };

    const handleMouseEnter = () => {
      setHidden(false);
      clearTimeout(timeoutId);
    };

    const handleMouseDown = () => setClicked(true);
    const handleMouseUp = () => setClicked(false);

    document.documentElement.classList.add('has-custom-cursor');
    document.body.classList.add('has-custom-cursor');

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.documentElement.classList.remove('has-custom-cursor', 'custom-cursor-native');
      document.body.classList.remove('has-custom-cursor', 'custom-cursor-native');
      document.documentElement.style.cursor = '';
      document.body.style.cursor = '';
      clearTimeout(timeoutId);
    };
  }, [isTouchDevice]);

  const cursorClasses = [
    'custom-cursor',
    hidden && 'cursor-hidden',
    clicked && 'cursor-clicked',
    nativeCursorZone && 'cursor-native-hidden',
  ]
    .filter(Boolean)
    .join(' ');

  if (isTouchDevice) {
    return null;
  }

  return (
    <div
      className={cursorClasses}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    />
  );
};

export default Cursor;
