import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE_URL } from '../config/constants';

const DEFAULT_DESCRIPTION =
  'Built with Signs. Discover Yourself. Gorythm Academy develops IQ, EQ, and PhQ through structured courses and research rooted in timeless principles for whole-person growth.';

const DEFAULT_IMAGE = `${SITE_URL.replace(/\/$/, '')}/logo.png`;

const STATIC_PAGE_META = {
  '/': {
    title: 'Gorythm Academy | Online Education Platform',
    description: DEFAULT_DESCRIPTION,
  },
  '/about': {
    title: 'About | Gorythm Academy',
    description:
      'Learn about Gorythm Academy — research-driven education for IQ, EQ, and PhQ growth through structured courses and purposeful learning.',
  },
  '/contact': {
    title: 'Contact | Gorythm Academy',
    description: 'Get in touch with Gorythm Academy for course enquiries, enrollment support, and general questions.',
  },
  '/privacy': {
    title: 'Privacy Policy | Gorythm Academy',
    description: 'How Gorythm Academy collects, uses, and protects personal data for courses, portals, and payments.',
  },
  '/terms': {
    title: 'Terms of Service | Gorythm Academy',
    description: 'Terms for using Gorythm Academy courses, accounts, and paid enrollments.',
  },
  '/refunds': {
    title: 'Refund Policy | Gorythm Academy',
    description: 'When and how Gorythm Academy refunds course payments.',
  },
  '/cookies': {
    title: 'Cookie Policy | Gorythm Academy',
    description: 'Cookies and browser storage used by Gorythm Academy, including login and payment providers.',
  },
  '/unsubscribe': {
    title: 'Unsubscribe | Gorythm Academy',
    description: 'Unsubscribe from Gorythm Academy course update emails.',
  },
  '/courses': {
    title: 'Courses | Gorythm Academy',
    description: 'Browse Gorythm Academy courses designed for intellectual, emotional, and physical growth.',
  },
  '/research': {
    title: 'Research | Gorythm Academy',
    description: 'Read Gorythm Academy research articles on faith, science, character, and purposeful learning.',
  },
  '/login': {
    title: 'Student Login | Gorythm Academy',
    description: 'Sign in to the Gorythm Academy student, teacher, parent, or staff portal.',
  },
  '/mission/iq': {
    title: 'IQ Mission | Gorythm Academy',
    description: 'Intellectual growth at Gorythm Academy — structured learning grounded in timeless principles.',
  },
  '/mission/eq': {
    title: 'EQ Mission | Gorythm Academy',
    description: 'Emotional intelligence at Gorythm Academy — clarity, resilience, and character under pressure.',
  },
  '/mission/phq': {
    title: 'PhQ Mission | Gorythm Academy',
    description: 'Physical health and discipline at Gorythm Academy — vitality as the foundation of growth.',
  },
};

function upsertMeta(attr, key, content) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.querySelector(selector);
  if (!content) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function applyPageMeta({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  type = 'website',
  url,
  jsonLd = null,
}) {
  const base = SITE_URL.replace(/\/$/, '');
  const pageUrl = url || (typeof window !== 'undefined' ? window.location.href : `${base}/`);
  const absoluteImage = image?.startsWith('http') ? image : `${base}${image?.startsWith('/') ? '' : '/'}${image || 'logo.png'}`;

  if (title) document.title = title;

  upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:type', type);
  upsertMeta('property', 'og:url', pageUrl);
  upsertMeta('property', 'og:image', absoluteImage);
  upsertMeta('name', 'twitter:card', 'summary_large_image');
  upsertMeta('name', 'twitter:title', title);
  upsertMeta('name', 'twitter:description', description);
  upsertMeta('name', 'twitter:image', absoluteImage);

  const jsonId = 'page-json-ld';
  const existing = document.getElementById(jsonId);
  if (jsonLd) {
    let script = existing;
    if (!script) {
      script = document.createElement('script');
      script.id = jsonId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);
  } else if (existing) {
    existing.remove();
  }
}

export function usePageMeta(meta, { enabled = true } = {}) {
  const title = meta?.title;
  const description = meta?.description;
  const image = meta?.image;
  const type = meta?.type;
  const url = meta?.url;
  const jsonLd = meta?.jsonLd;
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    if (!enabled || !title) return undefined;
    const previousTitle = document.title;
    applyPageMeta({ title, description, image, type, url, jsonLd });
    return () => {
      document.title = previousTitle;
    };
  }, [enabled, title, description, image, type, url, jsonLdKey, jsonLd]);
}

const NOINDEX_PATHS = new Set(['/payment', '/payment-success', '/payment-cancel', '/admin/login']);

function syncRobots(noindex) {
  upsertMeta('name', 'robots', noindex ? 'noindex' : '');
}

export function RoutePageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!NOINDEX_PATHS.has(pathname)) return undefined;
    syncRobots(true);
    return () => syncRobots(false);
  }, [pathname]);
  const isDynamic =
    /^\/(courses|research|payment|admin|student|teacher|parent|accountant)\/[^/]+/.test(pathname);
  const staticMeta = STATIC_PAGE_META[pathname];
  usePageMeta(
    staticMeta
      ? {
          ...staticMeta,
          image: DEFAULT_IMAGE,
          url: `${SITE_URL.replace(/\/$/, '')}${pathname === '/' ? '/' : pathname}`,
        }
      : null,
    { enabled: Boolean(staticMeta) && !isDynamic }
  );
  return null;
}

export function buildArticleJsonLd({ title, description, url, image, datePublished, author }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    url,
    image: image ? [image] : undefined,
    datePublished: datePublished || undefined,
    author: author
      ? { '@type': 'Person', name: author }
      : { '@type': 'Organization', name: 'Gorythm Academy' },
    publisher: {
      '@type': 'Organization',
      name: 'Gorythm Academy',
      logo: { '@type': 'ImageObject', url: DEFAULT_IMAGE },
    },
  };
}

export { DEFAULT_DESCRIPTION, DEFAULT_IMAGE, STATIC_PAGE_META };
