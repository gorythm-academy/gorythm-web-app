const FX_CACHE_KEY = 'gorythm.fx.usd.v1';
const CURRENCY_CACHE_KEY = 'gorythm.currency.v1';
const CURRENCY_GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const USD = 'USD';

// Timezone → currency map. Works on localhost and any environment without API calls.
// Derived from IANA timezone names (Intl.DateTimeFormat().resolvedOptions().timeZone).
const TIMEZONE_TO_CURRENCY = {
  // South Asia
  'Asia/Karachi': 'PKR',
  'Asia/Kolkata': 'INR',
  'Asia/Calcutta': 'INR',
  'Asia/Dhaka': 'BDT',
  'Asia/Kathmandu': 'NPR',
  'Asia/Katmandu': 'NPR',
  'Asia/Colombo': 'LKR',
  // East Asia
  'Asia/Shanghai': 'CNY',
  'Asia/Chongqing': 'CNY',
  'Asia/Harbin': 'CNY',
  'Asia/Urumqi': 'CNY',
  'Asia/Tokyo': 'JPY',
  'Asia/Seoul': 'KRW',
  'Asia/Hong_Kong': 'HKD',
  'Asia/Taipei': 'TWD',
  // Southeast Asia
  'Asia/Singapore': 'SGD',
  'Asia/Kuala_Lumpur': 'MYR',
  'Asia/Jakarta': 'IDR',
  'Asia/Manila': 'PHP',
  'Asia/Bangkok': 'THB',
  'Asia/Ho_Chi_Minh': 'VND',
  'Asia/Saigon': 'VND',
  'Asia/Rangoon': 'MMK',
  'Asia/Yangon': 'MMK',
  // Middle East
  'Asia/Dubai': 'AED',
  'Asia/Muscat': 'OMR',
  'Asia/Riyadh': 'SAR',
  'Asia/Qatar': 'QAR',
  'Asia/Kuwait': 'KWD',
  'Asia/Bahrain': 'BHD',
  'Asia/Aden': 'YER',
  'Asia/Baghdad': 'IQD',
  'Asia/Tehran': 'IRR',
  'Asia/Amman': 'JOD',
  'Asia/Beirut': 'LBP',
  'Asia/Jerusalem': 'ILS',
  'Asia/Gaza': 'ILS',
  // Central Asia
  'Asia/Tashkent': 'UZS',
  'Asia/Almaty': 'KZT',
  'Asia/Tbilisi': 'GEL',
  'Asia/Baku': 'AZN',
  'Asia/Yerevan': 'AMD',
  // Europe
  'Europe/London': 'GBP',
  'Europe/Dublin': 'EUR',
  'Europe/Paris': 'EUR',
  'Europe/Berlin': 'EUR',
  'Europe/Rome': 'EUR',
  'Europe/Madrid': 'EUR',
  'Europe/Amsterdam': 'EUR',
  'Europe/Brussels': 'EUR',
  'Europe/Vienna': 'EUR',
  'Europe/Zurich': 'CHF',
  'Europe/Stockholm': 'SEK',
  'Europe/Oslo': 'NOK',
  'Europe/Copenhagen': 'DKK',
  'Europe/Warsaw': 'PLN',
  'Europe/Prague': 'CZK',
  'Europe/Budapest': 'HUF',
  'Europe/Bucharest': 'RON',
  'Europe/Sofia': 'BGN',
  'Europe/Helsinki': 'EUR',
  'Europe/Lisbon': 'EUR',
  'Europe/Athens': 'EUR',
  'Europe/Moscow': 'RUB',
  'Europe/Kiev': 'UAH',
  'Europe/Kyiv': 'UAH',
  'Europe/Istanbul': 'TRY',
  'Europe/Belgrade': 'RSD',
  // Americas
  'America/New_York': 'USD',
  'America/Chicago': 'USD',
  'America/Denver': 'USD',
  'America/Los_Angeles': 'USD',
  'America/Phoenix': 'USD',
  'America/Anchorage': 'USD',
  'Pacific/Honolulu': 'USD',
  'America/Toronto': 'CAD',
  'America/Vancouver': 'CAD',
  'America/Winnipeg': 'CAD',
  'America/Halifax': 'CAD',
  'America/Sao_Paulo': 'BRL',
  'America/Manaus': 'BRL',
  'America/Buenos_Aires': 'ARS',
  'America/Argentina/Buenos_Aires': 'ARS',
  'America/Santiago': 'CLP',
  'America/Bogota': 'COP',
  'America/Lima': 'PEN',
  'America/Mexico_City': 'MXN',
  'America/Monterrey': 'MXN',
  'America/Caracas': 'VES',
  'America/Montevideo': 'UYU',
  // Africa
  'Africa/Cairo': 'EGP',
  'Africa/Lagos': 'NGN',
  'Africa/Nairobi': 'KES',
  'Africa/Johannesburg': 'ZAR',
  'Africa/Casablanca': 'MAD',
  'Africa/Addis_Ababa': 'ETB',
  'Africa/Algiers': 'DZD',
  'Africa/Tunis': 'TND',
  'Africa/Tripoli': 'LYD',
  'Africa/Khartoum': 'SDG',
  'Africa/Accra': 'GHS',
  'Africa/Dar_es_Salaam': 'TZS',
  'Africa/Kampala': 'UGX',
  'Africa/Lusaka': 'ZMW',
  // Oceania
  'Australia/Sydney': 'AUD',
  'Australia/Melbourne': 'AUD',
  'Australia/Brisbane': 'AUD',
  'Australia/Perth': 'AUD',
  'Australia/Adelaide': 'AUD',
  'Pacific/Auckland': 'NZD',
  'Pacific/Fiji': 'FJD',
};

const inferCurrencyFromTimezone = (timezone) => {
  if (!timezone) return null;
  return TIMEZONE_TO_CURRENCY[timezone] || null;
};

const LOCALE_REGION_TO_CURRENCY = {
  US: 'USD',
  GB: 'GBP',
  AU: 'AUD',
  CA: 'CAD',
  NZ: 'NZD',
  IN: 'INR',
  PK: 'PKR',
  BD: 'BDT',
  NP: 'NPR',
  LK: 'LKR',
  CN: 'CNY',
  JP: 'JPY',
  KR: 'KRW',
  SG: 'SGD',
  HK: 'HKD',
  MY: 'MYR',
  TH: 'THB',
  ID: 'IDR',
  PH: 'PHP',
  VN: 'VND',
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  KW: 'KWD',
  BH: 'BHD',
  OM: 'OMR',
  EG: 'EGP',
  ZA: 'ZAR',
  NG: 'NGN',
  KE: 'KES',
  ET: 'ETB',
  TR: 'TRY',
  RU: 'RUB',
  UA: 'UAH',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
  HR: 'EUR',
  RS: 'RSD',
  AL: 'ALL',
  MK: 'MKD',
  BA: 'BAM',
  ME: 'EUR',
  SI: 'EUR',
  SK: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  CY: 'EUR',
  EE: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  GR: 'EUR',
  IE: 'EUR',
  IT: 'EUR',
  LV: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  ES: 'EUR',
  AR: 'ARS',
  BR: 'BRL',
  CL: 'CLP',
  CO: 'COP',
  MX: 'MXN',
  PE: 'PEN',
  UY: 'UYU',
  VE: 'VES',
};

const isObject = (value) => value != null && typeof value === 'object';

const readCache = (key, ttlMs) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    const { data, ts } = parsed;
    if (!ts || Date.now() - ts > ttlMs) return null;
    return data;
  } catch {
    return null;
  }
};

const writeCache = (key, data) => {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        ts: Date.now(),
        data,
      })
    );
  } catch {
    // Ignore storage failures.
  }
};

const getLocaleRegion = (locale) => {
  if (!locale) return '';
  const parts = String(locale).replace('_', '-').split('-');
  return parts[1] ? parts[1].toUpperCase() : '';
};

const inferCurrencyFromLocale = (locale) => {
  const region = getLocaleRegion(locale);
  return LOCALE_REGION_TO_CURRENCY[region] || USD;
};

const detectFromIpApi = async () => {
  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) return null;
  const data = await res.json();
  const currency = data?.currency;
  const country = data?.country_code;
  if (!currency || typeof currency !== 'string') return null;
  return {
    currency: currency.toUpperCase(),
    countryCode: typeof country === 'string' ? country.toUpperCase() : '',
    source: 'geo',
  };
};

const detectFromIpWho = async () => {
  const res = await fetch('https://ipwho.is/');
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.success === false) return null;
  const currency = data?.currency?.code;
  const country = data?.country_code;
  if (!currency || typeof currency !== 'string') return null;
  return {
    currency: currency.toUpperCase(),
    countryCode: typeof country === 'string' ? country.toUpperCase() : '',
    source: 'geo',
  };
};

export const detectUserCurrency = async () => {
  // Only use geo-confirmed cache (never serve stale locale/USD fallback from cache).
  const cached = readCache(CURRENCY_CACHE_KEY, CURRENCY_GEO_CACHE_TTL_MS);
  if (cached?.currency && cached?.source === 'geo') return cached;

  const intlOptions = Intl.DateTimeFormat().resolvedOptions();
  const locale = intlOptions.locale || 'en-US';
  const timezone = intlOptions.timeZone || '';

  // 1. Try geo IP detection (most accurate, but fails on localhost/rate-limit).
  try {
    const geo = (await detectFromIpApi()) || (await detectFromIpWho());
    if (geo?.currency) {
      const result = { ...geo, locale };
      writeCache(CURRENCY_CACHE_KEY, result);
      return result;
    }
  } catch {
    // Fall through to timezone detection.
  }

  // 2. Timezone-based detection (always works, no API needed, very accurate).
  const tzCurrency = inferCurrencyFromTimezone(timezone);
  if (tzCurrency) {
    const result = {
      currency: tzCurrency,
      countryCode: getLocaleRegion(locale),
      locale,
      source: 'timezone',
    };
    writeCache(CURRENCY_CACHE_KEY, result);
    return result;
  }

  // 3. Locale-based detection (least reliable — Windows often returns just "en").
  const localeCurrency = inferCurrencyFromLocale(locale);
  const result = {
    currency: localeCurrency,
    countryCode: getLocaleRegion(locale),
    locale,
    source: 'locale',
  };
  writeCache(CURRENCY_CACHE_KEY, result);
  return result;
};

export const fetchUsdRates = async () => {
  const cached = readCache(FX_CACHE_KEY, FX_CACHE_TTL_MS);
  if (cached?.rates) return cached;

  const endpoints = [
    'https://open.er-api.com/v6/latest/USD',
    'https://api.exchangerate-api.com/v4/latest/USD',
  ];

  let data = null;
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) continue;
      const json = await res.json();
      if (isObject(json?.rates)) {
        data = json;
        break;
      }
    } catch {
      // Try next endpoint.
    }
  }

  if (!isObject(data?.rates)) {
    throw new Error('Failed to fetch exchange rates from all providers');
  }

  const payload = {
    base: data.base_code || USD,
    rates: data.rates,
    date: data.time_last_update_utc || data.date || '',
  };
  writeCache(FX_CACHE_KEY, payload);
  return payload;
};

export const convertFromUsd = (amountUsd, currency, rates) => {
  const n = Number(amountUsd);
  if (!Number.isFinite(n)) return 0;
  if (!currency || currency === USD) return n;
  const rate = rates?.[currency];
  if (!Number.isFinite(rate) || rate <= 0) return n;
  return n * rate;
};

export const formatCurrency = (amount, currency, locale = 'en-US') => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || USD,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: USD,
      maximumFractionDigits: 2,
    }).format(n);
  }
};

export const parsePriceAmount = (value) => {
  if (value == null || value === '') return NaN;
  const direct = Number(value);
  if (!Number.isNaN(direct)) return direct;
  const match = String(value).match(/[\d.]+/);
  return match ? Number(match[0]) : NaN;
};

export const USD_CURRENCY = USD;
