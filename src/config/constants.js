// Centralized project constants
/** In dev, default to same-origin + setupProxy → localhost:5000 when unset. */
export const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === 'development' ? '' : 'https://gorythmacademy.com');
/** Public site URL for UI placeholders and links (override in .env). */
export const SITE_URL = process.env.REACT_APP_SITE_URL || 'https://gorythmacademy.com';
export const INFO_EMAIL = 'gorythm.academy@gmail.com';
/** Only this account is the system super-admin; cannot be deleted from the dashboard. */
export const PROTECTED_SUPER_ADMIN_EMAIL = INFO_EMAIL;
export const CONTACT_PHONE = '+31 638 938 387';
export const CONTACT_ADDRESS = 'Eindhoven, Netherlands';
export const FACEBOOK_URL = 'https://www.facebook.com/share/1B437rw5Dk/';
/** E.164 digits only (no +), for wa.me / api / deep links. */
export const WHATSAPP_PHONE_DIGITS = '31638938387';
export const WHATSAPP_PRESET_MESSAGE = "I'm interested in your courses";

/** Universal link; often shows an intermediate “app or web” screen in the browser. */
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE_DIGITS}?text=${encodeURIComponent(
  WHATSAPP_PRESET_MESSAGE
)}`;

/**
 * Chat URL that skips wa.me’s chooser when possible:
 * - Mobile/tablet: WhatsApp app deep link
 * - Desktop: WhatsApp Web compose (user must be logged in at web.whatsapp.com)
 */
export function getWhatsAppDirectUrl() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return WHATSAPP_URL;
  }
  const text = encodeURIComponent(WHATSAPP_PRESET_MESSAGE);
  const ua = navigator.userAgent || '';
  const isIpadOsSafari =
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  const isMobile =
    isIpadOsSafari ||
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  if (isMobile) {
    return `whatsapp://send?phone=${WHATSAPP_PHONE_DIGITS}&text=${text}`;
  }
  return `https://web.whatsapp.com/send?phone=${WHATSAPP_PHONE_DIGITS}&text=${text}`;
}

/** Use on WhatsApp `<a onClick={...}>`: same-window open for `whatsapp://` (better on iOS than target=_blank). */
export function onWhatsAppAnchorClick(e) {
  const url = getWhatsAppDirectUrl();
  if (url.startsWith('whatsapp:')) {
    e.preventDefault();
    window.location.href = url;
  }
}
export const YOUTUBE_URL = 'https://www.youtube.com/@GorythmAcademy';
export const INSTAGRAM_URL =
  'https://www.instagram.com/gorythm08?igsh=MWFjemEyNG5jb2FsMA==';
export const TIKTOK_URL = 'https://www.tiktok.com/@alfarhan621';
