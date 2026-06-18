import { useCallback, useEffect, useRef, useState } from 'react';

export function useResizableTableColumns(storageKey, defaultWidths) {
  const [widths, setWidths] = useState(() => {
    if (typeof window === 'undefined') return { ...defaultWidths };
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved === 'object') return { ...defaultWidths, ...saved };
    } catch {
      /* ignore */
    }
    return { ...defaultWidths };
  });

  const resizeRef = useRef({ key: null, startX: 0, startWidth: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      /* ignore */
    }
  }, [storageKey, widths]);

  const startResize = useCallback(
    (key, event) => {
      event.preventDefault();
      resizeRef.current = {
        key,
        startX: event.clientX,
        startWidth: Number(widths[key]) || Number(defaultWidths[key]) || 100,
      };

      const onMove = (moveEvent) => {
        const { key: colKey, startX, startWidth } = resizeRef.current;
        if (!colKey) return;
        const next = Math.max(60, startWidth + (moveEvent.clientX - startX));
        setWidths((prev) => ({ ...prev, [colKey]: next }));
      };

      const onUp = () => {
        resizeRef.current.key = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [defaultWidths, widths]
  );

  const resetWidths = useCallback(() => {
    setWidths({ ...defaultWidths });
  }, [defaultWidths]);

  return { widths, startResize, resetWidths };
}
