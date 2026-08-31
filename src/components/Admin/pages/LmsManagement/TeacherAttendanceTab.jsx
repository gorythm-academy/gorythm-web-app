import React from 'react';
import { statusCalendarLabel } from '../../../../constants/attendanceStatuses';
import { formatWeekdayName } from '../../../../utils/academyWeek';
import AdminSearchBox from '../../shared/AdminSearchBox';
import LmsPanelLoading from './LmsPanelLoading';
import PayrollMissingBanner from './PayrollMissingBanner';
import { formatMonthLabel, teacherInitials, statusMeta } from './lmsHelpers';

const TeacherAttendanceTab = ({
  panelId,
  payrollMissingAlerts,
  attendanceFeedback,
  pendingAttendanceSummary,
  pendingMonthlySummary,
  jumpToPendingAttendance,
  jumpToPendingMonthlyRollup,
  dailyApprovalStats,
  dailyMonth,
  setDailyMonth,
  dailyTeacherFilter,
  setDailyTeacherFilter,
  dailyTeachers,
  dailyStatusFilter,
  setDailyStatusFilter,
  refreshAttendanceTab,
  attendanceListSearch,
  attendanceLoading,
  filteredDailyDays,
  dailyDays,
  reviewDailyDay,
  showMonthlyRollup,
  setShowMonthlyRollup,
  setRollupDismissedMonth,
  monthlyApprovalStats,
  attendanceFilter,
  setAttendanceFilter,
  monthlyRollupNotice,
  monthlyRollupBlockAlerts,
  rollupLoading,
  requests,
  monthlyDrilldownBusy,
  openMonthlyDrilldown,
  reviewRequest,
  retryPayroll,
}) => (
  <section
    className="lms-panel lms-attendance-panel"
    role="tabpanel"
    id={panelId}
    aria-labelledby="lms-tab-teacher-attendance"
  >
    <header className="lms-attendance-hero">
      <div className="lms-attendance-hero__icon" aria-hidden="true">
        <i className="fas fa-user-check" />
      </div>
      <div className="lms-attendance-hero__text">
        <h2>Teacher Attendance Approval</h2>
        <p>
          Approve daily submissions during the month. Approve the monthly rollup only after the
          month ends — payroll is then auto-generated for the accountant. Sundays are auto-counted.
        </p>
      </div>
    </header>

    <PayrollMissingBanner alerts={payrollMissingAlerts} />

    {attendanceFeedback ? (
      <div className="lms-attendance-feedback" role="status">
        {attendanceFeedback}
      </div>
    ) : null}

    {pendingAttendanceSummary.length > 0 || pendingMonthlySummary.length > 0 ? (
      <div className="lms-attendance-pending-banner" role="region" aria-label="Pending attendance">
        <strong>
          <i className="fas fa-bell" aria-hidden="true" /> Pending approval — click to open
        </strong>
        <div className="lms-attendance-pending-banner__chips">
          {pendingAttendanceSummary.map((item) => (
            <button
              key={`daily-${item.monthKey}-${item.teacherId}`}
              type="button"
              className="lms-attendance-pending-chip"
              onClick={() => jumpToPendingAttendance(item)}
            >
              {formatMonthLabel(item.monthKey)} — {item.teacher?.name || 'Teacher'} ({item.pendingCount}{' '}
              daily)
            </button>
          ))}
          {pendingMonthlySummary.map((item) => (
            <button
              key={`monthly-${item.requestId || `${item.monthKey}-${item.teacherId}`}`}
              type="button"
              className="lms-attendance-pending-chip lms-attendance-pending-chip--monthly"
              onClick={() => jumpToPendingMonthlyRollup(item)}
            >
              {formatMonthLabel(item.monthKey)} — {item.teacher?.name || 'Teacher'} (monthly rollup)
            </button>
          ))}
        </div>
      </div>
    ) : null}

    <div className="lms-attendance-stat-row">
      <div className="lms-attendance-stat lms-attendance-stat--total">
        <span className="lms-attendance-stat__value">{dailyApprovalStats.total}</span>
        <span className="lms-attendance-stat__label">Submissions</span>
      </div>
      <div className="lms-attendance-stat lms-attendance-stat--pending">
        <span className="lms-attendance-stat__value">{dailyApprovalStats.pending}</span>
        <span className="lms-attendance-stat__label">Pending</span>
      </div>
      <div className="lms-attendance-stat lms-attendance-stat--approved">
        <span className="lms-attendance-stat__value">{dailyApprovalStats.approved}</span>
        <span className="lms-attendance-stat__label">Approved</span>
      </div>
      <div className="lms-attendance-stat lms-attendance-stat--rejected">
        <span className="lms-attendance-stat__value">{dailyApprovalStats.rejected}</span>
        <span className="lms-attendance-stat__label">Rejected</span>
      </div>
    </div>

    <div className="lms-attendance-toolbar">
      <div className="lms-attendance-toolbar__filters">
        <label className="lms-attendance-field">
          <span>
            <i className="fas fa-calendar-alt" aria-hidden="true" /> Month
          </span>
          <input
            type="month"
            value={dailyMonth}
            onChange={(e) => setDailyMonth(e.target.value)}
          />
        </label>
        <label className="lms-attendance-field">
          <span>
            <i className="fas fa-chalkboard-teacher" aria-hidden="true" /> Teacher
          </span>
          <select
            value={dailyTeacherFilter}
            onChange={(e) => setDailyTeacherFilter(e.target.value)}
          >
            <option value="">All teachers</option>
            {dailyTeachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
                {t.pendingCount > 0 ? ` (${t.pendingCount} pending)` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="lms-attendance-field">
          <span>
            <i className="fas fa-filter" aria-hidden="true" /> Approval status
          </span>
          <select
            value={dailyStatusFilter}
            onChange={(e) => setDailyStatusFilter(e.target.value)}
          >
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </label>
        {dailyTeachers.some((t) => t.pendingCount > 0) ? (
          <div className="lms-attendance-teacher-badges" aria-label="Teachers with pending submissions">
            {dailyTeachers
              .filter((t) => t.pendingCount > 0)
              .map((t) => (
                <button
                  key={t._id}
                  type="button"
                  className={`lms-attendance-teacher-chip ${
                    String(dailyTeacherFilter) === String(t._id) ? 'is-active' : ''
                  }`}
                  onClick={() =>
                    setDailyTeacherFilter(
                      String(dailyTeacherFilter) === String(t._id) ? '' : String(t._id)
                    )
                  }
                >
                  {t.name}
                  <span className="lms-attendance-teacher-chip__badge">{t.pendingCount}</span>
                </button>
              ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="lms-attendance-refresh-btn"
        onClick={refreshAttendanceTab}
        title="Refresh"
        aria-label="Refresh"
      >
        <i className="fas fa-sync-alt" aria-hidden="true" />
      </button>
    </div>

    <div className="lms-attendance-section">
      <h3 className="lms-attendance-section__title">
        <i className="fas fa-calendar-day" aria-hidden="true" /> Daily submissions
      </h3>
      <div className="controls-bar lms-attendance-section__search">
        <AdminSearchBox
          placeholder="Search teacher, date, status, notes…"
          value={attendanceListSearch.searchTerm}
          onChange={(e) => attendanceListSearch.setSearchTerm(e.target.value)}
          onEnter={() => attendanceListSearch.flushSearch()}
        />
      </div>

      {attendanceLoading ? (
        <LmsPanelLoading label="Loading daily submissions…" />
      ) : filteredDailyDays.length === 0 ? (
        <div className="lms-attendance-empty">
          <i className="fas fa-inbox" aria-hidden="true" />
          <p>
            {dailyDays.length === 0
              ? 'No daily attendance for this month and filter.'
              : 'No submissions match your search.'}
          </p>
        </div>
      ) : (
        <div className="lms-attendance-table-wrap">
          <table className="lms-attendance-list-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Teacher</th>
                <th>Status</th>
                <th>Notes</th>
                <th>Approval</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDailyDays.map((d) => {
                const meta = statusMeta(d.status);
                const approval = d.approvalStatus || 'pending';
                return (
                  <tr key={d._id} className={`lms-attendance-list-row lms-attendance-list-row--${approval}`}>
                    <td className="lms-attendance-date-cell">
                      <strong>{d.date}</strong>
                      <span className="lms-attendance-day-name">{formatWeekdayName(d.date)}</span>
                    </td>
                    <td>
                      <div className="lms-attendance-list-teacher">
                        <span className="lms-attendance-avatar" aria-hidden="true">
                          {teacherInitials(d.teacher?.name)}
                        </span>
                        <span>
                          <strong>{d.teacher?.name || '—'}</strong>
                          <small className="admin-email">{d.teacher?.email || ''}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className="lms-attendance-status-badge"
                        style={{ '--badge-color': meta.color }}
                      >
                        <i className={`fas ${meta.icon}`} aria-hidden="true" />
                        {statusCalendarLabel(d.status)}
                      </span>
                    </td>
                    <td className="lms-attendance-notes-cell">{d.notes || '—'}</td>
                    <td>
                      <span className={`lms-status-pill lms-status-pill--${approval}`}>
                        {approval}
                      </span>
                    </td>
                    <td className="lms-attendance-date-cell">
                      {d.submittedAt ? (
                        <>
                          <strong>
                            {new Date(d.submittedAt).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                            })}
                          </strong>
                          <span className="lms-attendance-day-name">
                            {new Date(d.submittedAt).toLocaleDateString(undefined, {
                              weekday: 'long',
                            })}
                          </span>
                          <span className="lms-attendance-time">
                            {new Date(d.submittedAt).toLocaleTimeString(undefined, {
                              timeStyle: 'short',
                            })}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="lms-attendance-list-actions">
                      <div className="lms-attendance-action-group">
                        {approval !== 'approved' ? (
                          <button
                            type="button"
                            className="lms-attendance-btn lms-attendance-btn--approve"
                            onClick={() => reviewDailyDay(d._id, 'approved')}
                          >
                            <i className="fas fa-check" aria-hidden="true" /> Approve
                          </button>
                        ) : null}
                        {approval !== 'rejected' ? (
                          <button
                            type="button"
                            className="lms-attendance-btn lms-attendance-btn--reject"
                            onClick={() => reviewDailyDay(d._id, 'rejected')}
                          >
                            <i className="fas fa-times" aria-hidden="true" /> Reject
                          </button>
                        ) : null}
                        {approval !== 'pending' ? (
                          <button
                            type="button"
                            className="lms-attendance-btn lms-attendance-btn--reopen"
                            onClick={() => reviewDailyDay(d._id, 'pending')}
                          >
                            Reopen
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

    <div className="lms-attendance-rollup">
      <button
        type="button"
        className={`lms-attendance-rollup-toggle ${showMonthlyRollup ? 'is-open' : ''}`}
        onClick={() => {
          setShowMonthlyRollup((open) => {
            const next = !open;
            if (!next) setRollupDismissedMonth(dailyMonth);
            return next;
          });
        }}
        aria-expanded={showMonthlyRollup}
      >
        <span>
          <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
          Monthly rollup (payroll) — {formatMonthLabel(dailyMonth)}
        </span>
        <span className="lms-attendance-rollup-toggle__meta">
          {monthlyApprovalStats.pending} pending for {formatMonthLabel(dailyMonth)}
          <i className={`fas fa-chevron-${showMonthlyRollup ? 'up' : 'down'}`} aria-hidden="true" />
        </span>
      </button>

      {showMonthlyRollup ? (
        <div className="lms-attendance-rollup-body">
          <div className="lms-attendance-toolbar lms-attendance-toolbar--compact">
            <label className="lms-attendance-field">
              <span>
                <i className="fas fa-filter" aria-hidden="true" /> Rollup status
              </span>
              <select
                value={attendanceFilter}
                onChange={(e) => setAttendanceFilter(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>

          {monthlyRollupNotice ? (
            <div className="lms-attendance-rollup-alert" role="status">
              {monthlyRollupNotice}
            </div>
          ) : null}

          {monthlyRollupBlockAlerts.length > 0 ? (
            <div className="lms-attendance-rollup-block-banner" role="alert">
              {monthlyRollupBlockAlerts.map((alert) => (
                <p key={alert.id}>
                  <strong>
                    {alert.teacherName} ({formatMonthLabel(alert.monthKey)}):
                  </strong>{' '}
                  {alert.reason}
                </p>
              ))}
            </div>
          ) : null}

          {rollupLoading ? (
            <LmsPanelLoading label="Loading monthly rollups…" />
          ) : requests.length === 0 ? (
            <div className="lms-attendance-empty lms-attendance-empty--compact">
              <p>No monthly rollups for {formatMonthLabel(dailyMonth)} with this filter.</p>
            </div>
          ) : (
            <div className="lms-attendance-table-wrap">
              <table className="lms-attendance-list-table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Month</th>
                    <th>Present</th>
                    <th>Late</th>
                    <th>Leave</th>
                    <th>Absent</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const monthStatus = r.status || 'pending';
                    return (
                      <tr
                        key={r._id}
                        className={`lms-attendance-list-row lms-attendance-list-row--${monthStatus}`}
                      >
                        <td>
                          <div className="lms-attendance-list-teacher">
                            <span className="lms-attendance-avatar" aria-hidden="true">
                              {teacherInitials(r.teacher?.name)}
                            </span>
                            <span>
                              <strong>{r.teacher?.name || '—'}</strong>
                              <small className="admin-email">{r.teacher?.email || ''}</small>
                            </span>
                          </div>
                        </td>
                        <td className="lms-attendance-date-cell">
                          <strong>{r.monthKey}</strong>
                          <span className="lms-attendance-day-name">
                            {formatMonthLabel(r.monthKey)}
                          </span>
                        </td>
                        <td>{r.presentDays ?? 0}</td>
                        <td>{r.lateDays ?? 0}</td>
                        <td>{r.leaveDays ?? 0}</td>
                        <td>{r.absentDays ?? 0}</td>
                        <td>
                          <span className={`lms-status-pill lms-status-pill--${monthStatus}`}>
                            {monthStatus}
                          </span>
                          {r.payrollMissingReason ? (
                            <small className="lms-attendance-payroll-miss">{r.payrollMissingReason}</small>
                          ) : null}
                        </td>
                        <td className="lms-attendance-list-actions">
                          <div className="lms-attendance-action-group">
                            <button
                              type="button"
                              className="lms-attendance-btn lms-attendance-btn--view"
                              disabled={monthlyDrilldownBusy === r._id}
                              onClick={() => openMonthlyDrilldown(r._id)}
                            >
                              <i className="fas fa-calendar-alt" aria-hidden="true" /> View days
                            </button>
                            {monthStatus !== 'approved' ? (
                              <button
                                type="button"
                                className="lms-attendance-btn lms-attendance-btn--approve"
                                disabled={!!r.approvalBlockReason}
                                title={r.approvalBlockReason || undefined}
                                onClick={() => reviewRequest(r._id, 'approved')}
                              >
                                <i className="fas fa-check-double" aria-hidden="true" /> Approve
                              </button>
                            ) : null}
                            {monthStatus !== 'rejected' ? (
                              <button
                                type="button"
                                className="lms-attendance-btn lms-attendance-btn--reject"
                                onClick={() => reviewRequest(r._id, 'rejected')}
                              >
                                <i className="fas fa-times" aria-hidden="true" /> Reject
                              </button>
                            ) : null}
                            {monthStatus !== 'pending' ? (
                              <button
                                type="button"
                                className="lms-attendance-btn lms-attendance-btn--reopen"
                                onClick={() => reviewRequest(r._id, 'pending')}
                              >
                                Reopen
                              </button>
                            ) : null}
                            {monthStatus === 'approved' && r.payrollMissingReason ? (
                              <button
                                type="button"
                                className="lms-attendance-btn lms-attendance-btn--retry"
                                onClick={() => retryPayroll(r._id)}
                              >
                                Retry payroll
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
      ) : null}
    </div>
  </section>
);

export default TeacherAttendanceTab;
