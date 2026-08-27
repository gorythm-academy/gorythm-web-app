import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import {
  convertFromUsd,
  detectUserCurrency,
  fetchUsdRates,
  formatCurrency,
  formatCurrencyWhole,
  USD_CURRENCY,
} from '../utils/currency';

const CurrencyContext = createContext(null);

export const CurrencyProvider = ({ children }) => {
  const [currency, setCurrency] = useState(USD_CURRENCY);
  const [locale, setLocale] = useState('en-US');
  const [countryCode, setCountryCode] = useState('');
  const [rates, setRates] = useState({ USD: 1 });
  const [rateDate, setRateDate] = useState('');
  const [source, setSource] = useState('default');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setIsLoading(true);
      const [detectedResult, ratesResult] = await Promise.allSettled([
        detectUserCurrency(),
        fetchUsdRates(),
      ]);
      if (cancelled) return;

      const localeFallback = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
      const detected = detectedResult.status === 'fulfilled' ? detectedResult.value : null;
      const ratePayload = ratesResult.status === 'fulfilled' ? ratesResult.value : null;

      setCurrency(detected?.currency || USD_CURRENCY);
      setLocale(detected?.locale || localeFallback);
      setCountryCode(detected?.countryCode || '');
      setSource(detected?.source || 'fallback');
      setRates(ratePayload?.rates || { USD: 1 });
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
    if (rates[next] == null && next !== USD_CURRENCY) return;
    setCurrency(next);
  }, [rates]);

  const value = useMemo(() => {
    const convertUsd = (amountUsd) => convertFromUsd(amountUsd, currency, rates);

    const formatFromUsd = (amountUsd) => {
      const converted = convertUsd(amountUsd);
      return formatCurrency(converted, currency, locale);
    };

    const formatFromUsdWhole = (amountUsd) => {
      const converted = convertUsd(amountUsd);
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
      convertUsd,
      formatFromUsd,
      formatFromUsdWhole,
      formatCurrency: (amount) => formatCurrency(amount, currency, locale),
      baseCurrency: USD_CURRENCY,
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
