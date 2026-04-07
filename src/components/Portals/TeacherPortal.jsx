import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../utils/authStorage';
import './PortalLayout.scss';

const TeacherPortal = () => {
  const [summary, setSummary] = useState(null);
  const [attendanceForm, setAttendanceForm] = useState({ courseId: '', studentId: '', status: 'present', notes: '' });
  const [assignmentForm, setAssignmentForm] = useState({ title: '', courseId: '', dueDate: '' });
  const [actionMsg, setActionMsg] = useState('');
  const token = getAuthToken();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/portal/teacher/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSummary(res.data.summary);
      } catch (error) {
        setSummary({ coursesManaged: 0, assignmentsCount: 0, quizzesCount: 0, pendingSubmissions: 0 });
      }
    };
    fetchData();
  }, []);

  const submitAttendance = async (e) => {
    e.preventDefault();
    setActionMsg('');
    try {
      await axios.post('http://localhost:5000/api/portal/teacher/attendance', attendanceForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActionMsg('Attendance marked successfully.');
    } catch {
      setActionMsg('Failed to mark attendance.');
    }
  };

  const submitAssignment = async (e) => {
    e.preventDefault();
    setActionMsg('');
    try {
      await axios.post('http://localhost:5000/api/portal/teacher/assignments', assignmentForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActionMsg('Assignment published successfully.');
    } catch {
      setActionMsg('Failed to publish assignment.');
    }
  };

  return (
    <div className="portal-page">
      <h1>Teacher Portal</h1>
      <div className="portal-grid">
        <div className="portal-card">Courses Managed: {summary?.coursesManaged ?? '-'}</div>
        <div className="portal-card">Assignments: {summary?.assignmentsCount ?? '-'}</div>
        <div className="portal-card">Quizzes: {summary?.quizzesCount ?? '-'}</div>
        <div className="portal-card">Pending Submissions: {summary?.pendingSubmissions ?? '-'}</div>
      </div>
      <div className="portal-grid">
        <form className="portal-card" onSubmit={submitAttendance}>
          <h3>Mark Student Attendance</h3>
          <input placeholder="Course ID" value={attendanceForm.courseId} onChange={(e) => setAttendanceForm({ ...attendanceForm, courseId: e.target.value })} />
          <input placeholder="Student ID" value={attendanceForm.studentId} onChange={(e) => setAttendanceForm({ ...attendanceForm, studentId: e.target.value })} />
          <select value={attendanceForm.status} onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
          </select>
          <input placeholder="Notes" value={attendanceForm.notes} onChange={(e) => setAttendanceForm({ ...attendanceForm, notes: e.target.value })} />
          <button type="submit">Save Attendance</button>
        </form>
        <form className="portal-card" onSubmit={submitAssignment}>
          <h3>Create Assignment</h3>
          <input placeholder="Title" value={assignmentForm.title} onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })} />
          <input placeholder="Course ID" value={assignmentForm.courseId} onChange={(e) => setAssignmentForm({ ...assignmentForm, courseId: e.target.value })} />
          <input type="date" value={assignmentForm.dueDate} onChange={(e) => setAssignmentForm({ ...assignmentForm, dueDate: e.target.value })} />
          <button type="submit">Publish Assignment</button>
        </form>
      </div>
      {actionMsg && <p>{actionMsg}</p>}
    </div>
  );
};

export default TeacherPortal;
