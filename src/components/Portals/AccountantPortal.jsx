import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../utils/authStorage';
import './PortalLayout.scss';

const AccountantPortal = () => {
  const [summary, setSummary] = useState({ payments: 0, completed: 0, pending: 0, refunded: 0 });
  const [teachers, setTeachers] = useState([]);
  const [salaryForm, setSalaryForm] = useState({ teacherId: '', monthlySalary: '', workingDays: 26 });
  const [attendanceForm, setAttendanceForm] = useState({ teacherId: '', monthKey: '', presentDays: 0, leaveDays: 0 });
  const [runForm, setRunForm] = useState({ teacherId: '', monthKey: '' });
  const [runs, setRuns] = useState([]);
  const [msg, setMsg] = useState('');
  const token = getAuthToken();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [payRes, teachersRes, runsRes] = await Promise.all([
          axios.get('http://localhost:5000/api/payments', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('http://localhost:5000/api/payroll/teachers', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('http://localhost:5000/api/payroll/runs', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const payments = payRes.data?.payments || [];
        setTeachers(teachersRes.data?.teachers || []);
        setRuns(runsRes.data?.runs || []);
        setSummary({
          payments: payments.length,
          completed: payments.filter((p) => p.status === 'completed').length,
          pending: payments.filter((p) => p.status === 'pending').length,
          refunded: payments.filter((p) => p.status === 'refunded').length,
        });
      } catch (error) {
        setSummary({ payments: 0, completed: 0, pending: 0, refunded: 0 });
      }
    };
    fetchData();
  }, [token]);

  const saveSalaryProfile = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await axios.post('http://localhost:5000/api/payroll/salary-profile', salaryForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg('Teacher salary profile saved.');
    } catch {
      setMsg('Failed to save salary profile.');
    }
  };

  const saveAttendance = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await axios.post('http://localhost:5000/api/payroll/attendance', attendanceForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg('Teacher attendance saved.');
    } catch {
      setMsg('Failed to save attendance.');
    }
  };

  const runPayroll = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await axios.post('http://localhost:5000/api/payroll/run', runForm, {
          headers: { Authorization: `Bearer ${token}` },
        });
      const runsRes = await axios.get('http://localhost:5000/api/payroll/runs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRuns(runsRes.data?.runs || []);
      setMsg('Payroll generated successfully.');
    } catch {
      setMsg('Failed to generate payroll.');
    }
  };

  return (
    <div className="portal-page">
      <h1>Accountant Portal</h1>
      <div className="portal-grid">
        <div className="portal-card">Total Payments: {summary.payments}</div>
        <div className="portal-card">Completed: {summary.completed}</div>
        <div className="portal-card">Pending: {summary.pending}</div>
        <div className="portal-card">Refunded: {summary.refunded}</div>
      </div>
      <div className="portal-grid">
        <form className="portal-card" onSubmit={saveSalaryProfile}>
          <h3>Teacher Salary Profile</h3>
          <select value={salaryForm.teacherId} onChange={(e) => setSalaryForm({ ...salaryForm, teacherId: e.target.value })}>
            <option value="">Select Teacher</option>
            {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          <input type="number" placeholder="Monthly salary" value={salaryForm.monthlySalary} onChange={(e) => setSalaryForm({ ...salaryForm, monthlySalary: Number(e.target.value) })} />
          <input type="number" placeholder="Working days" value={salaryForm.workingDays} onChange={(e) => setSalaryForm({ ...salaryForm, workingDays: Number(e.target.value) })} />
          <button type="submit">Save Profile</button>
        </form>
        <form className="portal-card" onSubmit={saveAttendance}>
          <h3>Teacher Attendance</h3>
          <select value={attendanceForm.teacherId} onChange={(e) => setAttendanceForm({ ...attendanceForm, teacherId: e.target.value })}>
            <option value="">Select Teacher</option>
            {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          <input type="month" value={attendanceForm.monthKey} onChange={(e) => setAttendanceForm({ ...attendanceForm, monthKey: e.target.value })} />
          <input type="number" placeholder="Present days" value={attendanceForm.presentDays} onChange={(e) => setAttendanceForm({ ...attendanceForm, presentDays: Number(e.target.value) })} />
          <input type="number" placeholder="Leave days" value={attendanceForm.leaveDays} onChange={(e) => setAttendanceForm({ ...attendanceForm, leaveDays: Number(e.target.value) })} />
          <button type="submit">Save Attendance</button>
        </form>
        <form className="portal-card" onSubmit={runPayroll}>
          <h3>Run Monthly Payroll</h3>
          <select value={runForm.teacherId} onChange={(e) => setRunForm({ ...runForm, teacherId: e.target.value })}>
            <option value="">Select Teacher</option>
            {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
          <input type="month" value={runForm.monthKey} onChange={(e) => setRunForm({ ...runForm, monthKey: e.target.value })} />
          <button type="submit">Generate Payroll</button>
        </form>
      </div>
      {msg && <p>{msg}</p>}
      <div className="portal-card">
        <h3>Payroll Runs</h3>
        {runs.length === 0 ? <p>No payroll runs yet.</p> : runs.map((r) => (
          <p key={r._id}>{r.teacher?.name || 'Teacher'} - {r.monthKey} - Final: {r.finalSalary.toFixed(2)} (Deduction: {r.deduction.toFixed(2)})</p>
        ))}
      </div>
    </div>
  );
};

export default AccountantPortal;
