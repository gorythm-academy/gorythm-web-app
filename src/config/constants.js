// Centralized project constants
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://gorythmacademy.com';
/** Public site URL for UI placeholders and links (override in .env). */
export const SITE_URL = process.env.REACT_APP_SITE_URL || 'https://gorythmacademy.com';
export const CONTACT_EMAIL = 'support@gorythmacademy.com';
/** Optional env: full bank-transfer notice as plain text (replaces default composed message on the payment page). */
export const BANK_TRANSFER_NOTE_CUSTOM = process.env.REACT_APP_BANK_TRANSFER_NOTE || '';
/** Default bank-transfer copy before the linked support email (when `BANK_TRANSFER_NOTE_CUSTOM` is empty). */
export const BANK_TRANSFER_NOTE_DEFAULT_LEAD =
  'After you submit, we will email you at the address you provide with our bank details and the payment reference to use. Your enrollment stays pending until we confirm receipt. Questions:';
/** Full default notice including plain-text email (e.g. default export); prefer composing with mailto in UI. */
export const BANK_TRANSFER_NOTE =
  BANK_TRANSFER_NOTE_CUSTOM ||
  `${BANK_TRANSFER_NOTE_DEFAULT_LEAD} ${CONTACT_EMAIL}.`;
export const INFO_EMAIL = 'gorythm.academy@gmail.com';
export const CONTACT_PHONE = '+31 684 427 025';
export const CONTACT_ADDRESS = 'Eindhoven, Netherlands';
export const FACEBOOK_URL = 'https://www.facebook.com/share/1B437rw5Dk/';
/** E.164 digits only (no +), for wa.me / api / deep links. */
export const WHATSAPP_PHONE_DIGITS = '31684427025';
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

/** Shown when users open “Privacy Policy” from subscribe forms (email updates consent). */
export const SUBSCRIBE_PRIVACY_POLICY_BODY =
  'By subscribing, you agree to receive updates about courses, programs, events, and learning resources from Gorythm Academy. Your information will remain private and will never be shared or sold to third parties. You may unsubscribe at any time.';

const constants = {
  API_BASE_URL,
  SITE_URL,
  CONTACT_EMAIL,
  BANK_TRANSFER_NOTE,
  BANK_TRANSFER_NOTE_CUSTOM,
  BANK_TRANSFER_NOTE_DEFAULT_LEAD,
  INFO_EMAIL,
  CONTACT_PHONE,
  CONTACT_ADDRESS,
  FACEBOOK_URL,
  WHATSAPP_URL,
  WHATSAPP_PHONE_DIGITS,
  WHATSAPP_PRESET_MESSAGE,
  getWhatsAppDirectUrl,
  onWhatsAppAnchorClick,
  YOUTUBE_URL,
  INSTAGRAM_URL,
  TIKTOK_URL,
};

export default constants;
