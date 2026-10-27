import {
    ProtectedFileFrame,
    ProtectedFileImage,
    ProtectedFileLink,
} from '../../../utils/fileUrl';
import { formatMoney } from '../../../utils/billingLabels';

export function PaymentsManagementModals({ state }) {
  const {
    declineModal,
    downloadCombinedFromPicker,
    downloadSeparateFromPicker,
    dueDateModal,
    invoicePicker,
    proofModal,
    receiveModal,
    setDeclineModal,
    setDueDateModal,
    setInvoicePicker,
    setProofModal,
    setReceiveModal,
    submitDecline,
    submitDueDate,
    submitReceive,
  } = state;

  return (
    <>
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
                            <h3>Extend Due Date</h3>
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
                            Edit Course → Fee Due Date.
                        </p>
                        <label className="payment-due-modal__field">
                            Due Date
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
                                {dueDateModal.saving ? 'Saving…' : 'Save Due Date'}
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
                            <h3>Mark as Received</h3>
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
                            This marks {receiveModal.label} paid and enrolls the{' '}
                            {receiveModal.studentCount > 1 ? 'students' : 'student'}. Use this for bank or cash payments.
                        </p>
                        {receiveModal.partialAllowed ? (
                            <label className="payment-due-modal__field">
                                Amount Received (Bill Is {formatMoney(receiveModal.billed, receiveModal.currency || 'USD')})
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
                                    Use this when only a partial payment was received. Enter the amount paid now; the
                                    unpaid balance stays due until the rest is received.
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
                                {receiveModal.saving ? 'Saving…' : 'Mark Received'}
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
    </>
  );
}
