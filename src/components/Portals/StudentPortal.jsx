import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../utils/authStorage';
import { API_BASE_URL } from '../../config/constants';
import './PortalLayout.scss';

const StudentPortal = () => {
  const [data, setData] = useState(null);
  const [submission, setSubmission] = useState({ assignmentId: '', text: '' });
  const [quizAttempt, setQuizAttempt] = useState({ quizId: '', answers: '' });
  const [msg, setMsg] = useState('');
  const token = getAuthToken();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/portal/student/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data);
      } catch (error) {
        setData({ summary: { enrolledCourses: 0, attendanceRate: 0, assignmentsDue: 0, quizzesAvailable: 0 } });
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitHomework = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await axios.post(`${API_BASE_URL}/api/portal/student/submissions`, submission, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg('Homework submitted.');
    } catch {
      setMsg('Failed to submit homework.');
    }
  };

  const submitQuiz = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const answers = quizAttempt.answers.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x));
      await axios.post(`${API_BASE_URL}/api/portal/student/quiz-attempts`, { quizId: quizAttempt.quizId, answers }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMsg('Quiz submitted.');
    } catch {
      setMsg('Failed to submit quiz.');
    }
  };

  return (
    <div className="portal-page">
      <h1>Student Portal</h1>
      <div className="portal-grid">
        <div className="portal-card">Enrolled Courses: {data?.summary?.enrolledCourses ?? '-'}</div>
        <div className="portal-card">Attendance: {data?.summary?.attendanceRate ?? '-'}%</div>
        <div className="portal-card">Assignments Due: {data?.summary?.assignmentsDue ?? '-'}</div>
        <div className="portal-card">Quizzes Available: {data?.summary?.quizzesAvailable ?? '-'}</div>
      </div>
      <div className="portal-grid">
        <form className="portal-card" onSubmit={submitHomework}>
          <h3>Submit Homework</h3>
          <input placeholder="Assignment ID" value={submission.assignmentId} onChange={(e) => setSubmission({ ...submission, assignmentId: e.target.value })} />
          <textarea placeholder="Write your submission" value={submission.text} onChange={(e) => setSubmission({ ...submission, text: e.target.value })} />
          <button type="submit">Submit Assignment</button>
        </form>
        <form className="portal-card" onSubmit={submitQuiz}>
          <h3>Attempt Quiz</h3>
          <input placeholder="Quiz ID" value={quizAttempt.quizId} onChange={(e) => setQuizAttempt({ ...quizAttempt, quizId: e.target.value })} />
          <input placeholder="Answers CSV (e.g. 1,2,0)" value={quizAttempt.answers} onChange={(e) => setQuizAttempt({ ...quizAttempt, answers: e.target.value })} />
          <button type="submit">Submit Quiz</button>
        </form>
      </div>
      {msg && <p>{msg}</p>}
    </div>
  );
};

export default StudentPortal;
