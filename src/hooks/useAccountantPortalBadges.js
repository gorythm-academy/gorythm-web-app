import { useCallback, useEffect, useState } from 'react';
import { portalGet } from '../components/Portals/shared/portalApi';

export const ACCOUNTANT_PAYMENTS_UPDATED_EVENT = 'accountant-payments-updated';
export const ACCOUNTANT_PAYROLL_UPDATED_EVENT = 'accountant-payroll-updated';

export function notifyAccountantPayrollUpdated() {
  window.dispatchEvent(new Event(ACCOUNTANT_PAYROLL_UPDATED_EVENT));
}

export function countPendingBankReviews(payments = []) {
  return payments.filter(
    (p) =>
      p?.status === 'awaiting_review' &&
      p?.paymentMethod === 'bank' &&
      Boolean(p?.proofUrl)
  ).length;
}

export function useAccountantPortalBadges(enabled) {
  const [badges, setBadges] = useState({ payments: 0, payroll: 0 });

  const refresh = useCallback(() => {
    if (!enabled) return;
    portalGet('/accountant/badges')
      .then((res) => {
        if (!res?.success) throw new Error(res?.error || 'Failed to load badges');
        setBadges({
          payments: Number(res.payments) || 0,
          payroll: Number(res.payroll) || 0,
        });
      })
      .catch((err) => {
        console.warn('Accountant portal badges failed:', err);
        setBadges({ payments: 0, payroll: 0 });
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onUpdated = () => refresh();
    window.addEventListener(ACCOUNTANT_PAYMENTS_UPDATED_EVENT, onUpdated);
    window.addEventListener(ACCOUNTANT_PAYROLL_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(ACCOUNTANT_PAYMENTS_UPDATED_EVENT, onUpdated);
      window.removeEventListener(ACCOUNTANT_PAYROLL_UPDATED_EVENT, onUpdated);
    };
  }, [enabled, refresh]);

  return badges;
}
