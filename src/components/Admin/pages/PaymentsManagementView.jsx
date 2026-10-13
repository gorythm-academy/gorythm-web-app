import { Link } from 'react-router-dom';
import { paymentRegistrationEmail } from '../../../utils/studentPortalEmail';
import { ProtectedFileFrame, ProtectedFileImage, ProtectedFileLink } from '../../../utils/fileUrl';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { COLUMN_DEFS, canOpenStudentFromPayment, copyToClipboard, formatPaymentStatus, getStatusIcon, idsForPaymentRow, isPaymentPaid, methodBadgeClass, methodIconClass, paymentTableId } from './paymentsManagementShared';

export function PaymentsManagementView({ state }) {
  const {
    bankConfigOpen,
    bankForm,
    bankMessage,
    bankSaving,
    columnWidths,
    currentPage,
    dateRange,
    declineModal,
    downloadCombinedFromPicker,
    downloadSeparateFromPicker,
    dueDateDefault,
    dueDateMessage,
    dueDateModal,
    receiveModal,
    setReceiveModal,
    submitReceive,
    dueDateSaving,
    exportPayments,
    fetchError,
    fetchPayments,
    filterStatus,
    handleDeclinePayment,
    handleDeletePayment,
    handleDeleteSelectedPayments,
    handleExtendDueDate,
    handleInvoiceButtonClick,
    handleMarkReceived,
    handlePermanentDelete,
    handlePermanentDeleteSelected,
    handleRefundPayment,
    handleRestorePayment,
    handleRestoreSelected,
    handleSort,
    invoicePicker,
    isTableDragging,
    lastFetchedAt,
    listTab,
    onStatCardKeyDown,
    onTableDragScroll,
    paginatedPayments,
    payments,
    paymentsTableWidth,
    proofModal,
    refreshing,
    resetColumnWidth,
    saveBankDetails,
    saveDefaultDueDate,
    searchTerm,
    selectAllRef,
    selectedPayments,
    selectedVisibleCount,
    setBankConfigOpen,
    setBankForm,
    setDateRange,
    setDeclineModal,
    setDueDateDefault,
    setDueDateModal,
    setFilterStatus,
    setInvoicePicker,
    setListTab,
    setPage,
    setProofModal,
    setSearchTerm,
    setSelectedPayments,
    sortBy,
    sortOrder,
    startColumnResize,
    startTableDragScroll,
    stats,
    stopTableDragScroll,
    submitDecline,
    submitDueDate,
    tableContainerRef,
    toggleAllPayments,
    togglePaymentSelection,
    totalPages,
    totalPayments,
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
                                <label>Account holder name</label>
                                <input
                                    type="text"
                                    value={bankForm.bankAccountName}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankAccountName: e.target.value }))}
                                    placeholder="Gorythm Academy"
                                />
                            </div>
                            <div className="form-group">
                                <label>Bank name</label>
                                <input
                                    type="text"
                                    value={bankForm.bankName}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankName: e.target.value }))}
                                    placeholder="Bank name"
                                />
                            </div>
                            <div className="form-group">
                                <label>Account number</label>
                                <input
                                    type="text"
                                    value={bankForm.bankAccountNumber}
                                    onChange={(e) => setBankForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
                                    placeholder="Account number"
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
                                <label>Extra note (optional)</label>
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
                                {bankSaving ? 'Saving…' : 'Save bank details'}
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
                            <label>Default due date</label>
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
                            {dueDateSaving ? 'Saving…' : 'Save default due date'}
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
                        <h3>${Number(stats.totalRevenue || 0).toFixed(2)}</h3>
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

            {/* Payments Table */}
            <div
                ref={tableContainerRef}
                className={`payments-table-container ${isTableDragging ? 'is-dragging' : ''}`}
                onMouseDown={startTableDragScroll}
                onMouseMove={onTableDragScroll}
                onMouseUp={stopTableDragScroll}
                onMouseLeave={stopTableDragScroll}
            >
                <table
                    className="payments-table"
                    style={{
                        width: paymentsTableWidth,
                        minWidth: paymentsTableWidth,
                        '--payments-txn-width': `${columnWidths[1]}px`,
                    }}
                >
                    <colgroup>
                        {COLUMN_DEFS.map((key, idx) => (
                            <col key={key} style={{ width: `${columnWidths[idx]}px` }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="checkbox-cell">
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={paginatedPayments.length > 0 && selectedVisibleCount === paginatedPayments.length}
                                    onChange={toggleAllPayments}
                                />
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 0)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(0); }} />
                            </th>
                            <th className="sortable transaction-id-head" onClick={() => handleSort('transactionId')}>
                                <span className="transaction-id-label">Transaction ID</span>
                                {sortBy === 'transactionId' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 1)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(1); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('student')}>
                                Student
                                {sortBy === 'student' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 2)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(2); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('course')}>
                                Course
                                {sortBy === 'course' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 3)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(3); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('amount')}>
                                Amount
                                {sortBy === 'amount' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 4)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(4); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('email')}>
                                Email
                                {sortBy === 'email' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 5)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(5); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('phone')}>
                                Phone
                                {sortBy === 'phone' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 6)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(6); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('status')}>
                                Status
                                {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 7)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(7); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('method')}>
                                Method
                                {sortBy === 'method' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 8)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(8); }} />
                            </th>
                            <th className="sortable" onClick={() => handleSort('date')}>
                                Date & Time
                                {sortBy === 'date' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 9)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(9); }} />
                            </th>
                            <th className="action-col">
                                Actions
                                <span className="col-resizer" onPointerDown={(e) => startColumnResize(e, 10)} onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetColumnWidth(10); }} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedPayments.map((payment) => {
                            const rowIds = idsForPaymentRow(payment);
                            const rowSelected = rowIds.every((id) => selectedPayments.includes(id));
                            return (
                            <tr key={payment._id} className={rowSelected ? 'selected' : ''}>
                                <td className="checkbox-cell">
                                    <input
                                        type="checkbox"
                                        checked={rowSelected}
                                        onChange={() => togglePaymentSelection(payment)}
                                    />
                                </td>
                                <td className="transaction-id-cell">
                                    <div
                                        className="transaction-id"
                                        title={paymentTableId(payment) ? `Full ID: ${paymentTableId(payment)}` : ''}
                                    >
                                        <i className="fas fa-receipt" aria-hidden />
                                        <code className="transaction-id-full" title={paymentTableId(payment)}>
                                            {paymentTableId(payment) || '—'}
                                        </code>
                                        {paymentTableId(payment) ? (
                                            <button
                                                type="button"
                                                className="copy-txn-btn"
                                                title="Copy full transaction ID"
                                                aria-label="Copy full transaction ID"
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(paymentTableId(payment));
                                                }}
                                            >
                                                <i className="fas fa-copy" aria-hidden />
                                            </button>
                                        ) : null}
                                    </div>
                                </td>
                                <td>
                                    <div className="student-info">
                                        <div className="student-avatar">
                                            {(payment.user?.name || payment.studentName || 'U').charAt(0)}
                                        </div>
                                        <div className="student-details">
                                            <strong>{payment.user?.name || payment.studentName || 'Unknown'}</strong>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className="course-info">
                                        <i className="fas fa-book"></i>
                                        {payment.course?.title || payment.courseName || 'Unknown Course'}
                                    </div>
                                    {Array.isArray(payment.lines) && payment.lines.length > 1 ? (
                                        <ul className="payment-line-list">
                                            {payment.lines.map((line, index) => (
                                                <li key={`${payment._id}-line-${index}`}>
                                                    {line.studentName ? `${line.studentName} · ` : ''}
                                                    {line.courseName} · ${Number(line.amount || 0).toFixed(2)}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </td>
                                <td>
                                    <span className="amount-badge">
                                        <strong>${Number(payment.amount || 0).toFixed(2)}</strong>
                                        <small>{payment.currency}</small>
                                    </span>
                                </td>
                                <td>
                                    <span className="admin-email">
                                        {paymentRegistrationEmail(payment) || 'No email'}
                                    </span>
                                </td>
                                <td className="phone-cell">{payment.phone || '—'}</td>
                                <td>
                                    <span className={`status-badge ${payment.displayStatus === 'paid' || payment.status === 'completed' ? 'paid' : (payment.displayStatus || payment.status)}`}>
                                        <i className={`fas fa-${getStatusIcon(payment.displayStatus || payment.status)}`}></i>
                                        {formatPaymentStatus(payment.status, payment.displayStatus)}
                                    </span>
                                    {payment.displayStatus === 'overdue' && (payment.overdueSince || payment.dueDate) ? (
                                        <div className="payment-failure-reason">
                                            Overdue since {new Date(payment.overdueSince || payment.dueDate).toLocaleDateString()}
                                        </div>
                                    ) : !isPaymentPaid(payment.status) && payment.dueDate ? (
                                        <div className="payment-failure-reason">
                                            Due {new Date(payment.dueDate).toLocaleDateString()}
                                        </div>
                                    ) : null}
                                    {payment.failureReason ? (
                                        <div className="payment-failure-reason" title={payment.failureReason}>
                                            {payment.failureReason}
                                        </div>
                                    ) : null}
                                </td>
                                <td>
                                    <span className={`method-badge ${methodBadgeClass(payment.paymentMethod)}`}>
                                        <i className={methodIconClass(payment.paymentMethod)}></i>
                                        {payment.paymentMethod}
                                    </span>
                                    {payment.cardLast4 ? (
                                        <div className="payment-failure-reason">
                                            {`${String(payment.cardBrand || 'Card').replace(/^./, (ch) => ch.toUpperCase())} •••• ${payment.cardLast4}`}
                                        </div>
                                    ) : null}
                                </td>
                                <td>
                                    {listTab === 'trash'
                                        ? payment.deletedAt
                                            ? new Date(payment.deletedAt).toLocaleString()
                                            : '—'
                                        : new Date(payment.createdAt).toLocaleString()}
                                </td>
                                <td className="action-col cell-actions">
                                    <div className="action-buttons">
                                        {listTab === 'active' ? (
                                            <>
                                                {payment.proofUrl ? (
                                                    <button
                                                        className="action-btn receipt-btn"
                                                        type="button"
                                                        title="View Payment Proof"
                                                        onClick={() => setProofModal(payment)}
                                                    >
                                                        <i className="fas fa-image"></i> Proof
                                                    </button>
                                                ) : null}
                                                {(payment.invoiceButtons || [{ key: payment._id, label: 'Invoice', payment }]).map((button) => (
                                                    <button
                                                        key={button.key}
                                                        className="action-btn invoice-btn"
                                                        type="button"
                                                        title="Download Invoice"
                                                        onClick={() => handleInvoiceButtonClick(button)}
                                                    >
                                                        <i className="fas fa-file-invoice"></i> Invoice
                                                    </button>
                                                ))}
                                                {canOpenStudentFromPayment(payment) ? (
                                                    <Link
                                                        className="action-btn students-btn"
                                                        title="Open in Students"
                                                        to={`/admin/students?email=${encodeURIComponent(paymentRegistrationEmail(payment) || '')}`}
                                                    >
                                                        <i className="fas fa-user-graduate"></i> Student
                                                    </Link>
                                                ) : null}
                                                {!isPaymentPaid(payment.status) && payment.status !== 'refunded' && payment.status !== 'cancelled' ? (
                                                    <>
                                                        <button className="action-btn students-btn" type="button" onClick={() => handleMarkReceived(payment)}>
                                                            Mark received
                                                        </button>
                                                        {payment.status !== 'awaiting_review' && payment.status !== 'processing' ? (
                                                            <button className="action-btn invoice-btn" type="button" onClick={() => handleExtendDueDate(payment)}>
                                                                Extend due date
                                                            </button>
                                                        ) : null}
                                                        <button className="action-btn delete-btn" type="button" onClick={() => handleDeclinePayment(payment)}>
                                                            Decline
                                                        </button>
                                                    </>
                                                ) : null}
                                                {isPaymentPaid(payment.status) ? (
                                                    <button className="action-btn restore-btn" type="button" onClick={() => handleRefundPayment(payment)}>
                                                        Refund
                                                    </button>
                                                ) : null}
                                                <button
                                                    className="action-btn delete-btn"
                                                    title={`Move to ${QUARANTINE_LABEL}`}
                                                    onClick={() => handleDeletePayment(payment)}
                                                >
                                                    <i className="fas fa-trash"></i> Delete
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    className="action-btn restore-btn"
                                                    title="Restore"
                                                    disabled={trashBusy}
                                                    onClick={() => handleRestorePayment(payment._id)}
                                                >
                                                    <i className="fas fa-undo"></i> Restore
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    title="Delete Permanently"
                                                    disabled={trashBusy}
                                                    onClick={() => handlePermanentDelete(payment._id)}
                                                >
                                                    <i className="fas fa-times-circle"></i> Delete forever
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            );
                        })}
                    </tbody>
                </table>

                {payments.length === 0 && (
                    <div className="no-results">
                        <i className="fas fa-credit-card"></i>
                        <h3>No Payments Found</h3>
                        <p>Try a different search term or filter</p>
                    </div>
                )}
            </div>

            {payments.length > 0 ? (
                <div className="payments-pagination">
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={currentPage <= 1 || refreshing}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                        <i className="fas fa-chevron-left" /> Prev
                    </button>
                    <span className="payments-pagination__info">
                        Page {currentPage} of {totalPages} | {totalPayments} matching payment
                        {totalPayments === 1 ? '' : 's'}
                    </span>
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={currentPage >= totalPages || refreshing}
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    >
                        Next <i className="fas fa-chevron-right" />
                    </button>
                </div>
            ) : null}

            {/* Summary Footer */}
            <div className="summary-footer">
                <div className="summary-item">
                    <span className="summary-label">Showing</span>
                    <span className="summary-value">{totalPayments} payment{totalPayments === 1 ? '' : 's'}</span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Filtered Revenue</span>
                    <span className="summary-value">
                        ${payments
                            .filter((p) => isPaymentPaid(p.status))
                            .reduce((sum, p) => sum + Number(p.amount || 0), 0)
                            .toFixed(2)}
                    </span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Last Updated</span>
                    <span className="summary-value">
                        {lastFetchedAt ? lastFetchedAt.toLocaleString() : '—'}
                    </span>
                </div>
            </div>

            {invoicePicker ? (
                <div className="payment-invoice-picker" role="dialog" aria-modal="true" aria-labelledby="payment-invoice-picker-title">
                    <div
                        className="payment-invoice-picker__backdrop"
                        onClick={() => setInvoicePicker(null)}
                    />
                    <div className="payment-invoice-picker__panel">
                        <header className="payment-invoice-picker__head">
                            <h3 id="payment-invoice-picker-title">Download Invoice</h3>
                            <button
                                type="button"
                                className="payment-invoice-picker__close"
                                onClick={() => setInvoicePicker(null)}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </header>
                        <div className="payment-invoice-picker__body">
                            <p>
                                This row includes more than one course. Download one combined invoice, or a separate invoice for each course.
                            </p>
                            <div className="payment-invoice-picker__actions">
                                <button
                                    type="button"
                                    className="payment-invoice-picker__btn"
                                    onClick={downloadCombinedFromPicker}
                                >
                                    Combined invoice
                                </button>
                                <button
                                    type="button"
                                    className="payment-invoice-picker__btn"
                                    onClick={downloadSeparateFromPicker}
                                >
                                    Separate invoices
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {dueDateModal ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div
                        className="payment-receipt-modal__backdrop"
                        onClick={() => !dueDateModal.saving && setDueDateModal(null)}
                    />
                    <div className="payment-receipt-modal__panel payment-due-modal">
                        <div className="payment-receipt-modal__head">
                            <h3>Extend due date</h3>
                            <button
                                type="button"
                                className="payment-receipt-modal__close"
                                onClick={() => !dueDateModal.saving && setDueDateModal(null)}
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            Choose a later due date for {dueDateModal.label}. Unpaid stays Unpaid through this date.
                            Overdue starts the next day. To set the first due date, open Students → the student →
                            Edit course → Fee due date.
                        </p>
                        <label className="payment-due-modal__field">
                            Due date
                            <input
                                type="date"
                                value={dueDateModal.date || ''}
                                onChange={(e) => setDueDateModal((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                                disabled={dueDateModal.saving}
                            />
                        </label>
                        <div className="payment-due-modal__actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={dueDateModal.saving}
                                onClick={() => setDueDateModal(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary btn-add"
                                disabled={dueDateModal.saving || !dueDateModal.date}
                                onClick={submitDueDate}
                            >
                                {dueDateModal.saving ? 'Saving…' : 'Save due date'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {receiveModal ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div
                        className="payment-receipt-modal__backdrop"
                        onClick={() => !receiveModal.saving && setReceiveModal(null)}
                    />
                    <div className="payment-receipt-modal__panel payment-due-modal">
                        <div className="payment-receipt-modal__head">
                            <h3>Mark as received</h3>
                            <button
                                type="button"
                                className="payment-receipt-modal__close"
                                aria-label="Close"
                                onClick={() => !receiveModal.saving && setReceiveModal(null)}
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            This marks {receiveModal.label} paid and enrolls the student(s). Use this for bank or cash payments.
                        </p>
                        {receiveModal.partialAllowed ? (
                            <label className="payment-due-modal__field">
                                Amount received (bill is ${receiveModal.billed.toFixed(2)})
                                <input
                                    type="number"
                                    min="0.01"
                                    max={receiveModal.billed}
                                    step="0.01"
                                    inputMode="decimal"
                                    value={receiveModal.amount}
                                    onChange={(e) => setReceiveModal((prev) => (prev ? { ...prev, amount: e.target.value } : prev))}
                                    disabled={receiveModal.saving}
                                />
                                <small>
                                    If less than the bill was received, the amount is kept as part payment. The month
                                    counts as paid once the balance is received too.
                                </small>
                            </label>
                        ) : null}
                        <div className="payment-due-modal__actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={receiveModal.saving}
                                onClick={() => setReceiveModal(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary btn-add"
                                disabled={receiveModal.saving || (receiveModal.partialAllowed && !(Number(receiveModal.amount) > 0))}
                                onClick={submitReceive}
                            >
                                {receiveModal.saving ? 'Saving…' : 'Mark received'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {declineModal ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div
                        className="payment-receipt-modal__backdrop"
                        onClick={() => !declineModal.saving && setDeclineModal(null)}
                    />
                    <div className="payment-receipt-modal__panel payment-due-modal">
                        <div className="payment-receipt-modal__head">
                            <h3>Decline this unpaid bill?</h3>
                            <button
                                type="button"
                                className="payment-receipt-modal__close"
                                onClick={() => !declineModal.saving && setDeclineModal(null)}
                            >
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            Paid payments cannot be declined. Use refund for paid charges. A note here is shown on the student and parent Fees pages.
                        </p>
                        <label className="payment-due-modal__field">
                            Note for student / parent
                            <textarea
                                rows={4}
                                maxLength={500}
                                value={declineModal.note || ''}
                                onChange={(e) => setDeclineModal((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                                disabled={declineModal.saving}
                                placeholder="Why this bill is declined"
                            />
                        </label>
                        <div className="payment-due-modal__actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={declineModal.saving}
                                onClick={() => setDeclineModal(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn-primary btn-add"
                                disabled={declineModal.saving}
                                onClick={submitDecline}
                            >
                                {declineModal.saving ? 'Declining…' : 'Decline'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {proofModal?.proofUrl ? (
                <div className="payment-receipt-modal" role="dialog" aria-modal="true">
                    <div className="payment-receipt-modal__backdrop" onClick={() => setProofModal(null)} />
                    <div className="payment-receipt-modal__panel">
                        <div className="payment-receipt-modal__head">
                            <h3>Payment Proof</h3>
                            <button type="button" className="payment-receipt-modal__close" onClick={() => setProofModal(null)}>
                                <i className="fas fa-times" />
                            </button>
                        </div>
                        <p>
                            {proofModal.studentName || proofModal.user?.name || 'Student'} —{' '}
                            {proofModal.course?.title || proofModal.courseName || 'Course'}
                        </p>
                        {String(proofModal.proofUrl).toLowerCase().endsWith('.pdf') ? (
                            <ProtectedFileFrame
                                path={proofModal.proofUrl}
                                title="Payment Proof PDF"
                                className="payment-receipt-modal__image"
                            />
                        ) : (
                            <ProtectedFileImage
                                path={proofModal.proofUrl}
                                alt="Payment proof"
                                className="payment-receipt-modal__image"
                            />
                        )}
                        <ProtectedFileLink
                            path={proofModal.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="payment-receipt-modal__pdf-link"
                        >
                            <i className="fas fa-download" /> Download Proof
                        </ProtectedFileLink>
                    </div>
                </div>
            ) : null}
        </div>
  );
}
