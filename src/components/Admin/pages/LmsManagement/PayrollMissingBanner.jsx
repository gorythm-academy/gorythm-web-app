import React from 'react';
import { formatPayrollMonth } from './lmsHelpers';

const PayrollMissingBanner = ({ alerts }) => {
  if (!alerts?.length) return null;
  return (
    <div className="lms-payroll-missing-banner" role="alert">
      <i className="fas fa-exclamation-triangle" aria-hidden="true" />
      <div>
        <strong>
          {alerts.length} approved month{alerts.length === 1 ? '' : 's'} without payroll
        </strong>
        <p>Accountant must add a salary profile or generate payroll manually.</p>
        <ul>
          {alerts.map((a) => (
            <li key={a._id}>
              <strong>{a.teacher?.name || 'Teacher'}</strong> — {formatPayrollMonth(a.monthKey)}:{' '}
              {a.payrollMissingReason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default PayrollMissingBanner;
