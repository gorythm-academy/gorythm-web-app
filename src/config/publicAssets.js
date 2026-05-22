/** Stable URLs under `public/` (not hashed by CRA). Keep in sync with `scripts/generate-modern-image-variants.mjs`. */
const p = process.env.PUBLIC_URL || '';

export function publicAsset(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${p}${normalized}`;
}

export const HERO_CENTER_LOGO_AVIF = publicAsset('/images/hero/center-logo-240.avif');
export const HERO_CENTER_LOGO_WEBP = publicAsset('/images/hero/center-logo-240.webp');

export const BRAND_LOGO_AVIF = publicAsset('/images/brand/logo-header-320.avif');
export const BRAND_LOGO_WEBP = publicAsset('/images/brand/logo-header-320.webp');
export const BRAND_LOGO_PNG = publicAsset('/images/brand/logo-header-320.png');
