import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BASE_CURRENCY,
  convertFromBase,
  detectUserCurrency,
  fetchBaseRates,
  formatCurrency,
  formatCurrencyWhole,
} from '../utils/currency';

const CurrencyContext = createContext(null);

export const CurrencyProvider = ({ children }) => {
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [locale, setLocale] = useState('en-US');
  const [countryCode, setCountryCode] = useState('');
  const [rates, setRates] = useState({ EUR: 1 });
  const [rateDate, setRateDate] = useState('');
  const [source, setSource] = useState('default');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsLoading(true);
      const [detectedResult, ratesResult] = await Promise.allSettled([
        detectUserCurrency(),
        fetchBaseRates(),
      ]);
      if (cancelled) return;

      const localeFallback = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
      const detected = detectedResult.status === 'fulfilled' ? detectedResult.value : null;
      const ratePayload = ratesResult.status === 'fulfilled' ? ratesResult.value : null;

      const detectedCurrency = detected?.currency || BASE_CURRENCY;
      const loadedRates = ratePayload?.rates || null;
      const rateBase = String(ratePayload?.base || BASE_CURRENCY).toUpperCase();
      const rate = loadedRates?.[detectedCurrency];
      const canConvert =
        detectedCurrency === rateBase ||
        (Number.isFinite(Number(rate)) && Number(rate) > 0);

      setCurrency(canConvert ? detectedCurrency : rateBase);
      setLocale(detected?.locale || localeFallback);
      setCountryCode(detected?.countryCode || '');
      setSource(detected?.source || 'fallback');
      setRates(loadedRates || { [rateBase]: 1 });
      setRateDate(ratePayload?.date || '');
      setIsLoading(false);
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyCurrencyCode = useCallback((code) => {
    const next = String(code || '').trim().toUpperCase();
    if (!next || next.length !== 3) return;
    if (rates[next] == null && next !== BASE_CURRENCY) return;
    setCurrency(next);
  }, [rates]);

  const value = useMemo(() => {
    const convertBase = (amountBase) => convertFromBase(amountBase, currency, rates);

    const formatFromBase = (amountBase) => {
      const converted = convertBase(amountBase);
      return formatCurrency(converted, currency, locale);
    };

    const formatFromBaseWhole = (amountBase) => {
      const converted = convertBase(amountBase);
      return formatCurrencyWhole(converted, currency, locale);
    };

    return {
      currency,
      locale,
      countryCode,
      rates,
      rateDate,
      source,
      isLoading,
      convertBase,
      formatFromBase,
      formatFromBaseWhole,
      formatCurrency: (amount) => formatCurrency(amount, currency, locale),
      baseCurrency: BASE_CURRENCY,
      applyCurrencyCode,
    };
  }, [applyCurrencyCode, countryCode, currency, isLoading, locale, rateDate, rates, source]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return ctx;
};
