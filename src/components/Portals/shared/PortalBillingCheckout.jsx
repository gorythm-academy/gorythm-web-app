import { useEffect, useMemo, useState } from 'react';
import { usePortalDialog } from './PortalDialogContext';
import { canDownloadInvoice, canSelectFee, maxPayableMonths, resolveFeeDueDate, savedCardLabel, sharedMaxPayableMonths, triggerBlobDownload } from '../../../utils/billingLabels';
import { normalizeEnrollmentStatus } from '../../../utils/studentAdminValidation';
import { PortalBillingCheckoutView } from './PortalBillingCheckoutView';

/** What is charged for `months` installments, after money the academy already received toward this fee. */
function payableForMonths(item, months) {
  const monthly = Number(item.amount || 0);
  const total = monthly * months;
  const credit = Math.min(Math.max(0, Number(item.partialPaidAmount || 0)), total);
  return Math.round((total - credit) * 100) / 100;
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
  const payCourseName = String(payment.course?.title || payment.courseName || '').trim().toLowerCase();
  if (payUser && studentId && payUser === studentId && payCourse && courseId && payCourse === courseId) {
    return true;
  }
  if (payUser && studentId && payUser === studentId && courseName && payCourseName === courseName) {
    return true;
  }
  return Boolean(
    email
    && String(payment.email || '').toLowerCase() === email
    && (
      (payCourse && courseId && payCourse === courseId)
      || (courseName && payCourseName === courseName)
    )
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
    studentEmail: item.studentEmail || item.student?.personalEmail || item.student?.email || '',
    courseId: item.courseId || item.course?._id || '',
    courseName: item.courseName || item.course?.title || '—',
    courseCategory: item.courseCategory || item.course?.category || '—',
    enrollmentStatus: normalizeEnrollmentStatus(item.enrollmentStatus || item.status || 'active'),
    feeStatus: item.allFeesPaid ? 'paid' : feeStatus,
    feeProgress: item.feeProgress || '',
    dueDate: resolveFeeDueDate(item),
    amount,
    partialPaidAmount: Math.max(0, Number(item.partialPaidAmount || 0)),
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
  const [saveCardForAutoPay, setSaveCardForAutoPay] = useState(true);
  const [proofFile, setProofFile] = useState(null);
  const [phone, setPhone] = useState('');
  const [phoneStatus, setPhoneStatus] = useState('empty');
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
  const selectedTotal = selectedItems.reduce((sum, item) => sum + payableForMonths(item, payMonths), 0);
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
        currency: 'EUR',
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
      await onPayStripe({
        enrollmentIds: ids,
        invoiceMode,
        months: payMonths,
        autoPay: saveCardForAutoPay,
      });
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
    const onlyCard = (group.cards || []).length <= 1;
    const ok = await showConfirm({
      title: 'Remove this card?',
      message: onlyCard
        ? `${savedCardLabel(card)} is the last saved card. Removing it turns automatic monthly charges off.`
        : `${savedCardLabel(card)} will be removed from Stripe too.${card.lastUsed ? ' Auto-pay will use another saved card.' : ''}`,
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
        <PortalBillingCheckoutView
            state={{
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
            }}
        />
    );
};

export { triggerBlobDownload };
export default PortalBillingCheckout;
