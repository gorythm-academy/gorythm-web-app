import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';

const TeacherClasses = () => {
  const [courses, setCourses] = useState(null);
  const [roster, setRoster] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/teacher/courses')
      .then((res) => {
        if (res.success) setCourses(res.courses || []);
        else setError(res.error || 'Failed to load');
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedCourse) {
      setRoster([]);
      return;
    }
    portalGet(`/teacher/courses/${selectedCourse}/roster`)
      .then((res) => {
        if (res.success) setRoster(res.enrollments || []);
      })
      .catch(() => setRoster([]));
  }, [selectedCourse]);

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (courses === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="My classes"
        subtitle="See which courses you teach and who is enrolled. Use the roster link to jump to daily attendance for that class."
      />
      <PortalAlert type="info">
        <strong>What is this tab for?</strong> Admin assigns you as the instructor on each course. Here you see those
        courses and the student list (roster). To mark attendance, open the link below or use the Attendance tab. To
        post homework or quizzes, use Content or Quizzes.
      </PortalAlert>
      <SimpleTable
        columns={[
          { key: 'title', label: 'Course' },
          { key: 'category', label: 'Category' },
          { key: 'level', label: 'Level' },
        ]}
        rows={courses}
        emptyLabel="No courses assigned. Ask admin to set you as instructor."
      />
      <div className="portal-card" style={{ marginTop: '1rem' }}>
        <h3>Class roster</h3>
        {selectedCourse ? (
          <p style={{ marginBottom: '0.75rem' }}>
            <Link to={`/teacher/attendance?course=${portalDocId({ _id: selectedCourse })}`}>
              Mark daily attendance for this class →
            </Link>
          </p>
        ) : null}
        <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}>
          <option value="">Select course</option>
          {courses.map((c) => (
            <option key={c._id} value={c._id}>
              {c.title}
            </option>
          ))}
        </select>
        <SimpleTable
          columns={[
            { key: 'name', label: 'Student', render: (r) => r.student?.name },
            { key: 'id', label: 'Student ID', render: (r) => r.student?.studentId || '—' },
            { key: 'status', label: 'Status', render: (r) => r.status },
          ]}
          rows={roster}
          emptyLabel={selectedCourse ? 'No active students.' : 'Select a course.'}
        />
      </div>
    </div>
  );
};

export default TeacherClasses;
