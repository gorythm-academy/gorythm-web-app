import { assessPhoneInput, detectDefaultCountry, filterPhoneCountries } from './phoneNumber';

describe('whatsapp phone input', () => {
  test('uses the browser region, then the Netherlands', () => {
    expect(detectDefaultCountry(['ur-PK', 'en'])).toBe('PK');
    expect(detectDefaultCountry(['en'])).toBe('NL');
    expect(detectDefaultCountry([])).toBe('NL');
  });

  test('accepts a national mobile number for the selected country', () => {
    const result = assessPhoneInput('0301 2345678', 'PK');
    expect(result).toMatchObject({
      country: 'PK',
      e164: '+923012345678',
      status: 'valid',
    });
    expect(result.nationalDisplay).toContain('301');
  });

  test('reads a pasted international number and selects its country', () => {
    const prefixed = assessPhoneInput('+31 6 12345678', 'PK');
    expect(prefixed).toMatchObject({ country: 'NL', e164: '+31612345678', status: 'valid' });

    const zeros = assessPhoneInput('00923012345678', 'NL');
    expect(zeros).toMatchObject({ country: 'PK', e164: '+923012345678', status: 'valid' });
  });

  test('accepts a pasted full number that omitted the plus only when asked', () => {
    const typed = assessPhoneInput('31612345678', 'PK');
    expect(typed.status).toBe('invalid');
    expect(typed.e164).toBe('');

    const pasted = assessPhoneInput('31612345678', 'PK', { allowImplicitInternational: true });
    expect(pasted).toMatchObject({ country: 'NL', e164: '+31612345678', status: 'valid' });
  });

  test('rejects a landline and an incomplete number', () => {
    expect(assessPhoneInput('+31201234567', 'NL').status).toBe('invalid');
    expect(assessPhoneInput('0301', 'PK')).toMatchObject({ country: 'PK', e164: '', status: 'invalid' });
    expect(assessPhoneInput('', 'PK').status).toBe('empty');
    expect(assessPhoneInput('+', 'NL')).toMatchObject({ nationalDisplay: '+', status: 'invalid' });
  });

  test('searches by country name and calling code', () => {
    const byName = filterPhoneCountries('nether');
    expect(byName.some((country) => country.iso2 === 'NL')).toBe(true);
    const byCode = filterPhoneCountries('+92');
    expect(byCode.some((country) => country.iso2 === 'PK')).toBe(true);
    expect(byCode.every((country) => country.dialCode.startsWith('92'))).toBe(true);
  });
});
