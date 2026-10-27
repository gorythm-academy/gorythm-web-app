import { useRef } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { FeeBadge, PortalAlert, PortalDataSection } from './PortalUi';
import PortalModal from './PortalModal';
import PhoneNumberField from '../../shared/PhoneNumberField';
import { canSelectFee, enrollmentStatusLabel, formatDueDate, formatMoney, formatPaymentDate, maxPayableMonths, resolveFeeDueDate, savedCardLabel } from '../../../utils/billingLabels';

function formatCharge(amount) {
  return formatMoney(amount, 'EUR');
}

function monthChoiceLabel(item, payMonths, includeCourse = false) {
  const remainingNow = maxPayableMonths(item.raw || item);
  const leftAfter = Math.max(0, remainingNow - payMonths);
  const total = Number(item.totalFeeCount ?? item.course?.totalFeeCount);
  const hasTotal = Number.isFinite(total) && total >= 1;
  const name = includeCourse ? `${item.courseName || item.course?.title || 'Course'} · ` : '';
  if (!hasTotal) {
    return `${name}paying ${payMonths} month${payMonths === 1 ? '' : 's'} now`;
  }
  if (leftAfter < 1) {
    return `${name}paying ${payMonths} of ${remainingNow} remaining · none left after this`;
  }
  return `${name}paying ${payMonths} of ${remainingNow} remaining · ${leftAfter} left after this`;
}

function rowHasSavedCard(row, savedCards, savedCardsByStudent) {
  const studentId = String(row?.studentId || row?.raw?.studentId || '');
  if (Array.isArray(savedCardsByStudent) && savedCardsByStudent.length) {
    const group = savedCardsByStudent.find((entry) => String(entry?.studentId || '') === studentId);
    return Array.isArray(group?.cards) && group.cards.length > 0;
  }
  return Array.isArray(savedCards) && savedCards.length > 0;
}

export function PortalBillingCheckoutView({ state }) {
  const {
    notice,
    groupByChild,
    unpaidItems,
    busy,
    openPayOverlay,
    loading,
    error,
    enrollmentRows,
    emptyEnrollmentsText,
    onToggleAutoPay,
    savedCards,
    savedCardsByStudent,
    handleToggleAutoPay,
    cardGroups,
    onDeleteCard,
    handleDeleteCard,
    invoiceDownloadTargets,
    openDownloadAllPicker,
    downloadingKey,
    historyError,
    historyRows,
    emptyHistoryText,
    handleDownloadInvoice,
    payOpen,
    tone,
    setPayOpen,
    groupedUnpaid,
    selected,
    toggle,
    payMonths,
    invoiceMode,
    setInvoiceMode,
    selectedItems,
    maxSharedMonths,
    showAllRemainingLabel,
    setMonths,
    allSelectedHaveTotal,
    method,
    setMethod,
    saveCardForAutoPay,
    setSaveCardForAutoPay,
    hasBankInfo,
    bankDetails,
    phone,
    phoneStatus,
    setPhone,
    setPhoneStatus,
    setProofFile,
    selectedTotal,
    proofFile,
    handlePay,
    invoicePicker,
    setInvoicePicker,
    downloadCombinedFromPicker,
    downloadSeparateFromPicker,
    downloadAllPicker,
    setDownloadAllPicker,
    downloadAllCombined,
    downloadAllSeparate,
    itemKey,
    payableForMonths,
    feeStatusOf,
  } = state;
  const proofInputRef = useRef(null);

  const clearProofFile = () => {
    setProofFile(null);
    if (proofInputRef.current) proofInputRef.current.value = '';
  };

  return (
<>
      {notice ? <PortalAlert type="success">{notice}</PortalAlert> : null}

      <div className="portal-panel portal-billing-panel">
        <div className="portal-panel__head">
          <div>
            <h2>{groupByChild ? "Children's Courses" : 'Your Courses'}</h2>
            <p>Fee status, due date, and a Pay button when a course still needs payment.</p>
          </div>
          {unpaidItems.length ? (
            <button type="button" className="portal-billing-pay" disabled={busy} onClick={() => openPayOverlay()}>
              Pay Fees
            </button>
          ) : null}
        </div>
        <div className="portal-panel__body">
          <PortalDataSection loading={loading} error={error} loadingLabel={groupByChild ? "Loading children's courses…" : 'Loading your courses…'}>
            {enrollmentRows.length === 0 ? (
              <p className="portal-empty">{emptyEnrollmentsText}</p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--green">
                  <thead>
                    <tr>
                      {groupByChild ? <th>Child</th> : null}
                      <th>Course</th>
                      <th>Course Status</th>
                      <th>Fee</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th className="portal-billing-pay-col">Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollmentRows.map((row) => {
                      const pillClass =
                        row.enrollmentStatus === 'active'
                          ? 'submitted'
                          : row.enrollmentStatus === 'completed'
                            ? 'completed'
                            : 'inactive';
                      return (
                        <tr key={row.id}>
                          {groupByChild ? <td>{row.studentName || '—'}</td> : null}
                          <td>
                            <strong>{row.courseName}</strong>
                            {row.courseCategory && row.courseCategory !== '—' ? (
                              <div className="portal-billing-sub">{row.courseCategory}</div>
                            ) : null}
                          </td>
                          <td>
                            <span className={`portal-status-pill portal-status-pill--${pillClass}`}>
                              {enrollmentStatusLabel(row.enrollmentStatus)}
                            </span>
                          </td>
                          <td>
                            <FeeBadge status={row.feeStatus} />
                            {row.feeProgress ? (
                              <div className="portal-billing-sub">{row.feeProgress}</div>
                            ) : null}
                            {row.raw?.declineNote ? (
                              <div className="portal-billing-decline-note">{row.raw.declineNote}</div>
                            ) : null}
                            {row.awaitingReview && row.feeStatus === 'overdue' ? (
                              <div className="portal-billing-verify">Waiting for Verification</div>
                            ) : null}
                            {row.autoPayEnabled ? (
                              <div className="portal-billing-sub">Auto-pay on</div>
                            ) : null}
                            {row.autoPayLastError ? (
                              <div className="portal-billing-decline-note">{row.autoPayLastError}</div>
                            ) : null}
                          </td>
                          <td>{formatDueDate(row.dueDate)}</td>
                          <td>
                            {formatCharge(row.amount)}
                            {row.partialPaidAmount > 0 ? (
                              <div className="portal-billing-sub">
                                {formatCharge(row.partialPaidAmount)} received · {formatCharge(row.amount - row.partialPaidAmount)} left
                              </div>
                            ) : null}
                          </td>
                          <td className="portal-billing-pay-col">
                            <div className="portal-billing-invoice-actions">
                            {row.canPay ? (
                              <button
                                type="button"
                                className="portal-billing-pay-row"
                                disabled={busy}
                                onClick={() => openPayOverlay(row.raw)}
                                aria-label="Pay"
                              >
                                <span className="portal-billing-pay-row__label">Pay</span>
                              </button>
                            ) : row.raw?.allFeesPaid ? (
                              <span className="portal-billing-sub">All Fees Paid</span>
                            ) : String(row.enrollmentStatus || '').toLowerCase() === 'paused' ? (
                              <span className="portal-billing-sub">Paused</span>
                            ) : row.awaitingReview ? (
                              <span className="portal-billing-verify">Waiting for Verification</span>
                            ) : row.noFee ? (
                              <span className="portal-billing-sub">No Fee</span>
                            ) : (
                              <span className="portal-billing-sub">—</span>
                            )}
                            {onToggleAutoPay && !row.raw?.allFeesPaid && !row.noFee && String(row.enrollmentStatus || '').toLowerCase() !== 'paused' && (row.autoPayEnabled || rowHasSavedCard(row, savedCards, savedCardsByStudent)) ? (
                              <button
                                type="button"
                                className="portal-billing-invoice-btn"
                                disabled={busy}
                                onClick={() => handleToggleAutoPay(row)}
                              >
                                {row.autoPayEnabled ? 'Turn off Auto-Pay' : 'Turn on Auto-Pay'}
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
          </PortalDataSection>
        </div>
      </div>

      {cardGroups.length ? (
        <div className="portal-panel portal-billing-panel">
          <div className="portal-panel__head">
            <div>
              <h2>Saved Cards</h2>
              <p>Cards saved from card payments. Auto-pay uses the last card that paid a fee. Removing the last card turns automatic monthly charges off.</p>
            </div>
          </div>
          <div className="portal-panel__body">
            {cardGroups.map((group) => (
              <div key={String(group.studentId || 'cards')} className="portal-billing-group">
                {group.studentName ? <h3>{group.studentName}</h3> : null}
                <ul className="portal-billing-cards">
                  {group.cards.map((card) => (
                    <li key={card.id} className="portal-billing-card">
                      <span>
                        {savedCardLabel(card)}
                        {card.lastUsed ? <span className="portal-billing-sub">Last Used</span> : null}
                      </span>
                      {onDeleteCard ? (
                        <button
                          type="button"
                          className="portal-billing-invoice-btn"
                          disabled={busy}
                          onClick={() => handleDeleteCard(group, card)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="portal-panel portal-billing-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Payment History</h2>
            <p>
              Click Invoice to download. Rows with more than one course let you choose a combined invoice or separate invoices.
            </p>
          </div>
          {invoiceDownloadTargets.length ? (
            <button type="button" className="portal-billing-download-all" onClick={openDownloadAllPicker} disabled={busy || Boolean(downloadingKey)}>
              {downloadingKey === 'all' ? 'Downloading…' : 'Download All Invoices'}
            </button>
          ) : null}
        </div>
        <div className="portal-panel__body">
          {historyError ? <PortalAlert type="error">{historyError}</PortalAlert> : null}
          <PortalDataSection loading={loading} loadingLabel="Loading payment history…">
            {historyRows.length === 0 ? (
              <p className="portal-empty">{emptyHistoryText}</p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table">
                  <thead>
                    <tr>
                      <th>Details</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((payment) => (
                      <tr key={payment._id}>
                        <td>
                          <strong>
                            {payment.invoiceMode === 'combined'
                              ? 'Combined invoice'
                              : (payment.courseName || payment.course?.title || '—')}
                          </strong>
                          {payment.studentName ? (
                            <div className="portal-billing-sub">{payment.studentName}</div>
                          ) : null}
                          {Array.isArray(payment.lines) && payment.lines.length > 1 ? (
                            <ul className="portal-billing-lines">
                              {payment.lines.map((line, index) => (
                                <li key={`${payment._id}-${index}`}>
                                  {line.studentName ? `${line.studentName} · ` : ''}
                                  {line.courseName}
                                  {Number(line.installmentMonths) > 1 && !/\(\d+ months?\)$/.test(String(line.courseName || ''))
                                    ? ` · ${line.installmentMonths} months`
                                    : ''}
                                  {' · '}
                                  {formatMoney(line.amount, payment.currency)}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </td>
                        <td>{formatMoney(payment.amount, payment.currency)}</td>
                        <td>
                          <FeeBadge status={payment.displayStatus || payment.status} />
                          {String(payment.cancelReason || '').trim() ? (
                            <div className="portal-billing-decline-note">{String(payment.cancelReason).trim()}</div>
                          ) : null}
                        </td>
                        <td>{formatPaymentDate(payment)}</td>
                        <td>
                          {payment.invoiceButtons?.length ? (
                            <div className="portal-billing-invoice-actions">
                              {payment.invoiceButtons.map((button) => (
                                <button
                                  key={button.key}
                                  type="button"
                                  className="portal-billing-invoice-btn"
                                  disabled={Boolean(downloadingKey)}
                                  onClick={() => handleDownloadInvoice(button)}
                                >
                                  <i className="fas fa-file-download" aria-hidden />
                                  {downloadingKey === button.key ? 'Downloading…' : button.label}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="portal-billing-sub">Available after payment is received</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PortalDataSection>
        </div>
      </div>

      {payOpen ? (
        <PortalModal title="Pay Course Fees" tone={tone} kicker="Billing" onClose={() => {
          if (busy) return;
          setPayOpen(false);
        }} wide>
          {unpaidItems.length === 0 ? (
            <p className="portal-empty">There are no unpaid course fees right now.</p>
          ) : (
            <div className="portal-billing-overlay">
              <p className="portal-billing-overlay-lead">
                Choose the courses to pay, how many months to pay now, then one invoice or a separate invoice for each course.
              </p>
              {groupedUnpaid.map((group) => (
                <div key={group.label || 'all'} className="portal-billing-group">
                  {group.label ? <h3>{group.label}</h3> : null}
                  <div className="portal-data-table-wrap">
                    <table className="portal-data-table">
                      <thead>
                        <tr>
                          <th className="portal-billing-check-col">Pay</th>
                          <th>Course</th>
                          <th>Amount</th>
                          <th>Due Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => {
                          const enabled = canSelectFee(item) && !busy;
                          const checked = Boolean(selected[itemKey(item)]);
                          return (
                            <tr
                              key={itemKey(item)}
                              className={`portal-billing-row${checked ? ' is-selected' : ''}${enabled ? '' : ' is-locked'}`}
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  disabled={!enabled}
                                  checked={enabled ? checked : false}
                                  onChange={(e) => toggle(item, e.target.checked)}
                                  aria-label={`Pay ${item.courseName || item.course?.title}`}
                                />
                              </td>
                              <td>
                                <strong>{item.courseName || item.course?.title}</strong>
                                {!groupByChild && item.studentName ? (
                                  <div className="portal-billing-sub">{item.studentName}</div>
                                ) : null}
                                {checked ? (
                                  <div className="portal-billing-sub">{monthChoiceLabel(item, payMonths)}</div>
                                ) : null}
                              </td>
                              <td>
                                {formatCharge(payableForMonths(item, checked ? payMonths : 1))}
                                {checked && payMonths > 1 && !Number(item.partialPaidAmount) ? (
                                  <div className="portal-billing-sub">
                                    {formatCharge(item.amount)} × {payMonths}
                                  </div>
                                ) : null}
                                {Number(item.partialPaidAmount) > 0 ? (
                                  <div className="portal-billing-sub">
                                    {formatCharge(item.partialPaidAmount)} already received
                                  </div>
                                ) : null}
                              </td>
                              <td>{formatDueDate(resolveFeeDueDate(item))}</td>
                              <td>
                                <FeeBadge status={feeStatusOf(item)} />
                                {item.feeProgress ? (
                                  <div className="portal-billing-sub">{item.feeProgress}</div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <fieldset className="portal-billing-options" disabled={busy}>
                <legend>Invoice</legend>
                <label>
                  <input
                    type="radio"
                    name="invoiceMode"
                    value="combined"
                    checked={invoiceMode === 'combined'}
                    onChange={() => setInvoiceMode('combined')}
                  />
                  One combined invoice for the selected fees
                </label>
                <label>
                  <input
                    type="radio"
                    name="invoiceMode"
                    value="separate"
                    checked={invoiceMode === 'separate'}
                    onChange={() => setInvoiceMode('separate')}
                  />
                  Separate invoice for each selected fee
                </label>
              </fieldset>

              {selectedItems.length ? (
                <fieldset className="portal-billing-options" disabled={busy}>
                  <legend>How Many Months?</legend>
                  {Array.from({ length: maxSharedMonths }, (_, index) => {
                    const value = index + 1;
                    const isAll = showAllRemainingLabel && value === maxSharedMonths && value > 1;
                    return (
                      <label key={value}>
                        <input
                          type="radio"
                          name="payMonths"
                          value={value}
                          checked={payMonths === value}
                          onChange={() => setMonths(value)}
                        />
                        {isAll
                          ? `${value} month${value === 1 ? '' : 's'} (all remaining)`
                          : `${value} month${value === 1 ? '' : 's'}`}
                      </label>
                    );
                  })}
                  <p className="portal-billing-sub">
                    Paying {payMonths} month{payMonths === 1 ? '' : 's'} now
                    {maxSharedMonths > payMonths ? ` · up to ${maxSharedMonths} in this checkout` : ''}.
                  </p>
                  <ul className="portal-billing-lines">
                    {selectedItems.map((item) => (
                      <li key={itemKey(item)}>{monthChoiceLabel(item, payMonths, true)}</li>
                    ))}
                  </ul>
                  {!allSelectedHaveTotal ? (
                    <p className="portal-billing-sub">Courses without a set total can be paid up to 4 months at a time.</p>
                  ) : null}
                </fieldset>
              ) : null}

              <fieldset className="portal-billing-options" disabled={busy}>
                <legend>How Would You Like to Pay?</legend>
                <label>
                  <input
                    type="radio"
                    name="payMethod"
                    value="stripe"
                    checked={method === 'stripe'}
                    onChange={() => setMethod('stripe')}
                  />
                  Pay with card
                </label>
                <label>
                  <input
                    type="radio"
                    name="payMethod"
                    value="bank"
                    checked={method === 'bank'}
                    onChange={() => setMethod('bank')}
                  />
                  Bank transfer
                </label>
              </fieldset>

              {method === 'stripe' && selectedItems.length ? (
                <fieldset className="portal-billing-options" disabled={busy}>
                  <legend>Automatic Monthly Charges</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={saveCardForAutoPay}
                      onChange={(e) => setSaveCardForAutoPay(e.target.checked)}
                    />
                    Charge this card automatically each month
                  </label>
                  <p className="portal-billing-sub">
                    Untick this to pay only this checkout.
                    {' '}While it is ticked, we save the card and later charge{' '}
                    {selectedItems.map((item) => `${formatCharge(item.amount)} for ${item.courseName}`).join('; ')}
                    {' '}each month until the remaining fees are paid. Later months are charged in euros. You can turn this off or remove the card later.
                  </p>
                </fieldset>
              ) : null}

              {method === 'bank' ? (
                <div className="portal-billing-bank">
                  <ol className="portal-billing-bank-steps">
                    <li>Transfer the fee using the bank details below.</li>
                    <li>Upload a screenshot or PDF of the transfer as proof.</li>
                    <li>The academy will check the proof and then contact you.</li>
                  </ol>
                  {hasBankInfo ? (
                    <ul>
                      {bankDetails.accountName ? <li>Account Name: {bankDetails.accountName}</li> : null}
                      {bankDetails.bankName ? <li>Bank: {bankDetails.bankName}</li> : null}
                      {bankDetails.accountNumber ? <li>Account Number: {bankDetails.accountNumber}</li> : null}
                      {bankDetails.iban ? <li>IBAN: {bankDetails.iban}</li> : null}
                      {bankDetails.swift ? <li>SWIFT: {bankDetails.swift}</li> : null}
                      {bankDetails.extraNote ? <li>{bankDetails.extraNote}</li> : null}
                    </ul>
                  ) : (
                    <p>Bank details are not listed yet. Please pay by card or contact the academy.</p>
                  )}
                  <label className="portal-billing-phone" htmlFor="portal-whatsapp">
                    <span>WhatsApp number <RequiredMark /></span>
                    <PhoneNumberField
                      id="portal-whatsapp"
                      appearance="light"
                      required
                      value={phone}
                      ariaLabel="WhatsApp number"
                      disabled={busy}
                      onChange={({ e164, status }) => {
                        setPhone(e164);
                        setPhoneStatus(status);
                      }}
                    />
                  </label>
                  <div className="portal-billing-proof">
                    <div className="portal-field-label portal-file-upload portal-file-upload--fee">
                      <span>Transfer Proof</span>
                      <div className="portal-file-upload__control">
                        <input
                          ref={proofInputRef}
                          type="file"
                          tabIndex={-1}
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        />
                        <button
                          type="button"
                          className="portal-file-upload__pick"
                          onClick={() => proofInputRef.current?.click()}
                        >
                          <i className="fas fa-cloud-upload-alt" aria-hidden="true" />
                          {proofFile ? 'Change file' : 'Choose file'}
                        </button>
                      </div>
                      <small className="portal-file-upload__hint">JPG, PNG, WebP, or PDF</small>
                    </div>
                    {proofFile ? (
                      <div className="portal-file-upload__selected">
                        <span>{proofFile.name}</span>
                        <button type="button" className="portal-file-remove" onClick={clearProofFile}>
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="portal-billing-overlay-footer">
                <div className="portal-billing-overlay-total">
                  <strong>{formatCharge(selectedTotal)}</strong>
                  {payMonths > 1 ? (
                    <div className="portal-billing-sub">{payMonths} months</div>
                  ) : null}
                  <button
                    type="button"
                    className="portal-billing-pay"
                    disabled={busy || !selectedItems.length || maxSharedMonths < 1 || (method === 'bank' && (!proofFile || !hasBankInfo || phoneStatus !== 'valid'))}
                    onClick={handlePay}
                  >
                    {busy ? 'Please wait…' : method === 'bank' ? 'Submit payment proof' : 'Pay now'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </PortalModal>
      ) : null}

      {invoicePicker ? (
        <PortalModal title="Download Invoice" tone={tone} kicker="Invoice" onClose={() => !downloadingKey && setInvoicePicker(null)}>
          <p className="portal-billing-overlay-lead">
            This row includes more than one course. Download one combined invoice, or a separate invoice for each course.
          </p>
          <div className="portal-billing-invoice-actions">
            <button
              type="button"
              className="portal-billing-invoice-btn"
              disabled={Boolean(downloadingKey)}
              onClick={downloadCombinedFromPicker}
            >
              Combined invoice
            </button>
            <button
              type="button"
              className="portal-billing-invoice-btn"
              disabled={Boolean(downloadingKey)}
              onClick={downloadSeparateFromPicker}
            >
              Separate invoices
            </button>
          </div>
        </PortalModal>
      ) : null}

      {downloadAllPicker ? (
        <PortalModal title="Download All Invoices" tone={tone} kicker="Invoices" onClose={() => !downloadingKey && setDownloadAllPicker(false)}>
          <p className="portal-billing-overlay-lead">
            Download one PDF of every invoice in this table, or download each invoice as a separate PDF.
          </p>
          <div className="portal-billing-invoice-actions">
            <button
              type="button"
              className="portal-billing-invoice-btn"
              disabled={Boolean(downloadingKey)}
              onClick={async () => {
                setDownloadAllPicker(false);
                await downloadAllCombined();
              }}
            >
              One PDF of all invoices
            </button>
            <button
              type="button"
              className="portal-billing-invoice-btn"
              disabled={Boolean(downloadingKey)}
              onClick={async () => {
                setDownloadAllPicker(false);
                await downloadAllSeparate();
              }}
            >
              Separate PDF for each invoice
            </button>
          </div>
        </PortalModal>
      ) : null}
    </>
  );
}
