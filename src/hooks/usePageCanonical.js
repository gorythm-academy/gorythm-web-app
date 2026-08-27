import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_URL } from '../config/constants';

const DEFAULT_CANONICAL = `${SITE_URL.replace(/\/$/, '')}/`;

export function usePageCanonical() {
  const { pathname } = useLocation();

  useEffect(() => {
    const base = SITE_URL.replace(/\/$/, '');
    const href = pathname === '/' ? `${base}/` : `${base}${pathname}`;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);

    return () => {
      link.setAttribute('href', DEFAULT_CANONICAL);
    };
  }, [pathname]);
}
