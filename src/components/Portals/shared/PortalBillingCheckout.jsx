import React, { useEffect, useMemo, useState } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { FeeBadge, PortalAlert, PortalDataSection } from './PortalUi';
import PortalModal from './PortalModal';
import { usePortalDialog } from './PortalDialogContext';
import {
  canDownloadInvoice,
  canSelectFee,
  enrollmentStatusLabel,
  formatDueDate,
  formatMoney,
  formatPaymentDate,
  maxPayableMonths,
  resolveFeeDueDate,
  savedCardLabel,
  sharedMaxPayableMonths,
  triggerBlobDownload,
} from '../../../utils/billingLabels';
import { normalizeEnrollmentStatus } from '../../../utils/studentAdminValidation';

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

function itemKey(item) {
  return String(item.enrollmentId || item._id || `${item.studentId}-${item.courseId}`);
}

function feeStatusOf(item) {
  return String(
    item?.displayStatus || item?.displayFeeStatus || item?.paymentStatus || item?.feeStatus || ''
  ).toLowerCase();
}

function paymentCoversEnrollment(payment, enrollment) {
  const enrollmentId = String(enrollment.enrollmentId || enrollment._id || '');
  const studentId = String(enrollment.studentId || enrollment.student?._id || '');
  const courseId = String(enrollment.courseId || enrollment.course?._id || '');
  const email = String(enrollment.studentEmail || enrollment.student?.email || '').trim().toLowerCase();
  const courseName = String(enrollment.courseName || enrollment.course?.title || '').trim().toLowerCase();
  if ((payment.lines || []).some((line) => {
    if (line.enrollment && String(line.enrollment) === enrollmentId) return true;
    const lineStudent = String(line.student?._id || line.student || '');
    const lineCourse = String(line.course?._id || line.course || '');
    if (lineStudent && studentId && lineStudent === studentId && lineCourse === courseId) return true;
    if (email && String(line.studentEmail || '').toLowerCase() === email && lineCourse === courseId) return true;
    if (courseName && String(line.courseName || '').trim().toLowerCase() === courseName) {
      if (!studentId || String(line.studentName || '').trim() === String(enrollment.studentName || enrollment.student?.name || '').trim()) {
        return true;
      }
    }
    return false;
  })) {
    return true;
  }
  const payUser = String(payment.user?._id || payment.user || '');
  const payCourse = String(payment.course?._id || payment.course || '');
  if (payUser && studentId && payUser === studentId && payCourse && courseId && payCourse === courseId) {
    return true;
  }
  return Boolean(
    email
    && String(payment.email || '').toLowerCase() === email
    && payCourse
    && courseId
    && payCourse === courseId
  );
}

function checkoutGroupKey(payment) {
  if (payment?.fromEnrollment) return `enr:${payment._id}`;
  if (payment?.groupId) return `group:${payment.groupId}`;
  if (payment?.stripePaymentIntentId) return `pi:${payment.stripePaymentIntentId}`;
  return `id:${payment?._id}`;
}

function isCombinedPayment(payment) {
  if (payment?.invoiceMode === 'combined') return true;
  if (payment?.invoiceMode === 'separate') return false;
  return Array.isArray(payment?.lines) && payment.lines.length > 1;
}

function refId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
}

function lineCourseId(line, payment) {
  return refId(line?.course) || refId(payment?.course);
}

function lineStudentId(line, payment) {
  return refId(line?.student) || refId(payment?.user);
}

function separateInvoiceTargets(siblings, primary) {
  if (primary.fromEnrollment) {
    return canDownloadInvoice(primary)
      ? [{ key: String(primary._id), label: primary.courseName || 'Invoice', payment: primary }]
      : [];
  }
  const combined = siblings.length === 1 && isCombinedPayment(primary);
  if (combined) {
    const lines = Array.isArray(primary.lines) && primary.lines.length
      ? primary.lines
      : [{
          courseName: primary.courseName || primary.course?.title,
          course: primary.course,
          student: primary.user,
          studentName: primary.studentName,
        }];
    if (!canDownloadInvoice(primary)) return [];
    return lines.map((line, index) => ({
      key: `${primary._id}-line-${index}`,
      label: line.courseName || 'Course',
      payment: primary,
      courseId: lineCourseId(line, primary),
      studentId: lineStudentId(line, primary),
      courseName: line.courseName || '',
    }));
  }
  return siblings.filter(canDownloadInvoice).map((row) => ({
    key: String(row._id),
    label: row.course?.title || row.courseName || row.lines?.[0]?.courseName || 'Invoice',
    payment: row,
    courseId: lineCourseId(row.lines?.[0], row),
    studentId: lineStudentId(row.lines?.[0], row),
    courseName: row.course?.title || row.courseName || row.lines?.[0]?.courseName || '',
  }));
}

function groupPaymentHistory(payments) {
  const buckets = new Map();
  (payments || []).forEach((payment) => {
    const key = checkoutGroupKey(payment);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(payment);
  });
  return [...buckets.values()].map((siblings) => {
    const primary = siblings[0];
    const combined = !primary.fromEnrollment && siblings.length === 1 && isCombinedPayment(primary);
    const lines = primary.fromEnrollment
      ? []
      : siblings.flatMap((row) =>
        Array.isArray(row.lines) && row.lines.length
          ? row.lines.map((line) => ({ ...line, paymentId: row._id }))
          : [{
              studentName: row.user?.name || row.studentName || '',
              courseName: row.course?.title || row.courseName || 'Course',
              amount: row.amount,
              paymentId: row._id,
            }]
      );
    const separateTargets = separateInvoiceTargets(siblings, primary);
    const invoiceButtons = separateTargets.length
      ? [{
          key: `${primary._id}-invoice`,
          label: 'Invoice',
          payment: primary,
          multi: separateTargets.length > 1,
          separateTargets,
        }]
      : [];
    if (primary.fromEnrollment) {
      return {
        ...primary,
        invoiceMode: 'separate',
        invoiceButtons,
      };
    }
    return {
      ...primary,
      amount: siblings.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      lines,
      groupedSiblings: siblings,
      invoiceMode: combined ? 'combined' : 'separate',
      invoiceButtons,
    };
  });
}

function normalizeEnrollmentRow(item) {
  const feeStatus = feeStatusOf(item);
  const amount = Number(item.amount ?? item.course?.price ?? 0);
  return {
    raw: item,
    id: itemKey(item),
    enrollmentId: item.enrollmentId || item._id,
    studentId: item.studentId || item.student?._id,
    studentName: item.studentName || item.student?.name || '',
    courseName: item.courseName || item.course?.title || '—',
    courseCategory: item.courseCategory || item.course?.category || '—',
    enrollmentStatus: normalizeEnrollmentStatus(item.enrollmentStatus || item.status || 'active'),
    feeStatus: item.allFeesPaid ? 'paid' : feeStatus,
    feeProgress: item.feeProgress || '',
    dueDate: resolveFeeDueDate(item),
    amount,
    noFee: Number.isFinite(amount) && amount < 0.5,
    canPay: canSelectFee(item) && !item.allFeesPaid,
    awaitingReview: Boolean(item.awaitingReview) || ['awaiting_review', 'processing'].includes(feeStatus),
    maxPayableMonths: maxPayableMonths(item),
    totalFeeCount: item.totalFeeCount ?? item.course?.totalFeeCount ?? null,
    paidInstallmentCount: Number(item.paidInstallmentCount || 0),
    autoPayEnabled: Boolean(item.autoPayEnabled),
    autoPayLastError: String(item.autoPayLastError || '').trim(),
  };
}

const PortalBillingCheckout = ({
  enrollments = [],
  payable = [],
  payments = [],
  bankDetails = null,
  groupByChild = false,
  loading = false,
  error = '',
  notice = '',
  busy = false,
  tone = 'student',
  emptyEnrollmentsText = 'No courses are listed here yet. When the academy adds a course, it will appear on this page.',
  emptyHistoryText = 'Paid invoices will appear here after a fee is received.',
  onPayStripe,
  onPayBank,
  onDownloadInvoice,
  onToggleAutoPay,
  onDeleteCard,
  savedCards = [],
  savedCardsByStudent = [],
}) => {
  const { showAlert, showConfirm } = usePortalDialog();
  const enrollmentRows = useMemo(() => {
    const source = enrollments.length ? enrollments : payable;
    return source.map(normalizeEnrollmentRow);
  }, [enrollments, payable]);

  const unpaidItems = useMemo(
    () => enrollmentRows.filter((row) => row.canPay).map((row) => row.raw),
    [enrollmentRows]
  );
  const selectable = useMemo(() => unpaidItems.filter((item) => canSelectFee(item)), [unpaidItems]);
  const selectableKey = selectable.map((item) => itemKey(item)).sort().join('|');
  const [payOpen, setPayOpen] = useState(false);
  const [selected, setSelected] = useState({});
  const [invoiceMode, setInvoiceMode] = useState('combined');
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState('stripe');
  const [proofFile, setProofFile] = useState(null);
  const [phone, setPhone] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [downloadingKey, setDownloadingKey] = useState('');
  const [invoicePicker, setInvoicePicker] = useState(null);
  const [downloadAllPicker, setDownloadAllPicker] = useState(false);

  const openPayOverlay = (focusItem) => {
    const next = {};
    selectable.forEach((item) => {
      next[itemKey(item)] = true;
    });
    if (focusItem) {
      Object.keys(next).forEach((key) => {
        next[key] = key === itemKey(focusItem);
      });
      next[itemKey(focusItem)] = true;
    }
    setSelected(next);
    setInvoiceMode('combined');
    setMonths(1);
    setMethod('stripe');
    setProofFile(null);
    setPayOpen(true);
  };

  const selectedItems = selectable.filter((item) => selected[itemKey(item)]);
  const maxSharedMonths = sharedMaxPayableMonths(selectedItems);
  const payMonths = Math.min(Math.max(1, months), maxSharedMonths || 1);
  const selectedTotal = selectedItems.reduce((sum, item) => sum + Number(item.amount || 0) * payMonths, 0);
  const allSelectedHaveTotal = selectedItems.length > 0
    && selectedItems.every((item) => Number(item.totalFeeCount || item.raw?.totalFeeCount) >= 1);
  const showAllRemainingLabel = allSelectedHaveTotal
    && selectedItems.every((item) => maxPayableMonths(item.raw || item) === maxSharedMonths);

  useEffect(() => {
    if (!payOpen) return;
    setSelected((prev) => {
      const next = {};
      selectableKey.split('|').filter(Boolean).forEach((key) => {
        next[key] = prev[key] !== false;
      });
      return next;
    });
  }, [selectableKey, payOpen]);

  useEffect(() => {
    setMonths((prev) => Math.min(Math.max(1, prev), maxSharedMonths || 1));
  }, [maxSharedMonths]);

  const groupedUnpaid = useMemo(() => {
    if (!groupByChild) return [{ label: null, items: unpaidItems }];
    const map = new Map();
    unpaidItems.forEach((item) => {
      const key = String(item.studentId || 'child');
      if (!map.has(key)) map.set(key, { label: item.studentName || 'Child', items: [] });
      map.get(key).items.push(item);
    });
    return [...map.values()];
  }, [unpaidItems, groupByChild]);

  const historyRows = useMemo(() => {
    const paymentRows = (payments || []).map((payment) => ({
      ...payment,
      fromEnrollment: false,
    }));
    const extras = enrollmentRows
      .filter((row) => ['paid', 'completed'].includes(String(row.feeStatus)))
      .filter((row) => !paymentRows.some((payment) => paymentCoversEnrollment(payment, row)))
      .map((row) => ({
        _id: `enrollment:${row.id}`,
        enrollmentId: row.enrollmentId,
        fromEnrollment: true,
        courseName: row.courseName,
        studentName: row.studentName,
        amount: row.amount,
        currency: 'USD',
        displayStatus: row.feeStatus,
        status: row.feeStatus,
        createdAt: row.raw?.enrollmentDate || row.raw?.createdAt || row.dueDate,
        dueDate: row.dueDate,
      }));
    return groupPaymentHistory([...paymentRows, ...extras]);
  }, [payments, enrollmentRows]);

  const invoiceRows = historyRows.filter((row) => (row.invoiceButtons || []).length);

  const invoiceDownloadTargets = invoiceRows.flatMap((row) => row.invoiceButtons || []);

  const toggle = (item, checked) => {
    if (!canSelectFee(item)) return;
    setSelected((prev) => ({ ...prev, [itemKey(item)]: checked }));
  };

  const handlePay = async () => {
    const ids = selectedItems.map((item) => item.enrollmentId || item._id).filter(Boolean);
    if (!ids.length) return;
    try {
      if (method === 'bank') {
        await onPayBank({ enrollmentIds: ids, invoiceMode, file: proofFile, phone, months: payMonths });
        setProofFile(null);
        setPayOpen(false);
        return;
      }
      await onPayStripe({ enrollmentIds: ids, invoiceMode, months: payMonths });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Payment could not be completed',
        message: err?.message || 'Could not complete payment. Please try again.',
      });
    }
  };

  const handleToggleAutoPay = async (row) => {
    if (!onToggleAutoPay) return;
    try {
      await onToggleAutoPay({
        enrollmentIds: [row.enrollmentId],
        enabled: !row.autoPayEnabled,
      });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Auto-pay could not be updated',
        message: err?.message || 'Could not update auto-pay. Please try again.',
      });
    }
  };

  const cardGroups = savedCardsByStudent.length
    ? savedCardsByStudent
    : (savedCards.length ? [{ studentId: null, studentName: null, cards: savedCards }] : []);

  const handleDeleteCard = async (group, card) => {
    if (!onDeleteCard) return;
    const ok = await showConfirm({
      title: 'Remove this card?',
      message: `${savedCardLabel(card)} will be removed from Stripe too.${card.lastUsed ? ' Auto-pay will use another saved card.' : ''}`,
    });
    if (!ok) return;
    try {
      await onDeleteCard({
        paymentMethodId: card.id,
        studentId: group.studentId,
      });
    } catch (err) {
      await showAlert({
        type: 'error',
        title: 'Card could not be removed',
        message: err?.message || 'Could not remove this card. Please try again.',
      });
    }
  };

  const downloadInvoiceTarget = async (target) => {
    const payment = target?.payment || target;
    const label = target?.label || payment.courseName || payment.course?.title || 'invoice';
    const invoiceQuery = {};
    if (target?.scope) invoiceQuery.scope = target.scope;
    if (target?.courseId) invoiceQuery.courseId = target.courseId;
    if (target?.studentId) invoiceQuery.studentId = target.studentId;
    if (target?.courseName) invoiceQuery.courseName = target.courseName;
    setHistoryError('');
    setDownloadingKey(target?.key || payment._id);
    try {
      await onDownloadInvoice({
        ...payment,
        invoiceQuery: Object.keys(invoiceQuery).length ? invoiceQuery : payment.invoiceQuery,
      });
    } catch (err) {
      setHistoryError(err?.message || `Could not download ${label}.`);
      throw err;
    } finally {
      setDownloadingKey('');
    }
  };

  const handleDownloadInvoice = async (button) => {
    if (button?.multi) {
      setInvoicePicker(button);
      return;
    }
    try {
      await downloadInvoiceTarget(button?.separateTargets?.[0] || button);
    } catch {
      /* error already shown above the history table */
    }
  };

  const downloadCombinedFromPicker = async () => {
    if (!invoicePicker) return;
    const picker = invoicePicker;
    setInvoicePicker(null);
    try {
      await downloadInvoiceTarget({
        key: `${picker.key}-combined`,
        label: 'Combined invoice',
        payment: picker.payment,
        scope: 'combined',
      });
    } catch {
      /* error already shown above the history table */
    }
  };

  const downloadSeparateFromPicker = async () => {
    if (!invoicePicker) return;
    const targets = invoicePicker.separateTargets || [];
    setInvoicePicker(null);
    const failed = [];
    setHistoryError('');
    setDownloadingKey(invoicePicker.key);
    for (const target of targets) {
      try {
        await onDownloadInvoice({
          ...target.payment,
          invoiceQuery: {
            ...(target.courseId ? { courseId: target.courseId } : {}),
            ...(target.studentId ? { studentId: target.studentId } : {}),
            ...(target.courseName ? { courseName: target.courseName } : {}),
          },
        });
      } catch (err) {
        failed.push(`${target.label}: ${err?.message || 'download failed'}`);
      }
    }
    setDownloadingKey('');
    if (failed.length) {
      setHistoryError(
        failed.length === targets.length
          ? `Could not download invoices. ${failed.join(' | ')}`
          : `Some invoices did not download: ${failed.join(' | ')}`
      );
    }
  };

  const hasBankInfo = Boolean(
    bankDetails?.accountName || bankDetails?.bankName || bankDetails?.accountNumber || bankDetails?.iban
  );

  const downloadAllSeparate = async () => {
    if (!invoiceDownloadTargets.length) {
      setHistoryError('Invoices are available after a fee is received.');
      return;
    }
    const failed = [];
    setHistoryError('');
    setDownloadingKey('all');
    for (const target of invoiceDownloadTargets) {
      try {
        if (target.multi) {
          await onDownloadInvoice({
            ...target.payment,
            invoiceQuery: { scope: 'combined' },
          });
        } else {
          const single = target.separateTargets?.[0] || target;
          await onDownloadInvoice({
            ...single.payment,
            invoiceQuery: {
              ...(single.courseId ? { courseId: single.courseId } : {}),
              ...(single.studentId ? { studentId: single.studentId } : {}),
              ...(single.courseName ? { courseName: single.courseName } : {}),
            },
          });
        }
      } catch (err) {
        failed.push(`${target.label}: ${err?.message || 'download failed'}`);
      }
    }
    setDownloadingKey('');
    if (failed.length) {
      setHistoryError(
        failed.length === invoiceDownloadTargets.length
          ? `Could not download invoices. ${failed.join(' | ')}`
          : `Some invoices did not download: ${failed.join(' | ')}`
      );
    }
  };

  const downloadAllCombined = async () => {
    if (!invoiceDownloadTargets.length) {
      setHistoryError('Invoices are available after a fee is received.');
      return;
    }
    setHistoryError('');
    setDownloadingKey('all');
    try {
      await onDownloadInvoice({
        _id: 'statement',
        invoiceQuery: { scope: 'all-history' },
      });
    } catch (err) {
      setHistoryError(err?.message || 'Could not download the combined invoice.');
    } finally {
      setDownloadingKey('');
    }
  };

  const openDownloadAllPicker = () => {
    if (!invoiceDownloadTargets.length) {
      setHistoryError('Invoices are available after a fee is received.');
      return;
    }
    setHistoryError('');
    setDownloadAllPicker(true);
  };

  return (
    <>
      {notice ? <PortalAlert type="success">{notice}</PortalAlert> : null}

      <div className="portal-panel portal-billing-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Your courses</h2>
            <p>Fee status, due date, and a Pay button when a course still needs payment.</p>
          </div>
          {unpaidItems.length ? (
            <button type="button" className="portal-billing-pay" disabled={busy} onClick={() => openPayOverlay()}>
              Pay fees
            </button>
          ) : null}
        </div>
        <div className="portal-panel__body">
          <PortalDataSection loading={loading} error={error} loadingLabel="Loading your courses…">
            {enrollmentRows.length === 0 ? (
              <p className="portal-empty">{emptyEnrollmentsText}</p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--green">
                  <thead>
                    <tr>
                      {groupByChild ? <th>Child</th> : null}
                      <th>Course</th>
                      <th>Course status</th>
                      <th>Fee</th>
                      <th>Due date</th>
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
                              <div className="portal-billing-verify">Waiting for verification</div>
                            ) : null}
                            {row.autoPayEnabled ? (
                              <div className="portal-billing-sub">Auto-pay on</div>
                            ) : null}
                            {row.autoPayLastError ? (
                              <div className="portal-billing-decline-note">{row.autoPayLastError}</div>
                            ) : null}
                          </td>
                          <td>{formatDueDate(row.dueDate)}</td>
                          <td>{formatMoney(row.amount)}</td>
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
                              <span className="portal-billing-sub">All fees paid</span>
                            ) : String(row.enrollmentStatus || '').toLowerCase() === 'paused' ? (
                              <span className="portal-billing-sub">Paused</span>
                            ) : row.awaitingReview ? (
                              <span className="portal-billing-verify">Waiting for verification</span>
                            ) : row.noFee ? (
                              <span className="portal-billing-sub">No fee</span>
                            ) : (
                              <span className="portal-billing-sub">—</span>
                            )}
                            {onToggleAutoPay && !row.raw?.allFeesPaid && !row.noFee && String(row.enrollmentStatus || '').toLowerCase() !== 'paused' ? (
                              <button
                                type="button"
                                className="portal-billing-invoice-btn"
                                disabled={busy}
                                onClick={() => handleToggleAutoPay(row)}
                              >
                                {row.autoPayEnabled ? 'Turn off auto-pay' : 'Turn on auto-pay'}
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
              <h2>Saved cards</h2>
              <p>Cards Stripe saved from card payments. Auto-pay uses the last card that paid a fee. One card must stay saved.</p>
            </div>
          </div>
          <div className="portal-panel__body">
            {cardGroups.map((group) => (
              <div key={String(group.studentId || 'cards')} className="portal-billing-group">
                {group.studentName ? <h3>{group.studentName}</h3> : null}
                <ul className="portal-billing-lines">
                  {group.cards.map((card) => (
                    <li key={card.id}>
                      {savedCardLabel(card)}
                      {card.lastUsed ? ' · last used' : ''}
                      {onDeleteCard && group.cards.length > 1 ? (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="portal-billing-invoice-btn"
                            disabled={busy}
                            onClick={() => handleDeleteCard(group, card)}
                          >
                            Remove
                          </button>
                        </>
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
            <h2>Payment history</h2>
            <p>
              Click Invoice to download. Rows with more than one course let you choose a combined invoice or separate invoices.
            </p>
          </div>
          {invoiceDownloadTargets.length ? (
            <button type="button" className="portal-billing-download-all" onClick={openDownloadAllPicker} disabled={busy || Boolean(downloadingKey)}>
              {downloadingKey === 'all' ? 'Downloading…' : 'Download all invoices'}
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
        <PortalModal title="Pay course fees" tone={tone} kicker="Billing" onClose={() => {
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
                          <th>Due date</th>
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
                                {formatMoney(Number(item.amount || 0) * (checked ? payMonths : 1))}
                                {checked && payMonths > 1 ? (
                                  <div className="portal-billing-sub">
                                    {formatMoney(item.amount)} × {payMonths}
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
                  <legend>How many months?</legend>
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
                <legend>How would you like to pay?</legend>
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

              {method === 'bank' ? (
                <div className="portal-billing-bank">
                  <ol className="portal-billing-bank-steps">
                    <li>Transfer the fee using the bank details below.</li>
                    <li>Upload a screenshot or PDF of the transfer as proof.</li>
                    <li>The academy will check the proof and then contact you.</li>
                  </ol>
                  {hasBankInfo ? (
                    <ul>
                      {bankDetails.accountName ? <li>Account name: {bankDetails.accountName}</li> : null}
                      {bankDetails.bankName ? <li>Bank: {bankDetails.bankName}</li> : null}
                      {bankDetails.accountNumber ? <li>Account number: {bankDetails.accountNumber}</li> : null}
                      {bankDetails.iban ? <li>IBAN: {bankDetails.iban}</li> : null}
                      {bankDetails.swift ? <li>SWIFT: {bankDetails.swift}</li> : null}
                      {bankDetails.extraNote ? <li>{bankDetails.extraNote}</li> : null}
                    </ul>
                  ) : (
                    <p>Bank details are not listed yet. Please pay by card or contact the academy.</p>
                  )}
                  <label>
                    <span>Phone (8–15 digits) <RequiredMark /></span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp number" />
                  </label>
                  <label>
                    Transfer proof
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              ) : null}

              <div className="portal-billing-overlay-footer">
                <div>
                  <strong>{formatMoney(selectedTotal)}</strong>
                  {payMonths > 1 ? (
                    <div className="portal-billing-sub">{payMonths} months</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="portal-billing-pay"
                  disabled={busy || !selectedItems.length || maxSharedMonths < 1 || (method === 'bank' && (!proofFile || !hasBankInfo || phone.replace(/\D/g, '').length < 8))}
                  onClick={handlePay}
                >
                  {busy ? 'Please wait…' : method === 'bank' ? 'Submit payment proof' : 'Pay now'}
                </button>
              </div>
            </div>
          )}
        </PortalModal>
      ) : null}

      {invoicePicker ? (
        <PortalModal title="Download invoice" tone={tone} kicker="Invoice" onClose={() => !downloadingKey && setInvoicePicker(null)}>
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
        <PortalModal title="Download all invoices" tone={tone} kicker="Invoices" onClose={() => !downloadingKey && setDownloadAllPicker(false)}>
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
};

export { triggerBlobDownload };
export default PortalBillingCheckout;
