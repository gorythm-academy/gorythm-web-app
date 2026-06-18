import React from 'react';
import {
  statusCalendarLabel,
  statusChipClass,
  TEACHER_MY_STATUS_OPTIONS,
} from '../../constants/attendanceStatuses';
import './PayrollMonthAttendanceModal.scss';

const STATUS_ICONS = {
  present: 'fa-check-circle',
  absent: 'fa-times-circle',
  late: 'fa-clock',
  leave: 'fa-umbrella-beach',
  holiday: 'fa-star',
};

const weekdayShort = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short' });
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const approvalChipClass = (status) => {
  if (status === 'approved') return 'payroll-attendance-approval--approved';
  if (status === 'rejected') return 'payroll-attendance-approval--rejected';
  if (status === 'pending') return 'payroll-attendance-approval--pending';
  return 'payroll-attendance-approval--muted';
};

function AttendanceStatusChip({ row }) {
  const status = row.mark?.status;
  if (status) {
    const icon = STATUS_ICONS[status] || 'fa-circle';
    return (
      <span className={`payroll-attendance-chip ${statusChipClass(status)}`}>
        <i className={`fas ${icon}`} aria-hidden="true" />
        {statusCalendarLabel(status)}
      </span>
    );
  }
  if (row.dayType === 'holiday') {
    return (
      <span className="payroll-attendance-chip portal-attendance-chip--holiday">
        <i className="fas fa-star" aria-hidden="true" />
        {row.label || 'Holiday'}
      </span>
    );
  }
  return (
    <span className="payroll-attendance-chip payroll-attendance-chip--unmarked">
      <i className="fas fa-minus-circle" aria-hidden="true" />
      Not marked
    </span>
  );
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className={`payroll-attendance-summary__card payroll-attendance-summary__card--${tone}`}>
      <span className="payroll-attendance-summary__value">{value ?? 0}</span>
      <span className="payroll-attendance-summary__label">{label}</span>
    </div>
  );
}

const PayrollMonthAttendanceModal = ({ data, onClose, formatMonth }) => {
  if (!data) return null;

  const { run, attendance } = data;
  const monthly = attendance?.monthlyRequest;
  const teacherName = run?.teacher?.name || run?.teacherName || 'Teacher';
  const monthLabel = formatMonth ? formatMonth(run?.monthKey) : run?.monthKey || '';

  return (
    <div className="payroll-attendance-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="payroll-attendance-modal"
        role="dialog"
        aria-labelledby="payroll-attendance-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="payroll-attendance-modal__head">
          <div>
            <p className="payroll-attendance-modal__eyebrow">Payroll month attendance</p>
            <h3 id="payroll-attendance-modal-title">
              {teacherName}
              <span className="payroll-attendance-modal__month">{monthLabel}</span>
            </h3>
          </div>
          <button
            type="button"
            className="payroll-attendance-modal__dismiss"
            onClick={onClose}
            aria-label="Close attendance view"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </header>

        {monthly ? (
          <div className="payroll-attendance-summary">
            <SummaryCard label="Present" value={monthly.presentDays} tone="present" />
            <SummaryCard label="Absent" value={monthly.absentDays} tone="absent" />
            <SummaryCard label="Late" value={monthly.lateDays} tone="late" />
            <SummaryCard label="Leave" value={monthly.leaveDays} tone="leave" />
            <div className="payroll-attendance-summary__card payroll-attendance-summary__card--status">
              <span className="payroll-attendance-summary__value payroll-attendance-summary__value--text">
                {monthly.status || '—'}
              </span>
              <span className="payroll-attendance-summary__label">Monthly status</span>
            </div>
          </div>
        ) : (
          <p className="payroll-attendance-modal__hint">No monthly rollup on file for this month.</p>
        )}

        <div className="payroll-attendance-table-wrap">
          <table className="payroll-attendance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Status</th>
                <th>Admin approval</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(attendance?.dailyRows || []).map((row) => {
                const status = row.mark?.status;
                const rowTone = status || (row.dayType === 'holiday' ? 'holiday' : 'unmarked');
                return (
                  <tr key={row.date} className={`payroll-attendance-row payroll-attendance-row--${rowTone}`}>
                    <td className="payroll-attendance-date">
                      <strong>{formatDisplayDate(row.date)}</strong>
                      <small>{row.date}</small>
                    </td>
                    <td>{weekdayShort(row.date)}</td>
                    <td>
                      <AttendanceStatusChip row={row} />
                    </td>
                    <td>
                      {row.mark?.approvalStatus ? (
                        <span
                          className={`payroll-attendance-approval ${approvalChipClass(row.mark.approvalStatus)}`}
                        >
                          {row.mark.approvalStatus}
                        </span>
                      ) : (
                        <span className="payroll-attendance-approval payroll-attendance-approval--muted">—</span>
                      )}
                    </td>
                    <td className="payroll-attendance-notes">{row.mark?.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="payroll-attendance-modal__legend">
          {TEACHER_MY_STATUS_OPTIONS.map((opt) => (
            <span key={opt.value} className={`payroll-attendance-chip ${statusChipClass(opt.value)}`}>
              <i className={`fas ${STATUS_ICONS[opt.value] || 'fa-circle'}`} aria-hidden="true" />
              {opt.label}
            </span>
          ))}
        </div>

        <div className="payroll-attendance-modal__actions">
          <button type="button" className="payroll-attendance-modal__close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayrollMonthAttendanceModal;
