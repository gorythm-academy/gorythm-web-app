import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { portalGet, payrollGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';

const AccountantReports = () => {
  const [payments, setPayments] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([portalGet('/accountant/payments'), payrollGet('/runs')])
      .then(([pRes, rRes]) => {
        if (pRes.success) setPayments(pRes.payments || []);
        setRuns(rRes.runs || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const exportPaymentsPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Gorythm — Payments report', 14, 16);
    let y = 28;
    payments.slice(0, 40).forEach((p) => {
      const line = `${p.studentName || p.user?.name || '—'} | ${p.courseName || p.course?.title || '—'} | $${p.amount} | ${p.status}`;
      doc.text(line.slice(0, 90), 14, y);
      y += 8;
      if (y > 270) return;
    });
    doc.save('payments-report.pdf');
  };

  const exportPayrollPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Gorythm — Payroll report', 14, 16);
    let y = 28;
    runs.forEach((r) => {
      const line = `${r.teacher?.name || 'Teacher'} | ${r.monthKey} | Final: ${Number(r.finalSalary).toFixed(2)}`;
      doc.text(line.slice(0, 90), 14, y);
      y += 8;
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
      <PortalPageHeader title="Reports" subtitle="Export PDF summaries" />
      <div className="portal-grid">
        <div className="portal-card">
          <h3>Payments</h3>
          <p>{payments.length} records</p>
          <button type="button" onClick={exportPaymentsPdf}>
            Download payments PDF
          </button>
        </div>
        <div className="portal-card">
          <h3>Payroll</h3>
          <p>{runs.length} runs</p>
          <button type="button" onClick={exportPayrollPdf}>
            Download payroll PDF
          </button>
        </div>
      </div>
      <PortalAlert type="info">
        Full invoices can be extended later; this exports summary lists from live data.
      </PortalAlert>
    </div>
  );
};

export default AccountantReports;
