import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { portalGet, portalPatch } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { resolveMediaUrl } from '../../../utils/resolveMediaUrl';
import { paymentRegistrationEmail } from '../../../utils/studentPortalEmail';
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
    type === 'error' ? 'fa-circle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-question';

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
              className={`accountant-dialog__btn accountant-dialog__btn--${type === 'error' ? 'danger' : 'primary'}`}
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
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('bank-ss');
  const [receiptModal, setReceiptModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [toast, setToast] = useState(null);
  const [dialogNotice, setDialogNotice] = useState(null);

  const notifyPaymentsUpdated = useCallback(() => {
    window.dispatchEvent(new CustomEvent(ACCOUNTANT_PAYMENTS_UPDATED_EVENT));
  }, []);

  const loadPayments = useCallback(() => {
    setError('');
    portalGet('/accountant/payments')
      .then((res) => {
        if (res.success) {
          setPayments(res.payments || []);
          notifyPaymentsUpdated();
        } else setError(res.error || 'Failed');
      })
      .catch((err) => setError(err.message));
  }, [notifyPaymentsUpdated]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const bankScreenshotPayments = useMemo(
    () => (payments || []).filter(hasBankScreenshot),
    [payments]
  );

  const filtered = useMemo(() => {
    if (!payments) return [];
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

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (payments === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  const awaitingCount = countPendingBankReviews(payments);
  const bankSsCount = bankScreenshotPayments.length;
  const showRowNumbers = filter === 'review' || filter === 'bank-ss';

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
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="portal-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Payments table</h2>
            <p>{filtered.length} record{filtered.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="portal-panel__body">
          {filtered.length === 0 ? (
            <p className="portal-select-hint accountant-payments-empty">No payments in this filter.</p>
          ) : (
            <div className="portal-data-table-wrap">
              <table className="portal-data-table portal-data-table--orange accountant-payments-table">
                <thead>
                  <tr>
                    {showRowNumbers ? <th className="accountant-payments-num">#</th> : null}
                    <th>Screenshot</th>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, index) => (
                    <tr key={r._id}>
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
                        <div className="accountant-payments-sub">{paymentRegistrationEmail(r) || '—'}</div>
                      </td>
                      <td>{r.course?.title || r.courseName || '—'}</td>
                      <td>${Number(r.amount || 0).toFixed(2)}</td>
                      <td>
                        <span className={`accountant-pay-status accountant-pay-status--${isPaymentPaid(r.status) ? 'paid' : r.status}`}>
                          {formatStatus(r.status)}
                        </span>
                      </td>
                      <td>{r.paymentMethod || '—'}</td>
                      <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <div className="accountant-payments-actions">
                          {r.proofUrl ? (
                            <button
                              type="button"
                              className="accountant-pay-btn accountant-pay-btn--view"
                              onClick={() => setReceiptModal(r)}
                            >
                              <i className="fas fa-image" /> View screenshot
                            </button>
                          ) : null}
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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
