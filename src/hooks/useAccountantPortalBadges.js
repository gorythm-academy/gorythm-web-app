import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { portalGet } from '../components/Portals/shared/portalApi';

export const ACCOUNTANT_PAYMENTS_UPDATED_EVENT = 'accountant-payments-updated';

export function countPendingBankReviews(payments = []) {
  return payments.filter(
    (p) =>
      p?.status === 'awaiting_review' &&
      p?.paymentMethod === 'bank' &&
      Boolean(p?.proofUrl)
  ).length;
}

export function useAccountantPortalBadges(enabled) {
  const location = useLocation();
  const [badges, setBadges] = useState({ payments: 0 });

  const refresh = useCallback(() => {
    if (!enabled) return;
    portalGet('/accountant/payments')
      .then((res) => {
        const payments = res.success ? res.payments || [] : [];
        setBadges({ payments: countPendingBankReviews(payments) });
      })
      .catch(() => {
        setBadges({ payments: 0 });
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onUpdated = () => refresh();
    window.addEventListener(ACCOUNTANT_PAYMENTS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ACCOUNTANT_PAYMENTS_UPDATED_EVENT, onUpdated);
  }, [enabled, refresh]);

  return badges;
}
