import React from 'react';
import AdminSearchBox from '../../shared/AdminSearchBox';
import LmsPanelLoading from './LmsPanelLoading';
import PayrollMissingBanner from './PayrollMissingBanner';
import {
  teacherInitials,
  formatPayrollMonth,
  payrollStatusLabel,
  payrollStatusKey,
  formatPaidDate,
} from './lmsHelpers';

const PAYROLL_STATUS_FILTERS = [
  { value: 'paid', label: 'Paid' },
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'stale', label: 'Out of Date' },
  { value: 'rejected', label: 'Rejected' },
];

const TeacherPayrollTab = ({
  panelId,
  payrollMissingAlerts,
  payrollStats,
  payrollListSearch,
  payrollFilter,
  setPayrollFilter,
  loadPayrollRuns,
  payrollLoading,
  payrollFilteredRuns,
  payrollRuns,
  payrollAttendanceBusy,
  payrollDeleteBusy,
  openPayrollAttendance,
  deletePayrollRun,
}) => (
  <section
    className="lms-panel lms-payroll-panel"
    role="tabpanel"
    id={panelId}
    aria-labelledby="lms-tab-teacher-payroll"
  >
    <header className="lms-payroll-hero">
      <div className="lms-payroll-hero__icon" aria-hidden="true">
        <i className="fas fa-money-check-alt" />
      </div>
      <div className="lms-payroll-hero__text">
        <h2>Teacher Payroll Records</h2>
        <p>
          Payroll is auto-generated when admin approves monthly attendance. The accountant reviews,
          edits if needed, and marks runs paid — completed payments appear here by default.
        </p>
      </div>
    </header>

    <PayrollMissingBanner alerts={payrollMissingAlerts} />

    <div className="lms-payroll-stat-row">
      <div className="lms-payroll-stat lms-payroll-stat--total">
        <span className="lms-payroll-stat__value">{payrollStats.total}</span>
        <span className="lms-payroll-stat__label">Total Runs</span>
      </div>
      <div className="lms-payroll-stat lms-payroll-stat--paid">
        <span className="lms-payroll-stat__value">{payrollStats.paid}</span>
        <span className="lms-payroll-stat__label">Paid</span>
      </div>
      <div className="lms-payroll-stat lms-payroll-stat--pending">
        <span className="lms-payroll-stat__value">{payrollStats.pending}</span>
        <span className="lms-payroll-stat__label">Pending Review</span>
      </div>
      <div className="lms-payroll-stat lms-payroll-stat--stale">
        <span className="lms-payroll-stat__value">{payrollStats.stale}</span>
        <span className="lms-payroll-stat__label">Out of Date</span>
      </div>
      <div className="lms-payroll-stat lms-payroll-stat--rejected">
        <span className="lms-payroll-stat__value">{payrollStats.rejected}</span>
        <span className="lms-payroll-stat__label">Rejected</span>
      </div>
    </div>

    <div className="controls-bar lms-payroll-toolbar">
      <AdminSearchBox
        placeholder="Search teacher, month, status…"
        value={payrollListSearch.searchTerm}
        onChange={(e) => payrollListSearch.setSearchTerm(e.target.value)}
        onEnter={() => payrollListSearch.flushSearch()}
      />
      <div className="filter-controls">
        <div className="lms-payroll-filters" role="tablist" aria-label="Payroll status">
          {PAYROLL_STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={payrollFilter === f.value}
              className={payrollFilter === f.value ? 'active' : ''}
              onClick={() => setPayrollFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="refresh-btn"
          onClick={loadPayrollRuns}
          title="Refresh"
          aria-label="Refresh"
        >
          <i className="fas fa-sync-alt" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div className="lms-payroll-section">
      <h3 className="lms-payroll-section__title">
        <i className="fas fa-file-invoice-dollar" aria-hidden="true" /> Payroll runs
      </h3>

      {payrollLoading ? (
        <LmsPanelLoading label="Loading payroll runs…" />
      ) : payrollFilteredRuns.length === 0 ? (
        <div className="lms-payroll-empty">
          <i className="fas fa-inbox" aria-hidden="true" />
          <p>
            {payrollRuns.length === 0
              ? 'No payroll runs yet. They appear after admin approves monthly attendance and the accountant processes them.'
              : payrollListSearch.debouncedSearch
                ? 'No payroll runs match your search.'
                : 'No payroll runs match this filter.'}
          </p>
        </div>
      ) : (
        <div className="lms-payroll-table-wrap">
          <table className="lms-payroll-list-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Month</th>
                <th>Profile Salary</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Deduction</th>
                <th>Final Salary</th>
                <th>Status</th>
                <th>Source</th>
                <th>Paid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payrollFilteredRuns.map((r) => {
                const statusKey = payrollStatusKey(r.status);
                const paidMeta = formatPaidDate(r.paidAt);
                const profileSalary =
                  r.profileSalary != null ? r.profileSalary : r.monthlySalary || 0;
                return (
                  <tr
                    key={r._id}
                    className={`lms-payroll-list-row lms-payroll-list-row--${statusKey}`}
                  >
                    <td>
                      <div className="lms-payroll-list-teacher">
                        <span className="lms-payroll-avatar" aria-hidden="true">
                          {teacherInitials(r.teacher?.name)}
                        </span>
                        <div>
                          <strong>{r.teacher?.name || r.teacherName || '—'}</strong>
                          {!r.teacher?.name && r.teacherName ? (
                            <small className="lms-payroll-removed-teacher">Teacher account removed</small>
                          ) : (
                            <small className="admin-email">{r.teacher?.email || ''}</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="lms-payroll-date-cell">
                      <strong>{formatPayrollMonth(r.monthKey)}</strong>
                      <span className="lms-payroll-day-name">{r.monthKey}</span>
                    </td>
                    <td>${Number(profileSalary).toFixed(2)}</td>
                    <td>{r.presentDays ?? 0}</td>
                    <td>{r.absentDays ?? 0}</td>
                    <td className="lms-payroll-deduction">
                      −${Number(r.deduction || 0).toFixed(2)}
                    </td>
                    <td>
                      <strong className="lms-payroll-final">
                        ${Number(r.finalSalary || 0).toFixed(2)}
                      </strong>
                    </td>
                    <td>
                      <span className={`lms-payroll-status-pill lms-payroll-status-pill--${statusKey}`}>
                        {payrollStatusLabel(r.status)}
                      </span>
                      {r.status === 'stale' && r.staleReason ? (
                        <span className="lms-payroll-stale-hint" title={r.staleReason}>
                          <i className="fas fa-info-circle" aria-hidden="true" />
                        </span>
                      ) : null}
                      {r.status === 'rejected' && r.accountantNotes ? (
                        <small className="lms-payroll-reject-note" title={r.accountantNotes}>
                          Accountant: {r.accountantNotes}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <div className="lms-payroll-source-flags">
                        {r.autoGenerated ? (
                          <span className="lms-payroll-source-pill">Auto-generated</span>
                        ) : (
                          <span className="lms-payroll-source-pill lms-payroll-source-pill--manual">
                            Manual
                          </span>
                        )}
                        {r.editedByAccountant ? (
                          <span className="lms-payroll-source-pill lms-payroll-source-pill--edited">
                            Edited
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="lms-payroll-date-cell">
                      {paidMeta ? (
                        <>
                          <strong>{paidMeta.display}</strong>
                          <span className="lms-payroll-day-name">{paidMeta.weekday}</span>
                          {r.paidBy?.name ? (
                            <span className="lms-payroll-paid-by">by {r.paidBy.name}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="lms-payroll-unpaid">—</span>
                      )}
                    </td>
                    <td>
                      <div className="lms-payroll-row-actions">
                        <button
                          type="button"
                          className="lms-payroll-attendance-btn"
                          disabled={payrollAttendanceBusy === r._id || payrollDeleteBusy === r._id}
                          onClick={() => openPayrollAttendance(r._id)}
                        >
                          Attendance
                        </button>
                        {r.status !== 'paid' ? (
                          <button
                            type="button"
                            className="lms-payroll-delete-btn"
                            disabled={payrollDeleteBusy === r._id}
                            onClick={() => deletePayrollRun(r)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </section>
);

export default TeacherPayrollTab;
