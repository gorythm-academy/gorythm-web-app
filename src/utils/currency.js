const FX_CACHE_KEY = 'gorythm.fx.usd.v1';
const CURRENCY_CACHE_KEY = 'gorythm.currency.v1';
const CURRENCY_GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CURRENCY_FALLBACK_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const USD = 'USD';

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
  const cached = readCache(CURRENCY_CACHE_KEY, CURRENCY_GEO_CACHE_TTL_MS);
  if (cached?.currency && cached?.source === 'geo') return cached;
  const fallbackCached = readCache(CURRENCY_CACHE_KEY, CURRENCY_FALLBACK_CACHE_TTL_MS);
  if (fallbackCached?.currency && fallbackCached?.source !== 'geo') return fallbackCached;

  const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  try {
    const geo = (await detectFromIpApi()) || (await detectFromIpWho());
    if (geo?.currency) {
      const result = { ...geo, locale };
      writeCache(CURRENCY_CACHE_KEY, result);
      return result;
    }
  } catch {
    // Continue to locale fallback.
  }

  const fallback = {
    currency: inferCurrencyFromLocale(locale),
    countryCode: getLocaleRegion(locale),
    locale,
    source: 'locale',
  };
  writeCache(CURRENCY_CACHE_KEY, fallback);
  return fallback;
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
