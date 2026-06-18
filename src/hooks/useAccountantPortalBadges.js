import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { portalGet, payrollGet } from '../components/Portals/shared/portalApi';

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
  const location = useLocation();
  const [badges, setBadges] = useState({ payments: 0, payroll: 0 });

  const refresh = useCallback(() => {
    if (!enabled) return;
    Promise.all([portalGet('/accountant/payments'), payrollGet('/runs?status=pending_review')])
      .then(([payRes, payrollRes]) => {
        const payments = payRes.success ? payRes.payments || [] : [];
        const payrollRuns = payrollRes.runs || [];
        setBadges({
          payments: countPendingBankReviews(payments),
          payroll: payrollRuns.length,
        });
      })
      .catch((err) => {
        console.warn('Accountant portal badges failed:', err);
        setBadges({ payments: 0, payroll: 0 });
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

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
