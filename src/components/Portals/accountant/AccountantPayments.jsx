import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { portalGet, portalPatch, portalDelete } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import { paymentRegistrationEmail, displayPortalEmail } from '../../../utils/studentPortalEmail';
import {
  ACCOUNTANT_PAYMENTS_UPDATED_EVENT,
  countPendingBankReviews,
} from '../../../hooks/useAccountantPortalBadges';
import './AccountantPayments.scss';

const isPaymentPaid = (status) => status === 'paid' || status === 'completed';

const formatStatus = (status) => {
  if (status === 'completed') return 'paid';
  if (status === 'awaiting_review') return 'awaiting review';
  return status || '—';
};

const canReviewBankPayment = (p) =>
  p?.status === 'awaiting_review' && p?.paymentMethod === 'bank' && Boolean(p?.proofUrl);

const hasBankScreenshot = (p) => p?.paymentMethod === 'bank' && Boolean(p?.proofUrl);

const isPdfProof = (proofUrl) => String(proofUrl || '').toLowerCase().endsWith('.pdf');

function PortalActionModal({ open, title, message, type = 'info', confirmLabel, cancelLabel, onConfirm, onCancel, loading }) {
  if (!open) return null;
  const icon =
    type === 'error'
      ? 'fa-circle-exclamation'
      : type === 'success'
        ? 'fa-circle-check'
        : type === 'warning'
          ? 'fa-triangle-exclamation'
          : 'fa-circle-question';
  const confirmBtnClass =
    type === 'error' || type === 'warning' ? 'danger' : 'primary';

  return (
    <div className="accountant-dialog" role="dialog" aria-modal="true">
      <div className="accountant-dialog__backdrop" onClick={loading ? undefined : onCancel} />
      <div className={`accountant-dialog__panel accountant-dialog__panel--${type}`}>
        <div className={`accountant-dialog__icon accountant-dialog__icon--${type}`}>
          <i className={`fas ${icon}`} aria-hidden />
        </div>
        <h3>{title}</h3>
        {message ? <p>{message}</p> : null}
        <div className="accountant-dialog__actions">
          {cancelLabel ? (
            <button type="button" className="accountant-dialog__btn accountant-dialog__btn--ghost" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </button>
          ) : null}
          {confirmLabel ? (
            <button
              type="button"
              className={`accountant-dialog__btn accountant-dialog__btn--${confirmBtnClass}`}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? <i className="fas fa-spinner fa-spin" /> : null} {confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const AccountantPayments = () => {
  const [activePayments, setActivePayments] = useState(null);
  const [trashedPayments, setTrashedPayments] = useState([]);
  const [trashCount, setTrashCount] = useState(0);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [tableExpanded, setTableExpanded] = useState(true);
  const [receiptModal, setReceiptModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [trashModal, setTrashModal] = useState(null);
  const [restoreModal, setRestoreModal] = useState(null);
  const [permanentDeleteModal, setPermanentDeleteModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [toast, setToast] = useState(null);
  const [dialogNotice, setDialogNotice] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkModal, setBulkModal] = useState(null);
  const selectAllRef = useRef(null);

  const notifyPaymentsUpdated = useCallback(() => {
    window.dispatchEvent(new CustomEvent(ACCOUNTANT_PAYMENTS_UPDATED_EVENT));
  }, []);

  const loadPayments = useCallback(async () => {
    setError('');
    try {
      const activeRes = await portalGet('/accountant/payments');
      if (!activeRes.success) {
        setError(activeRes.error || 'Failed');
        return;
      }
      setActivePayments(activeRes.payments || []);
      if (typeof activeRes.trashCount === 'number') setTrashCount(activeRes.trashCount);
      notifyPaymentsUpdated();

      if (filter === 'trash') {
        const trashRes = await portalGet('/accountant/payments?trash=1');
        if (trashRes.success) {
          setTrashedPayments(trashRes.payments || []);
          if (typeof trashRes.trashCount === 'number') setTrashCount(trashRes.trashCount);
        } else {
          setError(trashRes.error || 'Failed to load trashed payments');
        }
      } else {
        setTrashedPayments([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [filter, notifyPaymentsUpdated]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    setSelectedIds([]);
  }, [filter]);

  const payments = filter === 'trash' ? trashedPayments : activePayments;

  const bankScreenshotPayments = useMemo(
    () => (activePayments || []).filter(hasBankScreenshot),
    [activePayments]
  );

  const filtered = useMemo(() => {
    if (!payments) return [];
    if (filter === 'trash') return payments;
    if (filter === 'bank-ss') return bankScreenshotPayments;
    if (filter === 'all') return payments;
    if (filter === 'final') {
      return payments.filter(
        (p) => isPaymentPaid(p.status) || p.status === 'refunded' || p.status === 'rejected'
      );
    }
    if (filter === 'review') {
      return payments.filter(canReviewBankPayment);
    }
    return payments;
  }, [payments, filter, bankScreenshotPayments]);

  const paymentId = (row) => String(row._id);

  const selectedVisibleCount = useMemo(
    () => filtered.filter((row) => selectedIds.includes(paymentId(row))).length,
    [filtered, selectedIds]
  );

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      filtered.length > 0 && selectedVisibleCount > 0 && selectedVisibleCount < filtered.length;
  }, [filtered.length, selectedVisibleCount]);

  const toggleRowSelection = (row) => {
    const id = paymentId(row);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleAllVisible = () => {
    const visibleIds = filtered.map(paymentId);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  };

  const handleBulkTrash = async () => {
    if (!bulkModal?.ids?.length || bulkModal.type !== 'trash') return;
    setActionLoading('bulk');
    const ids = [...bulkModal.ids];
    let moved = 0;
    try {
      await Promise.all(
        ids.map(async (id) => {
          const res = await portalDelete(`/accountant/payments/${id}`);
          if (res.success) moved += 1;
        })
      );
      setBulkModal(null);
      setSelectedIds([]);
      setToast({
        type: 'success',
        title: moved === ids.length ? 'Moved to trash' : 'Partially moved',
        message:
          moved === ids.length
            ? `${moved} payment record${moved === 1 ? '' : 's'} moved to trash.`
            : `${moved} of ${ids.length} record(s) moved to trash.`,
      });
      loadPayments();
    } catch (err) {
      setBulkModal(null);
      setDialogNotice({
        type: 'error',
        title: 'Bulk trash failed',
        message: err.message || 'Could not move selected payments.',
      });
    } finally {
      setActionLoading('');
    }
  };

  const handleBulkRestore = async () => {
    if (!bulkModal?.ids?.length || bulkModal.type !== 'restore') return;
    setActionLoading('bulk');
    const ids = [...bulkModal.ids];
    let restored = 0;
    try {
      await Promise.all(
        ids.map(async (id) => {
          const res = await portalPatch(`/accountant/payments/${id}/restore`, {});
          if (res.success) restored += 1;
        })
      );
      setBulkModal(null);
      setSelectedIds([]);
      setToast({
        type: 'success',
        title: restored === ids.length ? 'Payments restored' : 'Partially restored',
        message:
          restored === ids.length
            ? `${restored} payment record${restored === 1 ? '' : 's'} restored.`
            : `${restored} of ${ids.length} record(s) restored.`,
      });
      loadPayments();
    } catch (err) {
      setBulkModal(null);
      setDialogNotice({
        type: 'error',
        title: 'Bulk restore failed',
        message: err.message || 'Could not restore selected payments.',
      });
    } finally {
      setActionLoading('');
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (!bulkModal?.ids?.length || bulkModal.type !== 'permanent') return;
    setActionLoading('bulk');
    const ids = [...bulkModal.ids];
    try {
      const results = await Promise.allSettled(
        ids.map((id) => portalDelete(`/accountant/payments/${id}/permanent`))
      );
      const deleted = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - deleted;
      const firstError =
        results.find((r) => r.status === 'rejected')?.reason?.message || null;

      setBulkModal(null);
      setSelectedIds([]);
      await loadPayments();

      if (failed === 0) {
        setToast({
          type: 'success',
          title: 'Deleted permanently',
          message: `${deleted} payment record${deleted === 1 ? '' : 's'} permanently deleted.`,
        });
      } else if (deleted > 0) {
        setDialogNotice({
          type: 'warning',
          title: 'Partially deleted',
          message: `${deleted} of ${ids.length} record(s) deleted.${firstError ? ` ${firstError}` : ''}`,
        });
      } else {
        setDialogNotice({
          type: 'error',
          title: 'Delete failed',
          message: firstError || 'Could not delete selected payments.',
        });
      }
    } catch (err) {
      setBulkModal(null);
      setDialogNotice({
        type: 'error',
        title: 'Delete failed',
        message: err.message || 'Could not delete selected payments.',
      });
    } finally {
      setActionLoading('');
    }
  };

  const handleApprove = async () => {
    if (!approveModal?._id) return;
    setActionLoading(approveModal._id);
    try {
      const approvedRow = approveModal;
      const res = await portalPatch(`/accountant/payments/${approvedRow._id}/approve`, {});
      if (!res.success) throw new Error(res.error || 'Approve failed');
      setApproveModal(null);
      setFilter('bank-ss');
      setToast({
        type: 'success',
        title: 'Payment approved',
        message: 'Student record created. The screenshot stays in Bank screenshots for your records.',
      });
      loadPayments();
    } catch (err) {
      setApproveModal(null);
      setDialogNotice({
        type: 'error',
        title: 'Approve failed',
        message: err.message || 'Could not approve this payment.',
      });
    } finally {
      setActionLoading('');
    }
  };

  const handleReject = async () => {
    if (!rejectModal?._id) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError('Please enter a rejection reason.');
      return;
    }
    setRejectError('');
    setActionLoading(rejectModal._id);
    try {
      const rejectedRow = rejectModal;
      const res = await portalPatch(`/accountant/payments/${rejectedRow._id}/reject`, { reason });
      if (!res.success) throw new Error(res.error || 'Reject failed');
      setRejectModal(null);
      setRejectReason('');
      setFilter('bank-ss');
      setToast({
        type: 'success',
        title: 'Payment rejected',
        message: 'Screenshot kept in Bank screenshots. Payer can submit a new transfer.',
      });
      loadPayments();
    } catch (err) {
      setRejectModal(null);
      setRejectReason('');
      setDialogNotice({
        type: 'error',
        title: 'Reject failed',
        message: err.message || 'Could not reject this payment.',
      });
    } finally {
      setActionLoading('');
    }
  };

  const handleMoveToTrash = async () => {
    if (!trashModal?._id) return;
    setActionLoading(trashModal._id);
    try {
      const res = await portalDelete(`/accountant/payments/${trashModal._id}`);
      if (!res.success) throw new Error(res.error || 'Failed to move to trash');
      setTrashModal(null);
      setToast({
        type: 'success',
        title: 'Moved to trash',
        message: 'You can restore or delete it permanently from the Trash tab.',
      });
      loadPayments();
    } catch (err) {
      setTrashModal(null);
      setDialogNotice({
        type: 'error',
        title: 'Could not move to trash',
        message: err.message || 'Please try again.',
      });
    } finally {
      setActionLoading('');
    }
  };

  const handleRestore = async () => {
    if (!restoreModal?._id) return;
    setActionLoading(restoreModal._id);
    try {
      const res = await portalPatch(`/accountant/payments/${restoreModal._id}/restore`, {});
      if (!res.success) throw new Error(res.error || 'Restore failed');
      setRestoreModal(null);
      setToast({
        type: 'success',
        title: 'Payment restored',
        message: 'The record is back in your active payment lists.',
      });
      loadPayments();
    } catch (err) {
      setRestoreModal(null);
      setDialogNotice({
        type: 'error',
        title: 'Restore failed',
        message: err.message || 'Could not restore this payment.',
      });
    } finally {
      setActionLoading('');
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteModal?._id) return;
    setActionLoading(permanentDeleteModal._id);
    try {
      const res = await portalDelete(`/accountant/payments/${permanentDeleteModal._id}/permanent`);
      if (!res.success) throw new Error(res.error || 'Delete failed');
      setPermanentDeleteModal(null);
      setToast({
        type: 'success',
        title: 'Deleted permanently',
        message: 'This payment record has been removed.',
      });
      loadPayments();
    } catch (err) {
      setPermanentDeleteModal(null);
      setDialogNotice({
        type: 'error',
        title: 'Delete failed',
        message: err.message || 'Could not delete this payment.',
      });
    } finally {
      setActionLoading('');
    }
  };

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (activePayments === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  const awaitingCount = countPendingBankReviews(activePayments);
  const bankSsCount = bankScreenshotPayments.length;
  const showRowNumbers = filter === 'review' || filter === 'bank-ss';
  const isTrashView = filter === 'trash';

  const selectFilter = (id) => {
    setFilter(id);
    if (id === 'trash') setTableExpanded(true);
  };

  const openTrash = () => selectFilter('trash');

  const filterLabels = {
    'bank-ss': 'Bank screenshots',
    review: 'Review',
    all: 'All payments',
    final: 'Final',
    trash: 'Trash',
  };

  return (
    <div className="portal-page accountant-payments-page">
      <PortalPageHeader title="Student payments" subtitle="Review bank transfers and confirm payments" />

      {toast ? (
        <div className={`accountant-toast accountant-toast--${toast.type}`} role="status">
          <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`} />
          <div>
            <strong>{toast.title}</strong>
            <span>{toast.message}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            <i className="fas fa-times" />
          </button>
        </div>
      ) : null}

      <div className="portal-hero portal-hero--accountant">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-credit-card" />
        </div>
        <div>
          <h2>Payment review</h2>
          <p>
            Bank screenshots keeps every bank transfer proof on file. Use Review to approve or reject new submissions.
          </p>
        </div>
      </div>

      <div className="accountant-payments-toolbar">
        <div className="accountant-payments-filters">
          {[
            {
              id: 'bank-ss',
              label: bankSsCount > 0 ? `Bank screenshots (${bankSsCount})` : 'Bank screenshots',
            },
            { id: 'review', label: awaitingCount > 0 ? `Review (${awaitingCount})` : 'Review' },
            { id: 'all', label: 'All payments' },
            { id: 'final', label: 'Final (paid, rejected & refunded)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`accountant-payments-filter ${filter === tab.id ? 'is-active' : ''}`}
              onClick={() => selectFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`accountant-payments-trash-entry ${isTrashView ? 'is-active' : ''}`}
          onClick={openTrash}
          title="View trashed payments — restore or delete permanently"
        >
          <i className="fas fa-trash-alt" aria-hidden />
          <span>Trash</span>
          {trashCount > 0 ? (
            <span className="accountant-payments-trash-entry__count">{trashCount}</span>
          ) : null}
        </button>
      </div>

      {!isTrashView ? (
        <p className="accountant-payments-hint">
          <i className="fas fa-info-circle" aria-hidden />
          Use row checkboxes to select multiple payments. <strong>Trash</strong> hides records; open{' '}
          <button type="button" className="accountant-payments-hint__link" onClick={openTrash}>
            Trash
          </button>{' '}
          to restore or permanently delete them.
        </p>
      ) : (
        <p className="accountant-payments-hint accountant-payments-hint--trash">
          <i className="fas fa-trash-alt" aria-hidden />
          Trashed records stay in the database but are hidden from active lists. Select rows with checkboxes, then use{' '}
          <strong>Restore</strong> or <strong>Delete permanently</strong> to bring them back or remove them from the database.
        </p>
      )}

      {selectedIds.length > 0 ? (
        <div className="accountant-payments-selection-bar">
          <div className="accountant-payments-selection-bar__info">
            <i className="fas fa-check-square" aria-hidden />
            <span>
              {selectedIds.length} record{selectedIds.length === 1 ? '' : 's'} selected
            </span>
          </div>
          <div className="accountant-payments-selection-bar__actions">
            <button
              type="button"
              className="accountant-payments-bulk-btn accountant-payments-bulk-btn--clear"
              onClick={() => setSelectedIds([])}
            >
              <i className="fas fa-times" /> Clear
            </button>
            {isTrashView ? (
              <>
                <button
                  type="button"
                  className="accountant-payments-bulk-btn accountant-payments-bulk-btn--restore"
                  disabled={!!actionLoading}
                  onClick={() => setBulkModal({ type: 'restore', ids: [...selectedIds] })}
                >
                  <i className="fas fa-undo" /> Restore selected
                </button>
                <button
                  type="button"
                  className="accountant-payments-bulk-btn accountant-payments-bulk-btn--delete"
                  disabled={!!actionLoading}
                  onClick={() => setBulkModal({ type: 'permanent', ids: [...selectedIds] })}
                >
                  <i className="fas fa-trash-alt" /> Delete permanently
                </button>
              </>
            ) : (
              <button
                type="button"
                className="accountant-payments-bulk-btn accountant-payments-bulk-btn--trash"
                disabled={!!actionLoading}
                onClick={() => setBulkModal({ type: 'trash', ids: [...selectedIds] })}
              >
                <i className="fas fa-trash" /> Move to trash
              </button>
            )}
          </div>
        </div>
      ) : null}

      <section className={`portal-panel accountant-payments-panel ${tableExpanded ? 'is-expanded' : 'is-collapsed'} ${isTrashView ? 'is-trash-view' : ''}`}>
        <div className="accountant-payments-panel__toggle-row">
          <button
            type="button"
            className="accountant-payments-panel__toggle"
            onClick={() => setTableExpanded((v) => !v)}
            aria-expanded={tableExpanded}
            aria-controls="accountant-payments-table-body"
          >
            <div className="accountant-payments-panel__toggle-main">
              <span className="accountant-payments-panel__icon" aria-hidden>
                <i className="fas fa-table" />
              </span>
              <div className="accountant-payments-panel__titles">
                <h2>Payments table</h2>
                <p>
                  {filterLabels[filter] || 'Payments'} · {filtered.length} record{filtered.length === 1 ? '' : 's'}
                  {!tableExpanded ? ' · click to expand' : ''}
                </p>
              </div>
            </div>
            <span className="accountant-payments-panel__chevron" aria-hidden>
              <i className={`fas fa-chevron-${tableExpanded ? 'up' : 'down'}`} />
            </span>
          </button>
          {!isTrashView && trashCount > 0 ? (
            <button
              type="button"
              className="accountant-payments-panel__trash-shortcut"
              onClick={openTrash}
            >
              <i className="fas fa-trash-alt" aria-hidden />
              Trash ({trashCount})
            </button>
          ) : null}
        </div>

        {tableExpanded ? (
          <div className="portal-panel__body" id="accountant-payments-table-body">
            {filtered.length === 0 ? (
              <p className="accountant-payments-empty">
                {isTrashView ? 'Trash is empty.' : 'No payments in this filter.'}
              </p>
            ) : (
              <div className="portal-data-table-wrap accountant-payments-table-wrap">
                <table className="portal-data-table portal-data-table--orange accountant-payments-table">
                  <thead>
                    <tr>
                      <th className="accountant-payments-checkbox-cell">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          aria-label="Select all visible payments"
                          checked={filtered.length > 0 && selectedVisibleCount === filtered.length}
                          onChange={toggleAllVisible}
                        />
                      </th>
                      {showRowNumbers ? <th className="accountant-payments-num">#</th> : null}
                      <th>Screenshot</th>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Method</th>
                      <th>Date</th>
                      {isTrashView ? <th>Trashed</th> : null}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, index) => (
                      <tr
                        key={r._id}
                        className={`${isTrashView ? 'accountant-payments-row--trash' : ''}${
                          selectedIds.includes(paymentId(r)) ? ' accountant-payments-row--selected' : ''
                        }`}
                      >
                      <td className="accountant-payments-checkbox-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select payment for ${r.studentName || r.user?.name || 'student'}`}
                          checked={selectedIds.includes(paymentId(r))}
                          onChange={() => toggleRowSelection(r)}
                        />
                      </td>
                      {showRowNumbers ? (
                        <td className="accountant-payments-num">{index + 1}</td>
                      ) : null}
                      <td className="accountant-payments-ss-cell">
                        {hasBankScreenshot(r) ? (
                          <button
                            type="button"
                            className="accountant-payments-ss-thumb"
                            onClick={() => setReceiptModal(r)}
                            title="View full screenshot"
                          >
                            {isPdfProof(r.proofUrl) ? (
                              <span className="accountant-payments-ss-pdf">
                                <i className="fas fa-file-pdf" aria-hidden />
                                PDF
                              </span>
                            ) : (
                              <img
                                src={resolveMediaUrl(r.proofUrl)}
                                alt={`Payment proof for ${r.studentName || 'student'}`}
                                loading="lazy"
                              />
                            )}
                          </button>
                        ) : (
                          <span className="accountant-payments-ss-none">—</span>
                        )}
                      </td>
                      <td>
                        <strong>{r.user?.name || r.studentName || '—'}</strong>
                        <div className="accountant-payments-sub accountant-payments-sub--copyable">
                          {displayPortalEmail(paymentRegistrationEmail(r)) || paymentRegistrationEmail(r) || '—'}
                        </div>
                      </td>
                      <td>{r.course?.title || r.courseName || '—'}</td>
                      <td className="accountant-payments-amount">${Number(r.amount || 0).toFixed(2)}</td>
                      <td>
                        <span
                          className={`accountant-payments-pill accountant-payments-pill--${
                            isPaymentPaid(r.status) ? 'paid' : r.status
                          }`}
                        >
                          {formatStatus(r.status)}
                        </span>
                      </td>
                      <td>{r.paymentMethod || '—'}</td>
                      <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                      {isTrashView ? (
                        <td className="accountant-payments-trashed-at">
                          {r.deletedAt ? new Date(r.deletedAt).toLocaleString() : '—'}
                        </td>
                      ) : null}
                      <td>
                        <div className="accountant-payments-actions">
                          {r.proofUrl ? (
                            <button
                              type="button"
                              className="accountant-pay-btn accountant-pay-btn--view"
                              onClick={() => setReceiptModal(r)}
                            >
                              <i className="fas fa-image" /> View
                            </button>
                          ) : null}
                          {isTrashView ? (
                            <>
                              <button
                                type="button"
                                className="accountant-pay-btn accountant-pay-btn--restore"
                                disabled={actionLoading === r._id}
                                onClick={() => setRestoreModal(r)}
                              >
                                <i className="fas fa-undo" /> Restore
                              </button>
                              <button
                                type="button"
                                className="accountant-pay-btn accountant-pay-btn--delete-forever"
                                disabled={actionLoading === r._id}
                                onClick={() => setPermanentDeleteModal(r)}
                              >
                                <i className="fas fa-trash-alt" /> Delete permanently
                              </button>
                            </>
                          ) : (
                            <>
                              {canReviewBankPayment(r) ? (
                                <>
                                  <button
                                    type="button"
                                    className="accountant-pay-btn accountant-pay-btn--approve"
                                    disabled={actionLoading === r._id}
                                    onClick={() => setApproveModal(r)}
                                  >
                                    <i className="fas fa-check" /> Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="accountant-pay-btn accountant-pay-btn--reject"
                                    disabled={actionLoading === r._id}
                                    onClick={() => {
                                      setRejectModal(r);
                                      setRejectReason('');
                                      setRejectError('');
                                    }}
                                  >
                                    <i className="fas fa-times" /> Reject
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                className="accountant-pay-btn accountant-pay-btn--trash"
                                disabled={actionLoading === r._id}
                                onClick={() => setTrashModal(r)}
                                title="Move to trash"
                              >
                                <i className="fas fa-trash-alt" aria-hidden />
                                Move to trash
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <PortalActionModal
        open={!!bulkModal}
        type={bulkModal?.type === 'permanent' ? 'warning' : 'info'}
        title={
          bulkModal?.type === 'trash'
            ? 'Move selected to trash?'
            : bulkModal?.type === 'restore'
              ? 'Restore selected payments?'
              : 'Delete permanently?'
        }
        message={
          bulkModal?.ids?.length
            ? bulkModal.type === 'trash'
              ? `Move ${bulkModal.ids.length} selected payment record(s) to trash? You can restore them from the Trash tab.`
              : bulkModal.type === 'restore'
                ? `Restore ${bulkModal.ids.length} selected payment record(s) to your active lists?`
                : `Are you sure you want to permanently delete ${bulkModal.ids.length} selected payment(s)? They cannot be restored later.`
            : ''
        }
        confirmLabel={
          bulkModal?.type === 'trash'
            ? 'Move to trash'
            : bulkModal?.type === 'restore'
              ? 'Restore selected'
              : 'Delete permanently'
        }
        cancelLabel="Cancel"
        loading={actionLoading === 'bulk'}
        onConfirm={
          bulkModal?.type === 'trash'
            ? handleBulkTrash
            : bulkModal?.type === 'restore'
              ? handleBulkRestore
              : handleBulkPermanentDelete
        }
        onCancel={() => setBulkModal(null)}
      />

      <PortalActionModal
        open={!!approveModal}
        type="info"
        title="Approve payment?"
        message={
          approveModal
            ? `Confirm bank transfer for ${approveModal.studentName || 'student'} — ${approveModal.course?.title || approveModal.courseName || 'course'}. This marks the payment paid and creates the student record.`
            : ''
        }
        confirmLabel="Approve"
        cancelLabel="Cancel"
        loading={!!actionLoading}
        onConfirm={handleApprove}
        onCancel={() => setApproveModal(null)}
      />

      <PortalActionModal
        open={!!trashModal}
        type="info"
        title="Move to trash?"
        message={
          trashModal
            ? `Move payment for ${trashModal.studentName || 'student'} ($${Number(trashModal.amount || 0).toFixed(2)}) to trash? You can restore it later from the Trash tab.`
            : ''
        }
        confirmLabel="Move to trash"
        cancelLabel="Cancel"
        loading={!!actionLoading}
        onConfirm={handleMoveToTrash}
        onCancel={() => setTrashModal(null)}
      />

      <PortalActionModal
        open={!!restoreModal}
        type="info"
        title="Restore payment?"
        message={
          restoreModal
            ? `Restore payment for ${restoreModal.studentName || 'student'}? It will appear in your active lists again.`
            : ''
        }
        confirmLabel="Restore"
        cancelLabel="Cancel"
        loading={!!actionLoading}
        onConfirm={handleRestore}
        onCancel={() => setRestoreModal(null)}
      />

      <PortalActionModal
        open={!!permanentDeleteModal}
        type="warning"
        title="Delete permanently?"
        message="Are you sure? This payment cannot be restored later."
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        loading={!!actionLoading}
        onConfirm={handlePermanentDelete}
        onCancel={() => setPermanentDeleteModal(null)}
      />

      <PortalActionModal
        open={!!dialogNotice}
        type={dialogNotice?.type || 'info'}
        title={dialogNotice?.title || ''}
        message={dialogNotice?.message || ''}
        confirmLabel="OK"
        onConfirm={() => setDialogNotice(null)}
        onCancel={() => setDialogNotice(null)}
      />

      {receiptModal?.proofUrl ? (
        <div className="accountant-receipt-modal" role="dialog" aria-modal="true">
          <div className="accountant-receipt-modal__backdrop" onClick={() => setReceiptModal(null)} />
          <div className="accountant-receipt-modal__panel">
            <div className="accountant-receipt-modal__head">
              <h3>Payment screenshot</h3>
              <button type="button" onClick={() => setReceiptModal(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <p>
              {receiptModal.studentName || 'Student'} — {receiptModal.course?.title || receiptModal.courseName}
            </p>
            {String(receiptModal.proofUrl).toLowerCase().endsWith('.pdf') ? (
              <a href={resolveMediaUrl(receiptModal.proofUrl)} target="_blank" rel="noopener noreferrer">
                Open PDF proof
              </a>
            ) : (
              <img src={resolveMediaUrl(receiptModal.proofUrl)} alt="Payment proof screenshot" />
            )}
          </div>
        </div>
      ) : null}

      {rejectModal ? (
        <div className="accountant-receipt-modal" role="dialog" aria-modal="true">
          <div
            className="accountant-receipt-modal__backdrop"
            onClick={() => {
              if (actionLoading) return;
              setRejectModal(null);
              setRejectReason('');
              setRejectError('');
            }}
          />
          <div className="accountant-receipt-modal__panel accountant-receipt-modal__panel--form">
            <div className="accountant-receipt-modal__head">
              <h3>Reject payment</h3>
              <button
                type="button"
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                  setRejectError('');
                }}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <p>Reason for rejecting {rejectModal.studentName || 'this payment'}:</p>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError('');
              }}
              placeholder="e.g. Wrong amount, unclear screenshot"
            />
            {rejectError ? <p className="accountant-dialog__inline-error">{rejectError}</p> : null}
            <div className="accountant-dialog__actions">
              <button
                type="button"
                className="accountant-dialog__btn accountant-dialog__btn--ghost"
                disabled={!!actionLoading}
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                  setRejectError('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="accountant-dialog__btn accountant-dialog__btn--danger"
                disabled={actionLoading === rejectModal._id}
                onClick={handleReject}
              >
                {actionLoading === rejectModal._id ? <i className="fas fa-spinner fa-spin" /> : null} Confirm reject
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AccountantPayments;
