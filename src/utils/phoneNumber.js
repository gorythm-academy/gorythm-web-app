import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/mobile';
import examples from 'libphonenumber-js/mobile/examples';

export const WHATSAPP_PHONE_MESSAGES = {
  required: 'Please enter your WhatsApp number.',
  invalid: 'Enter a valid WhatsApp number for the selected country.',
  optionalInvalid: 'Enter a valid WhatsApp number for the selected country, or leave the field empty.',
};

const REGION_NAMES = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

function flagEmoji(iso2) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

let countryCache = null;

export function getPhoneCountries() {
  if (countryCache) return countryCache;
  countryCache = getCountries()
    .map((iso2) => ({
      iso2,
      name: REGION_NAMES?.of(iso2) || iso2,
      dialCode: getCountryCallingCode(iso2),
      flag: flagEmoji(iso2),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return countryCache;
}

export function isSupportedCountry(iso2) {
  return Boolean(iso2) && getCountries().includes(iso2);
}

function regionFromLocale(locale) {
  if (!locale) return '';
  try {
    const region = new Intl.Locale(String(locale)).region || '';
    if (/^[A-Z]{2}$/.test(region) && isSupportedCountry(region)) return region;
  } catch {
    // Ignore malformed locale tags.
  }
  const match = String(locale).match(/[-_]([A-Za-z]{2})\b/);
  const region = match ? match[1].toUpperCase() : '';
  return isSupportedCountry(region) ? region : '';
}

/** Academy is in the Netherlands, so NL is the fallback when the browser has no region. */
export function detectDefaultCountry(locales) {
  const list = locales
    || (typeof navigator !== 'undefined'
      ? (navigator.languages?.length ? navigator.languages : [navigator.language])
      : []);
  for (const locale of list || []) {
    const region = regionFromLocale(locale);
    if (region) return region;
  }
  return 'NL';
}

export function nationalPlaceholder(country) {
  if (!isSupportedCountry(country)) return '';
  try {
    const example = getExampleNumber(country, examples);
    return example ? example.formatNational() : '';
  } catch {
    return '';
  }
}

function emptyResult(country) {
  return { country, nationalDisplay: '', e164: '', status: 'empty' };
}

function validResult(parsed, fallbackCountry) {
  const country = parsed.country || fallbackCountry;
  return {
    country,
    nationalDisplay: parsed.country ? parsed.formatNational() : parsed.nationalNumber,
    e164: parsed.number,
    status: 'valid',
  };
}

function internationalCandidate(raw) {
  const compact = String(raw)
    .trim()
    .replace(/^tel:/i, '')
    .replace(/[\s().-]/g, '');
  if (compact.startsWith('+')) return `+${compact.slice(1).replace(/\D/g, '')}`;
  if (compact.startsWith('00')) return `+${compact.slice(2).replace(/\D/g, '')}`;
  return '';
}

/**
 * Turn what the visitor typed into a national display value and, when complete,
 * an E.164 WhatsApp number. A leading + or 00 selects the country from the number.
 * A pasted full number without + is accepted only when it is a valid international number.
 */
export function assessPhoneInput(raw, country, { allowImplicitInternational = false } = {}) {
  const selected = isSupportedCountry(country) ? country : 'NL';
  const text = String(raw ?? '');
  const candidate = internationalCandidate(text);

  if (candidate) {
    if (candidate === '+') {
      return { country: selected, nationalDisplay: '+', e164: '', status: 'invalid' };
    }
    const parsed = parsePhoneNumberFromString(candidate);
    if (parsed?.isValid()) return validResult(parsed, selected);
    if (parsed?.country) {
      const partial = parsed.nationalNumber
        ? new AsYouType(parsed.country).input(parsed.nationalNumber)
        : '';
      return {
        country: parsed.country,
        nationalDisplay: partial,
        e164: '',
        status: 'invalid',
      };
    }
    return {
      country: selected,
      nationalDisplay: candidate,
      e164: '',
      status: 'invalid',
    };
  }

  const digits = text.replace(/\D/g, '').slice(0, 15);
  if (!digits) return emptyResult(selected);

  const national = parsePhoneNumberFromString(digits, selected);
  if (national?.isValid()) return validResult(national, selected);

  if (allowImplicitInternational && digits.length >= 8) {
    const implicit = parsePhoneNumberFromString(`+${digits}`);
    if (implicit?.isValid() && implicit.country) return validResult(implicit, selected);
  }

  return {
    country: selected,
    nationalDisplay: new AsYouType(selected).input(digits),
    e164: '',
    status: 'invalid',
  };
}

export function filterPhoneCountries(query) {
  const needle = String(query || '').trim().toLowerCase().replace(/^\+/, '');
  const countries = getPhoneCountries();
  if (!needle) return countries;
  return countries.filter((country) => (
    country.name.toLowerCase().includes(needle)
    || country.iso2.toLowerCase().includes(needle)
    || country.dialCode.startsWith(needle)
  ));
}
