import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../utils/authStorage';
import './PortalLayout.scss';

const ParentPortal = () => {
  const [summary, setSummary] = useState(null);
  const [linkForm, setLinkForm] = useState({ studentId: '', relation: 'guardian' });
  const [msg, setMsg] = useState('');
  const token = getAuthToken();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/portal/parent/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSummary(res.data.summary);
      } catch (error) {
        setSummary({ childrenCount: 0, enrollmentsCount: 0, attendanceRecords: 0, quizAttempts: 0 });
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitLinkRequest = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await axios.post('http://localhost:5000/api/portal/admin/link-parent-student', linkForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg('Link request submitted.');
    } catch {
      setMsg('Linking requires admin/super-admin access.');
    }
  };

  return (
    <div className="portal-page">
      <h1>Parent Portal</h1>
      <div className="portal-grid">
        <div className="portal-card">Children Linked: {summary?.childrenCount ?? '-'}</div>
        <div className="portal-card">Enrollments: {summary?.enrollmentsCount ?? '-'}</div>
        <div className="portal-card">Attendance Records: {summary?.attendanceRecords ?? '-'}</div>
        <div className="portal-card">Quiz Attempts: {summary?.quizAttempts ?? '-'}</div>
      </div>
      <form className="portal-card" onSubmit={submitLinkRequest}>
        <h3>Child Link Request</h3>
        <input placeholder="Student ID" value={linkForm.studentId} onChange={(e) => setLinkForm({ ...linkForm, studentId: e.target.value })} />
        <select value={linkForm.relation} onChange={(e) => setLinkForm({ ...linkForm, relation: e.target.value })}>
          <option value="guardian">Guardian</option>
          <option value="father">Father</option>
          <option value="mother">Mother</option>
          <option value="other">Other</option>
        </select>
        <button type="submit">Send Link Request</button>
        {msg && <p>{msg}</p>}
      </form>
    </div>
  );
};

export default ParentPortal;
