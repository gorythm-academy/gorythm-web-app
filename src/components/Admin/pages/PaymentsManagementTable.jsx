import { Link } from 'react-router-dom';
import { paymentRegistrationEmail } from '../../../utils/studentPortalEmail';
import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import {
    COLUMN_DEFS,
    idsForPaymentRow,
    paymentTableId,
    copyToClipboard,
    getStatusIcon,
    formatPaymentStatus,
    isPaymentPaid,
    methodBadgeClass,
    methodIconClass,
    canOpenStudentFromPayment,
} from './paymentsManagementShared';
import { formatMoney, formatTotalsByCurrency } from '../../../utils/billingLabels';

export function PaymentsManagementTable({ state }) {
  const {
    columnWidths,
    currentPage,
    handleDeclinePayment,
    handleDeletePayment,
    handleExtendDueDate,
    handleInvoiceButtonClick,
    handleMarkReceived,
    handlePermanentDelete,
    handleRefundPayment,
    handleRestorePayment,
    handleSendInvoiceEmail,
    handleSort,
    isTableDragging,
    lastFetchedAt,
    listTab,
    onTableDragScroll,
    paginatedPayments,
    payments,
    paymentsTableWidth,
    refreshing,
    resetColumnWidth,
    selectAllRef,
    selectedPayments,
    selectedVisibleCount,
    setPage,
    setProofModal,
    sortBy,
    sortOrder,
    startColumnResize,
    startTableDragScroll,
    stopTableDragScroll,
    tableContainerRef,
    toggleAllPayments,
    togglePaymentSelection,
    totalPages,
    totalPayments,
    trashBusy,
  } = state;

  return (
    <>
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
                                                    {line.courseName} · {formatMoney(line.amount, payment.currency || 'USD')}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </td>
                                <td>
                                    <span className="amount-badge">
                                        <strong>{formatMoney(payment.amount, payment.currency || 'USD')}</strong>
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
                                                {isPaymentPaid(payment.status) ? (
                                                    <button
                                                        className="action-btn receipt-btn"
                                                        type="button"
                                                        title={payment.receiptSentAt ? 'Resend invoice email' : 'Email invoice'}
                                                        onClick={() => handleSendInvoiceEmail(payment)}
                                                    >
                                                        <i className="fas fa-envelope"></i>{' '}
                                                        {payment.receiptSentAt ? 'Resend email' : 'Email invoice'}
                                                    </button>
                                                ) : null}
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
                                                            Mark Received
                                                        </button>
                                                        {payment.status !== 'awaiting_review' && payment.status !== 'processing' ? (
                                                            <button className="action-btn invoice-btn" type="button" onClick={() => handleExtendDueDate(payment)}>
                                                                Extend Due Date
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
                        {formatTotalsByCurrency(
                            payments
                                .filter((p) => isPaymentPaid(p.status))
                                .reduce((buckets, payment) => {
                                    const currency = String(payment.currency || 'USD').toUpperCase();
                                    const existing = buckets.find((row) => row.currency === currency);
                                    const amount = Number(payment.amount || 0);
                                    if (existing) existing.total += amount;
                                    else buckets.push({ currency, total: amount });
                                    return buckets;
                                }, [])
                        )}
                    </span>
                </div>
                <div className="summary-item">
                    <span className="summary-label">Last Updated</span>
                    <span className="summary-value">
                        {lastFetchedAt ? lastFetchedAt.toLocaleString() : '—'}
                    </span>
                </div>
            </div>
    </>
  );
}
