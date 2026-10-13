/**
 * Single place that reads build-time environment variables.
 *
 * `VITE_*` is the current prefix; the legacy `REACT_APP_*` names (from Create React App) are still
 * honoured so existing `.env` files and hosting settings keep working without changes.
 */
const env = import.meta.env;

const pick = (viteValue, legacyValue) => viteValue || legacyValue || '';

/** Backend base URL; empty means "same origin" (dev proxy) or the production default. */
export const ENV_API_URL = pick(env.VITE_API_URL, env.REACT_APP_API_URL);

/** Public website URL override. */
export const ENV_SITE_URL = pick(env.VITE_SITE_URL, env.REACT_APP_SITE_URL);

/** `true` only while running the Vite dev server (not in tests or production builds). */
export const IS_DEV_SERVER = env.MODE === 'development';

/** URL prefix of the `public/` folder without a trailing slash ('' when served from the site root). */
export const PUBLIC_URL = (env.BASE_URL || '/').replace(/\/$/, '');
