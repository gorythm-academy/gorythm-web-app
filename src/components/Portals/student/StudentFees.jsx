import React, { useCallback, useEffect, useState } from 'react';
import { invalidatePortalCache, portalGet, portalGetBlob, portalPost, portalPostForm, readPortalCache } from '../shared/portalApi';
import { PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { StudentIdLine } from '../shared/StudentIdentity';
import PortalBillingCheckout, { triggerBlobDownload } from '../shared/PortalBillingCheckout';

const StudentFees = () => {
  const [data, setData] = useState(() => readPortalCache('/student/fees'));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => !readPortalCache('/student/fees'));

  const load = useCallback((fresh = false) => {
    if (fresh) {
      invalidatePortalCache('/student/fees');
      invalidatePortalCache('/student/dashboard');
    }
    if (!readPortalCache('/student/fees')) setLoading(true);
    return portalGet('/student/fees')
      .then((res) => {
        if (res.success) {
          setData(res);
          setError('');
        } else setError(res.error || 'Could not load fees. Please try again.');
      })
      .catch((err) => setError(err.message || 'Could not load fees. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autopay') === 'saved') {
      setNotice('Card saved. Auto-pay is on for the selected course(s).');
      params.delete('autopay');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', nextUrl);
    }
  }, []);

  const downloadPdf = async (payment) => {
    const rawId = String(payment._id || payment.id || '');
    const enrollmentId = payment.fromEnrollment || rawId.startsWith('enrollment:')
      ? (payment.enrollmentId || rawId.replace(/^enrollment:/, ''))
      : null;
    const paymentId = enrollmentId ? null : rawId;
    const query = new URLSearchParams({ kind: 'invoice' });
    if (payment.invoiceQuery?.scope) query.set('scope', payment.invoiceQuery.scope);
    if (payment.invoiceQuery?.courseId && !String(payment.invoiceQuery.courseId).includes('[object')) {
      query.set('courseId', payment.invoiceQuery.courseId);
    }
    if (payment.invoiceQuery?.studentId && !String(payment.invoiceQuery.studentId).includes('[object')) {
      query.set('studentId', payment.invoiceQuery.studentId);
    }
    if (payment.invoiceQuery?.courseName) query.set('courseName', payment.invoiceQuery.courseName);
    if (payment.invoiceQuery?.scope === 'all-history') {
      const blob = await portalGetBlob(`/student/billing/statement?${query.toString()}`);
      triggerBlobDownload(blob, 'invoice_all.pdf');
      return;
    }
    if (!enrollmentId && !paymentId) {
      throw new Error('Payment not found');
    }
    const blob = enrollmentId
      ? await portalGetBlob(`/student/enrollments/${enrollmentId}/invoice?${query.toString()}`)
      : await portalGetBlob(`/student/payments/${paymentId}/invoice?${query.toString()}`);
    const name = String(payment.invoiceNumber || payment.transactionId || enrollmentId || paymentId)
      .replace(/[^a-zA-Z0-9-_]/g, '_');
    const coursePart = String(payment.invoiceQuery?.courseName || '').replace(/[^a-zA-Z0-9-_]/g, '_');
    triggerBlobDownload(blob, `invoice_${name}${coursePart ? `_${coursePart}` : ''}.pdf`);
  };

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="Fees"
        subtitle="Your courses, unpaid fees, and invoices after payment is received."
      />
      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-file-invoice-dollar" />
        </div>
        <div>
          <h2>Course fees</h2>
          {data?.student ? <StudentIdLine studentId={data.student.studentId} /> : null}
          <p>Review your courses here, then pay unpaid fees by card or bank transfer.</p>
        </div>
      </div>
      {error ? <PortalAlert type="error">{error}</PortalAlert> : null}
      <PortalBillingCheckout
        enrollments={data?.enrollments || []}
        payable={data?.payable || []}
        payments={data?.payments || []}
        bankDetails={data?.bankDetails}
        savedCards={data?.savedCards || []}
        loading={loading}
        busy={busy}
        notice={notice}
        tone="student"
        emptyEnrollmentsText="No courses are listed on your account yet. When the academy adds a course, it will appear here."
        emptyHistoryText="Paid invoices will appear here after a fee is received."
        onPayStripe={async ({ enrollmentIds, invoiceMode, months, autoPay }) => {
          setBusy(true);
          setNotice('');
          try {
            const res = await portalPost('/student/fees/checkout', { enrollmentIds, invoiceMode, months, autoPay: Boolean(autoPay) });
            if (!res.success || !res.url) throw new Error(res.error || 'Could not start card payment');
            window.location.href = res.url;
          } catch (err) {
            setBusy(false);
            throw err;
          }
        }}
        onPayBank={async ({ enrollmentIds, invoiceMode, file, phone, months }) => {
          setBusy(true);
          setNotice('');
          try {
            const form = new FormData();
            form.append('enrollmentIds', JSON.stringify(enrollmentIds));
            form.append('invoiceMode', invoiceMode);
            form.append('months', String(months || 1));
            form.append('phone', phone || '');
            form.append('file', file);
            const res = await portalPostForm('/student/fees/bank', form);
            if (!res.success) throw new Error(res.error || 'Could not submit bank payment proof');
            setNotice(res.message || 'Payment proof received. The academy will contact you after checking it.');
            await load(true);
          } catch (err) {
            throw err;
          } finally {
            setBusy(false);
          }
        }}
        onDownloadInvoice={downloadPdf}
        onToggleAutoPay={async ({ enrollmentIds, enabled }) => {
          setBusy(true);
          setNotice('');
          try {
            const res = await portalPost('/student/fees/autopay', { enrollmentIds, enabled });
            if (!res.success) throw new Error(res.error || 'Could not update auto-pay');
            if (res.url) {
              window.location.href = res.url;
              return;
            }
            setNotice(enabled ? 'Auto-pay is on for this course.' : 'Auto-pay is off for this course.');
            await load(true);
          } catch (err) {
            throw err;
          } finally {
            setBusy(false);
          }
        }}
        onDeleteCard={async ({ paymentMethodId }) => {
          setBusy(true);
          setNotice('');
          try {
            const res = await portalPost('/student/fees/cards/delete', { paymentMethodId });
            if (!res.success) throw new Error(res.error || 'Could not remove this card');
            setNotice('Card removed.');
            await load(true);
          } catch (err) {
            throw err;
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
};

export default StudentFees;
