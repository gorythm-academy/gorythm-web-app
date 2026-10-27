import { PaymentsManagementModals } from './PaymentsManagementModals';
import { PaymentsManagementTable } from './PaymentsManagementTable';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { formatTotalsByCurrency } from '../../../utils/billingLabels';

export function PaymentsManagementView({ state }) {
  const {
    bankConfigOpen,
    bankForm,
    bankMessage,
    bankSaving,
    dateRange,
    dueDateDefault,
    dueDateMessage,
    dueDateSaving,
    exportPayments,
    fetchError,
    fetchPayments,
    filterStatus,
    handleDeleteSelectedPayments,
    handlePermanentDeleteSelected,
    handleRestoreSelected,
    listTab,
    onStatCardKeyDown,
    refreshing,
    saveBankDetails,
    saveDefaultDueDate,
    searchTerm,
    selectedPayments,
    setBankConfigOpen,
    setBankForm,
    setDateRange,
    setDueDateDefault,
    setFilterStatus,
    setListTab,
    setSearchTerm,
    setSelectedPayments,
    stats,
    trashBusy,
    trashCount,
  } = state;

  return (
    <div className="payments-management">
            {fetchError ? (
                <div className="admin-fetch-error" role="alert">{fetchError}</div>
            ) : null}
            {/* Header */}
            <div className="page-header">
                <div className="header-left">
                    <h1><i className="fas fa-credit-card"></i> Payment Management</h1>
                    <p>Monitor and manage all payment transactions</p>
                </div>
            </div>

            <div className="payments-list-tabs">
                <button
                    type="button"
                    className={`payments-list-tab ${listTab === 'active' ? 'active' : ''}`}
                    onClick={() => setListTab('active')}
                >
                    <i className="fas fa-list" /> {ACTIVE_RECORDS_LABEL}
                </button>
                <button
                    type="button"
                    className={`payments-list-tab payments-list-tab--trash ${listTab === 'trash' ? 'active' : ''}`}
                    onClick={() => setListTab('trash')}
                >
                    <i className="fas fa-archive" /> {QUARANTINE_LABEL}
                    {trashCount > 0 ? <span className="admin-list-tab-badge">{trashCount}</span> : null}
                </button>
            </div>

            {listTab === 'active' ? (
            <>
            <div className="payments-bank-config">
                <button
                    type="button"
                    className="payments-bank-config__toggle"
                    onClick={() => setBankConfigOpen((open) => !open)}
                    aria-expanded={bankConfigOpen}
                >
                    <span>
                        <i className="fas fa-university" /> Bank transfer details
                    </span>
                    <i className={`fas fa-chevron-${bankConfigOpen ? 'up' : 'down'}`} />
                </button>
                {bankConfigOpen ? (
                    <div className="payments-bank-config__body">
                        <p className="payments-bank-config__lead">
                            Shown to users on the course registration page when they choose bank transfer. Stripe
                            checkout uses your server <code>STRIPE_SECRET_KEY</code> (unchanged).
                        </p>
                        <div className="payments-bank-config__grid">
                            <div className="form-group">
                                <label>Account Holder Name</label>
                                <input
                                    type="text"
                                    value={bankForm.bankAccountName}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankAccountName: e.target.value }))}
                                    placeholder="Gorythm Academy"
                                />
                            </div>
                            <div className="form-group">
                                <label>Bank Name</label>
                                <input
                                    type="text"
                                    value={bankForm.bankName}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankName: e.target.value }))}
                                    placeholder="Bank Name"
                                />
                            </div>
                            <div className="form-group">
                                <label>Account Number</label>
                                <input
                                    type="text"
                                    value={bankForm.bankAccountNumber}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                                    placeholder="Account Number"
                                />
                            </div>
                            <div className="form-group">
                                <label>IBAN</label>
                                <input
                                    type="text"
                                    value={bankForm.bankIban}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankIban: e.target.value }))}
                                    placeholder="IBAN"
                                />
                            </div>
                            <div className="form-group">
                                <label>SWIFT / BIC</label>
                                <input
                                    type="text"
                                    value={bankForm.bankSwift}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankSwift: e.target.value }))}
                                    placeholder="SWIFT code"
                                />
                            </div>
                            <div className="form-group form-group-wide">
                                <label>Extra Note (Optional)</label>
                                <textarea
                                    rows={2}
                                    value={bankForm.bankExtraNote}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankExtraNote: e.target.value }))}
                                    placeholder="e.g. Include the payment reference in the transfer description."
                                />
                            </div>
                        </div>
                        <div className="payments-bank-config__actions">
                            {bankMessage ? <span className="payments-bank-config__msg">{bankMessage}</span> : null}
                            <button
                                type="button"
                                className="btn-primary btn-save"
                                onClick={saveBankDetails}
                                disabled={bankSaving}
                            >
                                <i className={`fas ${bankSaving ? 'fa-spinner fa-spin' : 'fa-save'}`} />{' '}
                                {bankSaving ? 'Saving…' : 'Save Bank Details'}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="payments-bank-config">
                <div className="payments-bank-config__body" style={{ display: 'block', padding: '1rem 1.25rem' }}>
                    <p className="payments-bank-config__lead">
                        Default fee due date for all courses. Student and parent Fees pages show this date. It is not
                        shown on the public website. Unpaid through this date; Overdue from the next day (Pakistan time).
                    </p>
                    <div className="payments-bank-config__grid">
                        <div className="form-group">
                            <label>Default Due Date</label>
                            <input
                                type="date"
                                value={dueDateDefault}
                                onChange={(e) => setDueDateDefault(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="payments-bank-config__actions">
                        {dueDateMessage ? <span className="payments-bank-config__msg">{dueDateMessage}</span> : null}
                        <button
                            type="button"
                            className="btn-primary btn-save"
                            onClick={saveDefaultDueDate}
                            disabled={dueDateSaving}
                        >
                            <i className={`fas ${dueDateSaving ? 'fa-spinner fa-spin' : 'fa-calendar-day'}`} />{' '}
                            {dueDateSaving ? 'Saving…' : 'Save Default Due Date'}
                        </button>
                    </div>
                </div>
            </div>
            </>
            ) : null}
            {listTab === 'active' ? (
            <div className="stats-grid">
                <div
                    className={`stat-card revenue ${filterStatus === 'paid' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('paid')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'paid')}
                    title="Show Paid Payments"
                >
                    <div className="stat-icon revenue">
                        <i className="fas fa-dollar-sign"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{formatTotalsByCurrency(stats.revenueByCurrency)}</h3>
                        <p>Total Revenue</p>
                    </div>
                </div>
                <div
                    className={`stat-card success ${filterStatus === 'paid' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('paid')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'paid')}
                    title="Show Paid Payments"
                >
                    <div className="stat-icon success">
                        <i className="fas fa-check-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.successfulPayments}</h3>
                        <p>Paid</p>
                    </div>
                </div>
                <div
                    className={`stat-card pending ${filterStatus === 'pending' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('pending')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'pending')}
                    title="Show Pending Payments"
                >
                    <div className="stat-icon pending">
                        <i className="fas fa-clock"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.pendingPayments}</h3>
                        <p>Pending</p>
                    </div>
                </div>
                <div
                    className={`stat-card failed ${filterStatus === 'failed' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('failed')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'failed')}
                    title="Show Failed Payments"
                >
                    <div className="stat-icon failed">
                        <i className="fas fa-times-circle"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.failedPayments}</h3>
                        <p>Failed</p>
                    </div>
                </div>
                <div
                    className={`stat-card refunded ${filterStatus === 'refunded' ? 'filter-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFilterStatus('refunded')}
                    onKeyDown={(e) => onStatCardKeyDown(e, 'refunded')}
                    title="Show Refunded Payments"
                >
                    <div className="stat-icon refunded">
                        <i className="fas fa-undo"></i>
                    </div>
                    <div className="stat-info">
                        <h3>{stats.refundedPayments}</h3>
                        <p>Refunded</p>
                    </div>
                </div>
            </div>
            ) : null}

            {/* Controls Bar */}
            <div className="controls-bar">
                <div className="search-box">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search by student, email, phone, course, or transaction ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="filter-controls">
                    <select 
                        className="status-filter"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">All Status</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="overdue">Overdue</option>
                        <option value="awaiting_review">Pending Verification</option>
                        <option value="paid">Paid</option>
                        <option value="refunded">Refunded</option>
                        <option value="cancelled">Declined</option>
                        <option value="failed">Failed</option>
                    </select>
                    
                    <select 
                        className="date-filter"
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                    >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                    </select>
                    
                    <button
                        className={`refresh-btn ${refreshing ? 'is-refreshing' : ''}`}
                        onClick={() => fetchPayments({ soft: true, withStats: true })}
                        disabled={refreshing}
                        type="button"
                        title="Refresh"
                        aria-label="Refresh"
                    >
                        <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`}></i>
                    </button>
                    <button type="button" className="btn-secondary download-btn" onClick={exportPayments}>
                        <i className="fas fa-file-export"></i> Download CSV
                    </button>
                </div>
            </div>

            {selectedPayments.length > 0 && (
                <div className="selection-action-bar">
                    <div className="selection-info">
                        <i className="fas fa-check-square"></i>
                        <span>{selectedPayments.length} payment{selectedPayments.length > 1 ? 's' : ''} selected</span>
                    </div>
                    <div className="selection-actions">
                        <button
                            type="button"
                            className="bulk-btn clear-btn"
                            onClick={() => setSelectedPayments([])}
                        >
                            <i className="fas fa-times"></i> Clear selection
                        </button>
                        {listTab === 'active' ? (
                            <button
                                type="button"
                                className="bulk-btn delete-btn"
                                onClick={handleDeleteSelectedPayments}
                            >
                                <i className="fas fa-archive"></i> Move to {QUARANTINE_LABEL}
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="bulk-btn restore-btn"
                                    onClick={handleRestoreSelected}
                                    disabled={trashBusy}
                                >
                                    <i className="fas fa-undo" /> Restore selected
                                </button>
                                <button
                                    type="button"
                                    className="bulk-btn delete-btn"
                                    onClick={handlePermanentDeleteSelected}
                                    disabled={trashBusy}
                                >
                                    <i className="fas fa-trash-alt" /> Delete Permanently
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            <PaymentsManagementTable state={state} />

            <PaymentsManagementModals state={state} />
        </div>
  );
}
