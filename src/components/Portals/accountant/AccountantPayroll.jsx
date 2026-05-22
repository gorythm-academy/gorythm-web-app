import React, { useEffect, useState } from 'react';
import { payrollGet, payrollPost, currentMonthKey } from '../shared/portalApi';
import { PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';

const AccountantPayroll = () => {
  const [teachers, setTeachers] = useState([]);
  const [runs, setRuns] = useState([]);
  const [salaryForm, setSalaryForm] = useState({ teacherId: '', monthlySalary: '', workingDays: 26 });
  const [attendanceForm, setAttendanceForm] = useState({
    teacherId: '',
    monthKey: currentMonthKey(),
    presentDays: 0,
    leaveDays: 0,
  });
  const [runForm, setRunForm] = useState({ teacherId: '', monthKey: currentMonthKey() });
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const loadRuns = () => {
    payrollGet('/runs')
      .then((res) => setRuns(res.runs || []))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    payrollGet('/teachers')
      .then((res) => setTeachers(res.teachers || []))
      .catch((err) => setError(err.message));
    loadRuns();
  }, []);

  const loadPreview = async (teacherId, monthKey) => {
    if (!teacherId || !monthKey) {
      setPreview(null);
      return;
    }
    try {
      const res = await payrollGet(
        `/preview?teacherId=${encodeURIComponent(teacherId)}&monthKey=${encodeURIComponent(monthKey)}`
      );
      if (res.success) setPreview(res.preview);
    } catch {
      setPreview(null);
    }
  };

  useEffect(() => {
    if (runForm.teacherId && runForm.monthKey) {
      loadPreview(runForm.teacherId, runForm.monthKey);
    }
  }, [runForm.teacherId, runForm.monthKey]);

  const saveSalary = async (e) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      const res = await payrollPost('/salary-profile', {
        ...salaryForm,
        monthlySalary: Number(salaryForm.monthlySalary),
        workingDays: Number(salaryForm.workingDays),
      });
      setMsg(res.success ? 'Salary profile saved.' : res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const saveAttendance = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const res = await payrollPost('/attendance', {
        ...attendanceForm,
        presentDays: Number(attendanceForm.presentDays),
        leaveDays: Number(attendanceForm.leaveDays),
      });
      setMsg(res.success ? 'Attendance saved (or use approved teacher submission).' : res.error || 'Failed');
      if (runForm.teacherId === attendanceForm.teacherId) {
        loadPreview(runForm.teacherId, runForm.monthKey);
      }
    } catch (err) {
      setMsg(err.message);
    }
  };

  const runPayroll = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const res = await payrollPost('/run', runForm);
      if (res.success) {
        setMsg(
          `Payroll generated: $${Number(res.calculation?.finalSalary ?? res.payroll?.finalSalary).toFixed(2)} (deduction $${Number(res.calculation?.deduction ?? 0).toFixed(2)}, source: ${res.calculation?.attendanceSource || 'n/a'})`
        );
        loadRuns();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="Payroll"
        subtitle="Salary is based on monthly rate, working days, and attendance (approved teacher submission or manual entry)"
      />
      {error ? <PortalAlert type="error">{error}</PortalAlert> : null}
      <div className="portal-grid">
        <form className="portal-card portal-form-card" onSubmit={saveSalary}>
          <h3>Salary profile</h3>
          <select
            value={salaryForm.teacherId}
            onChange={(e) => setSalaryForm({ ...salaryForm, teacherId: e.target.value })}
            required
          >
            <option value="">Teacher</option>
            {teachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Monthly salary"
            value={salaryForm.monthlySalary}
            onChange={(e) => setSalaryForm({ ...salaryForm, monthlySalary: e.target.value })}
            required
          />
          <input
            type="number"
            placeholder="Working days per month"
            value={salaryForm.workingDays}
            onChange={(e) => setSalaryForm({ ...salaryForm, workingDays: e.target.value })}
          />
          <button type="submit">Save profile</button>
        </form>
        <form className="portal-card portal-form-card" onSubmit={saveAttendance}>
          <h3>Teacher attendance (manual)</h3>
          <select
            value={attendanceForm.teacherId}
            onChange={(e) => setAttendanceForm({ ...attendanceForm, teacherId: e.target.value })}
            required
          >
            <option value="">Teacher</option>
            {teachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="portal-field-label">
            Month
            <input
              type="month"
              value={attendanceForm.monthKey}
              onChange={(e) => setAttendanceForm({ ...attendanceForm, monthKey: e.target.value })}
              required
            />
          </label>
          <input
            type="number"
            min="0"
            placeholder="Present days"
            value={attendanceForm.presentDays}
            onChange={(e) => setAttendanceForm({ ...attendanceForm, presentDays: e.target.value })}
          />
          <input
            type="number"
            min="0"
            placeholder="Leave days"
            value={attendanceForm.leaveDays}
            onChange={(e) => setAttendanceForm({ ...attendanceForm, leaveDays: e.target.value })}
          />
          <button type="submit">Save attendance</button>
        </form>
        <form className="portal-card portal-form-card" onSubmit={runPayroll}>
          <h3>Generate monthly payroll</h3>
          <select
            value={runForm.teacherId}
            onChange={(e) => setRunForm({ ...runForm, teacherId: e.target.value })}
            required
          >
            <option value="">Teacher</option>
            {teachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="portal-field-label">
            Month
            <input
              type="month"
              value={runForm.monthKey}
              onChange={(e) => setRunForm({ ...runForm, monthKey: e.target.value })}
              required
            />
          </label>
          {preview ? (
            <div className="portal-payroll-preview">
              <p>
                <strong>Preview</strong> (attendance: {preview.attendanceSource})
              </p>
              <p>Present: {preview.presentDays} / {preview.workingDays} working days</p>
              <p>
                Absent (deduct): {preview.absentDays ?? 0} · Holiday: {preview.holidayDays ?? 0} · Weekend:{' '}
                {preview.weekendDays ?? 0}
              </p>
              <p>Report absent (incl. holiday/weekend): {preview.reportAbsentDays ?? 0}</p>
              <p>Leave: {preview.leaveDays} · Deduction days: {preview.deductionDays} (holiday/weekend excluded)</p>
              <p>
                Deduction: ${preview.deduction?.toFixed(2)} → <strong>Final: ${preview.finalSalary?.toFixed(2)}</strong>
              </p>
            </div>
          ) : null}
          <button type="submit">Generate salary slip</button>
        </form>
      </div>
      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}
      <h3 style={{ marginTop: '1rem' }}>Payroll runs</h3>
      <SimpleTable
        columns={[
          { key: 'teacher', label: 'Teacher', render: (r) => r.teacher?.name || '—' },
          { key: 'month', label: 'Month', render: (r) => r.monthKey },
          { key: 'present', label: 'Present', render: (r) => r.presentDays },
          { key: 'deduction', label: 'Deduction', render: (r) => `$${Number(r.deduction || 0).toFixed(2)}` },
          { key: 'final', label: 'Final salary', render: (r) => `$${Number(r.finalSalary || 0).toFixed(2)}` },
        ]}
        rows={runs}
        emptyLabel="No payroll runs yet."
      />
    </div>
  );
};

export default AccountantPayroll;
