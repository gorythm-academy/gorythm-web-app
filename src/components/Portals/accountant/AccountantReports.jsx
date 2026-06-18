import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { portalGet, payrollGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { drawPdfTable } from '../../../utils/pdfTable';

const formatMonth = (monthKey) => {
  const [y, m] = String(monthKey || '').split('-');
  if (!y || !m) return monthKey || '—';
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const AccountantReports = () => {
  const [payments, setPayments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([portalGet('/accountant/payments'), payrollGet('/runs')])
      .then(([pRes, rRes]) => {
        if (pRes.success) setPayments(pRes.payments || []);
        setRuns(rRes.runs || []);
      })
      .catch((err) => setLoadError(err.message || 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

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
    const safeName = studentName.replace(/[^\w\-]+/g, '-').slice(0, 40);
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
    const safeName = teacherName.replace(/[^\w\-]+/g, '-').slice(0, 40);
    doc.save(`payroll-${safeName}-${r.monthKey || 'month'}.pdf`);
  };

  const exportPaymentsPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    drawPdfTable(doc, {
      title: 'Gorythm — Student payments report',
      subtitle:
        'Each row is one student course payment. Amount is in USD. Status may be paid, pending, failed, or refunded.',
      headers: ['Student', 'Course', 'Amount (USD)', 'Status', 'Payment method', 'Record date'],
      rows: payments.map((p) => [
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
      rows: runs.map((r) => [
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

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader title="Reports" subtitle="Structured financial summaries with export to PDF" />

      {loadError ? <PortalAlert variant="error">{loadError}</PortalAlert> : null}

      <div className="portal-hero portal-hero--accountant">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-file-alt" />
        </div>
        <div>
          <h2>Financial reports</h2>
          <p>Review student payment and teacher payroll data in full tables, then export PDF summaries.</p>
        </div>
      </div>

      <section className="portal-report-block">
        <div className="portal-report-block__intro">
          <h2>Student payments report</h2>
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
            <h3>Payments data — {payments.length} row{payments.length === 1 ? '' : 's'}</h3>
          </div>
          <div className="portal-panel__body">
            {payments.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                No payment records to report.
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
                      <th>Payment method</th>
                      <th>Record date</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
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
          <h2>Teacher payroll report</h2>
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
            <h3>Payroll data — {runs.length} row{runs.length === 1 ? '' : 's'}</h3>
          </div>
          <div className="portal-panel__body">
            {runs.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                No payroll runs to report.
              </p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--orange">
                  <thead>
                    <tr>
                      <th>Teacher</th>
                      <th>Payroll month</th>
                      <th>Monthly salary</th>
                      <th>Deduction</th>
                      <th>Final salary</th>
                      <th>Status</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
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
    </div>
  );
};

export default AccountantReports;
