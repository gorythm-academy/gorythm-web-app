import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { portalGet, payrollGet } from '../shared/portalApi';
import { PortalDataSection, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { drawPdfTable } from '../../../utils/pdfTable';

const PAGE_SIZE = 15;

const formatMonth = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '—';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

function ReportTableTools({ search, onSearch, searchPlaceholder, status, onStatus, statusOptions, page, pageCount, onPage, total }) {
  return (
    <div className="portal-report-block__tools">
      <input
        type="search"
        className="portal-report-search"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      {statusOptions.length > 0 ? (
        <select className="portal-report-status-select" value={status} onChange={(e) => onStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : null}
      {pageCount > 1 ? (
        <div className="portal-report-pagination">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <i className="fas fa-chevron-left" />
          </button>
          <span>
            Page {page} of {pageCount} · {total} row{total === 1 ? '' : 's'}
          </span>
          <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

const AccountantReports = () => {
  const [payments, setPayments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('all');
  const [paymentPage, setPaymentPage] = useState(1);
  const [payrollSearch, setPayrollSearch] = useState('');
  const [payrollStatus, setPayrollStatus] = useState('all');
  const [payrollPage, setPayrollPage] = useState(1);

  useEffect(() => {
    Promise.all([portalGet('/accountant/payments'), payrollGet('/runs')])
      .then(([pRes, rRes]) => {
        if (pRes.success) setPayments(pRes.payments || []);
        else setLoadError(pRes.error || 'Failed to load student payments');
        if (rRes.success) setRuns(rRes.runs || []);
        else setLoadError((prev) => prev || rRes.error || 'Failed to load payroll runs');
      })
      .catch((err) => setLoadError(err.message || 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

  const paymentStatusOptions = useMemo(
    () => Array.from(new Set(payments.map((p) => p.status).filter(Boolean))).sort(),
    [payments]
  );
  const payrollStatusOptions = useMemo(
    () => Array.from(new Set(runs.map((r) => r.status).filter(Boolean))).sort(),
    [runs]
  );

  const filteredPayments = useMemo(() => {
    const term = paymentSearch.trim().toLowerCase();
    return payments.filter((p) => {
      if (paymentStatus !== 'all' && p.status !== paymentStatus) return false;
      if (!term) return true;
      const haystack = `${p.studentName || p.user?.name || ''} ${p.courseName || p.course?.title || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [payments, paymentSearch, paymentStatus]);

  const filteredRuns = useMemo(() => {
    const term = payrollSearch.trim().toLowerCase();
    return runs.filter((r) => {
      if (payrollStatus !== 'all' && r.status !== payrollStatus) return false;
      if (!term) return true;
      const haystack = `${r.teacher?.name || r.teacherName || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [runs, payrollSearch, payrollStatus]);

  const paymentPageCount = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const payrollPageCount = Math.max(1, Math.ceil(filteredRuns.length / PAGE_SIZE));
  const safePaymentPage = Math.min(paymentPage, paymentPageCount);
  const safePayrollPage = Math.min(payrollPage, payrollPageCount);
  const pagedPayments = filteredPayments.slice(
    (safePaymentPage - 1) * PAGE_SIZE,
    safePaymentPage * PAGE_SIZE
  );
  const pagedRuns = filteredRuns.slice((safePayrollPage - 1) * PAGE_SIZE, safePayrollPage * PAGE_SIZE);

  useEffect(() => {
    setPaymentPage(1);
  }, [paymentSearch, paymentStatus]);

  useEffect(() => {
    setPayrollPage(1);
  }, [payrollSearch, payrollStatus]);

  const exportPaymentRowPdf = (p) => {
    const studentName = p.studentName || p.user?.name || 'Student';
    const doc = new jsPDF();
    drawPdfTable(doc, {
      title: `Gorythm — Student payment`,
      subtitle: `Individual payment record for ${studentName}.`,
      headers: ['Student', 'Course', 'Amount (USD)', 'Status', 'Payment method', 'Record date'],
      rows: [[
        studentName,
        p.courseName || p.course?.title || '—',
        `$${Number(p.amount || 0).toFixed(2)}`,
        p.status || '—',
        p.paymentMethod || '—',
        p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—',
      ]],
    });
    const safeName = studentName.replace(/[^\w-]+/g, '-').slice(0, 40);
    doc.save(`payment-${safeName}.pdf`);
  };

  const exportPayrollRowPdf = (r) => {
    const teacherName = r.teacher?.name || r.teacherName || 'Teacher';
    const doc = new jsPDF();
    drawPdfTable(doc, {
      title: `Gorythm — Teacher payroll`,
      subtitle: `Payroll run for ${teacherName} — ${formatMonth(r.monthKey)}.`,
      headers: ['Teacher', 'Payroll month', 'Monthly salary', 'Deduction', 'Final salary', 'Status'],
      rows: [[
        teacherName,
        formatMonth(r.monthKey),
        `$${Number(r.monthlySalary || 0).toFixed(2)}`,
        `$${Number(r.deduction || 0).toFixed(2)}`,
        `$${Number(r.finalSalary || 0).toFixed(2)}`,
        r.status || '—',
      ]],
    });
    const safeName = teacherName.replace(/[^\w-]+/g, '-').slice(0, 40);
    doc.save(`payroll-${safeName}-${r.monthKey || 'month'}.pdf`);
  };

  const exportPaymentsPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    drawPdfTable(doc, {
      title: 'Gorythm — Student payments report',
      subtitle:
        'Each row is one student course payment. Amount is in USD. Status may be paid, pending, failed, or refunded.',
      headers: ['Student', 'Course', 'Amount (USD)', 'Status', 'Payment method', 'Record date'],
      rows: filteredPayments.map((p) => [
        p.studentName || p.user?.name || '—',
        p.courseName || p.course?.title || '—',
        `$${Number(p.amount || 0).toFixed(2)}`,
        p.status || '—',
        p.paymentMethod || '—',
        p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—',
      ]),
    });
    doc.save('payments-report.pdf');
  };

  const exportPayrollPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    drawPdfTable(doc, {
      title: 'Gorythm — Teacher payroll report',
      subtitle:
        'Monthly payroll runs per teacher. Monthly salary is before deductions. Final salary is the amount to pay.',
      headers: ['Teacher', 'Payroll month', 'Monthly salary', 'Deduction', 'Final salary', 'Status'],
      rows: filteredRuns.map((r) => [
        r.teacher?.name || '—',
        formatMonth(r.monthKey),
        `$${Number(r.monthlySalary || 0).toFixed(2)}`,
        `$${Number(r.deduction || 0).toFixed(2)}`,
        `$${Number(r.finalSalary || 0).toFixed(2)}`,
        r.status || '—',
      ]),
    });
    doc.save('payroll-report.pdf');
  };

  return (
    <div className="portal-page">
      <PortalPageHeader title="Reports" subtitle="Structured financial summaries with export to PDF" />

      <div className="portal-hero portal-hero--accountant">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-file-alt" />
        </div>
        <div>
          <h2>Financial Reports</h2>
          <p>Review student payment and teacher payroll data in full tables, then export PDF summaries.</p>
        </div>
      </div>

      <PortalDataSection loading={loading} error={loadError} loadingLabel="Loading reports…">
      <section className="portal-report-block">
        <div className="portal-report-block__intro">
          <h2>Student Payments Report</h2>
          <p>
            Lists every recorded student course payment. <strong>Student</strong> is the payer name.{' '}
            <strong>Course</strong> is the enrolled program. <strong>Amount</strong> is the payment value in USD.{' '}
            <strong>Status</strong> shows paid, pending, failed, or refunded. <strong>Method</strong> is how the
            payment was made. <strong>Date</strong> is when the record was created.
          </p>
        </div>
        <div className="portal-report-block__actions">
          <button type="button" onClick={exportPaymentsPdf}>
            Download payments PDF
          </button>
        </div>
        <div className="portal-panel">
          <div className="portal-panel__head">
            <h3>Payments Data — {filteredPayments.length} row{filteredPayments.length === 1 ? '' : 's'}</h3>
          </div>
          <ReportTableTools
            search={paymentSearch}
            onSearch={setPaymentSearch}
            searchPlaceholder="Search by student or course…"
            status={paymentStatus}
            onStatus={setPaymentStatus}
            statusOptions={paymentStatusOptions}
            page={safePaymentPage}
            pageCount={paymentPageCount}
            onPage={setPaymentPage}
            total={filteredPayments.length}
          />
          <div className="portal-panel__body">
            {filteredPayments.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                No payment records match this filter.
              </p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--orange">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Amount (USD)</th>
                      <th>Status</th>
                      <th>Payment Method</th>
                      <th>Record Date</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPayments.map((p) => (
                      <tr key={p._id}>
                        <td>
                          <strong>{p.studentName || p.user?.name || '—'}</strong>
                        </td>
                        <td>{p.courseName || p.course?.title || '—'}</td>
                        <td>${Number(p.amount || 0).toFixed(2)}</td>
                        <td>{p.status || '—'}</td>
                        <td>{p.paymentMethod || '—'}</td>
                        <td>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}</td>
                        <td>
                          <button type="button" className="portal-report-row-dl" onClick={() => exportPaymentRowPdf(p)}>
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="portal-report-block">
        <div className="portal-report-block__intro">
          <h2>Teacher Payroll Report</h2>
          <p>
            Monthly payroll runs for instructors. <strong>Teacher</strong> is the staff member.{' '}
            <strong>Month</strong> is the payroll period. <strong>Monthly salary</strong> is the base amount before
            deductions. <strong>Deduction</strong> covers absences or adjustments. <strong>Final salary</strong> is
            the amount to pay. <strong>Status</strong> shows draft, pending review, or paid.
          </p>
        </div>
        <div className="portal-report-block__actions">
          <button type="button" onClick={exportPayrollPdf}>
            Download payroll PDF
          </button>
        </div>
        <div className="portal-panel">
          <div className="portal-panel__head">
            <h3>Payroll Data — {filteredRuns.length} row{filteredRuns.length === 1 ? '' : 's'}</h3>
          </div>
          <ReportTableTools
            search={payrollSearch}
            onSearch={setPayrollSearch}
            searchPlaceholder="Search by teacher…"
            status={payrollStatus}
            onStatus={setPayrollStatus}
            statusOptions={payrollStatusOptions}
            page={safePayrollPage}
            pageCount={payrollPageCount}
            onPage={setPayrollPage}
            total={filteredRuns.length}
          />
          <div className="portal-panel__body">
            {filteredRuns.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                No payroll runs match this filter.
              </p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--orange">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Payroll Month</th>
                      <th>Monthly Salary</th>
                      <th>Deduction</th>
                      <th>Final Salary</th>
                      <th>Status</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRuns.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <strong>{r.teacher?.name || '—'}</strong>
                        </td>
                        <td>{formatMonth(r.monthKey)}</td>
                        <td>${Number(r.monthlySalary || 0).toFixed(2)}</td>
                        <td>${Number(r.deduction || 0).toFixed(2)}</td>
                        <td>${Number(r.finalSalary || 0).toFixed(2)}</td>
                        <td>{r.status || '—'}</td>
                        <td>
                          <button type="button" className="portal-report-row-dl" onClick={() => exportPayrollRowPdf(r)}>
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <PortalAlert type="info">
        PDF exports use the same column layout as the tables above, with titled headers and grid rows.
      </PortalAlert>
      </PortalDataSection>
    </div>
  );
};

export default AccountantReports;
