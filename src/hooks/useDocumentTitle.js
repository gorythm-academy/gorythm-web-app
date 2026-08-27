import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    if (typeof document === 'undefined' || !title) return undefined;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
