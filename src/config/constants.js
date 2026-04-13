// Centralized project constants
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
/** Public site URL for UI placeholders and links (override in .env). */
export const SITE_URL = process.env.REACT_APP_SITE_URL || 'https://gorythm.com';
export const CONTACT_EMAIL = 'support@gorythm.com';
export const INFO_EMAIL = 'info@gorythm.com';
export const CONTACT_PHONE = '+31 684 427 025';
export const CONTACT_ADDRESS = 'Eindhoven, Netherlands';
export const FACEBOOK_URL = 'https://www.facebook.com/share/1ByY4R1aei/';
export const WHATSAPP_URL = 'https://wa.me/31684427025?text=I%27m%20interested%20in%20your%20courses';
export const YOUTUBE_URL = 'https://www.youtube.com/@alfarhanacademy';
export const INSTAGRAM_URL =
  'https://www.instagram.com/al_farhan_academy_?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==';
export const TIKTOK_URL = 'https://www.tiktok.com/@alfarhan621';

const constants = {
  API_BASE_URL,
  SITE_URL,
  CONTACT_EMAIL,
  INFO_EMAIL,
  CONTACT_PHONE,
  CONTACT_ADDRESS,
  FACEBOOK_URL,
  WHATSAPP_URL,
  YOUTUBE_URL,
  INSTAGRAM_URL,
  TIKTOK_URL,
};

export default constants;
