// Centralized project constants
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
/** Public site URL for UI placeholders and links (override in .env). */
export const SITE_URL = process.env.REACT_APP_SITE_URL || 'https://gorythm.com';
export const CONTACT_EMAIL = 'support@gorythm.com';
/** Shown on payment page for bank transfer option (override with REACT_APP_BANK_TRANSFER_NOTE). */
export const BANK_TRANSFER_NOTE =
  process.env.REACT_APP_BANK_TRANSFER_NOTE ||
  `After you submit, we will email you at the address you provide with our bank details and the payment reference to use. Your enrollment stays pending until we confirm receipt. Questions: ${CONTACT_EMAIL}.`;
export const INFO_EMAIL = 'info@gorythm.com';
export const CONTACT_PHONE = '+31 684 427 025';
export const CONTACT_ADDRESS = 'Eindhoven, Netherlands';
export const FACEBOOK_URL = 'https://www.facebook.com/share/1ByY4R1aei/';
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
export const YOUTUBE_URL = 'https://www.youtube.com/@alfarhanacademy';
export const INSTAGRAM_URL =
  'https://www.instagram.com/al_farhan_academy_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==';
export const TIKTOK_URL = 'https://www.tiktok.com/@alfarhan621';

const constants = {
  API_BASE_URL,
  SITE_URL,
  CONTACT_EMAIL,
  BANK_TRANSFER_NOTE,
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
