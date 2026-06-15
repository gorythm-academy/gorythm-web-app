import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { lmsAdminGet } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import PortalModal from '../../Portals/shared/PortalModal';
import SubmissionFiles from '../../Portals/shared/SubmissionFiles';
import QuizReviewPanel from '../../Portals/shared/QuizReviewPanel';
import { formatScore } from '../../../utils/formatScore';
import './AdminAssignmentSubmissions.scss';

const AdminAssignmentSubmissions = () => {
  const { showAlert } = useAdminDialog();
  const [courses, setCourses] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch] = useState('');
  const [assignmentDetail, setAssignmentDetail] = useState(null);
  const [quizDetail, setQuizDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingCourses(true);
    lmsAdminGet('/assignments')
      .then((res) => {
        if (cancelled) return;
        if (res.success) setCourses(res.courses || []);
      })
      .catch((err) => {
        if (!cancelled) showAlert(err.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingCourses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAlert]);

  const loadData = useCallback(async () => {
    if (!courseFilter) {
      setSubmissions([]);
      setQuizAttempts([]);
      return;
    }
    // 'all' loads every course; specific id scopes the API query.
    setLoadingData(true);
    try {
      const courseQuery =
        courseFilter === 'all' ? '' : `?courseId=${encodeURIComponent(courseFilter)}`;
      const [subRes, quizRes] = await Promise.all([
        lmsAdminGet(`/submissions${courseQuery}`),
        lmsAdminGet(`/quiz-attempts${courseQuery}`),
      ]);
      if (subRes.success) setSubmissions(subRes.submissions || []);
      if (quizRes.success) setQuizAttempts(quizRes.attempts || []);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoadingData(false);
    }
  }, [courseFilter, showAlert]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) => {
      const name = (s.student?.name || '').toLowerCase();
      const roll = (s.student?.studentId || '').toLowerCase();
      const assign = (s.assignment?.title || '').toLowerCase();
      const teacher = (s.assignment?.teacher?.name || '').toLowerCase();
      return name.includes(q) || roll.includes(q) || assign.includes(q) || teacher.includes(q);
    });
  }, [submissions, search]);

  const filteredQuizzes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quizAttempts;
    return quizAttempts.filter((a) => {
      const name = (a.student?.name || '').toLowerCase();
      const roll = (a.student?.studentId || '').toLowerCase();
      const quiz = (a.quiz?.title || '').toLowerCase();
      const teacher = (a.quiz?.teacher?.name || '').toLowerCase();
      return name.includes(q) || roll.includes(q) || quiz.includes(q) || teacher.includes(q);
    });
  }, [quizAttempts, search]);

  const assignmentStats = useMemo(() => {
    const graded = filteredAssignments.filter((s) => s.status === 'graded').length;
    const pending = filteredAssignments.filter((s) => s.status === 'submitted').length;
    return { total: filteredAssignments.length, graded, pending };
  }, [filteredAssignments]);

  const courseSelected = Boolean(courseFilter);

  return (
    <div className="admin-submissions">
      <div className="admin-submissions__hero">
        <div className="admin-submissions__hero-icon" aria-hidden="true">
          <i className="fas fa-file-signature" />
        </div>
        <div>
          <h2>Student submissions</h2>
          <p>Assignment homework and quiz attempts are listed separately below.</p>
        </div>
      </div>

      <div className="admin-submissions__stats">
        <div className="admin-submissions__stat">
          <span>Assignments</span>
          <strong>{courseSelected ? assignmentStats.total : '—'}</strong>
        </div>
        <div className="admin-submissions__stat admin-submissions__stat--pending">
          <span>Needs grading</span>
          <strong>{courseSelected ? assignmentStats.pending : '—'}</strong>
        </div>
        <div className="admin-submissions__stat admin-submissions__stat--graded">
          <span>Quiz attempts</span>
          <strong>{courseSelected ? filteredQuizzes.length : '—'}</strong>
        </div>
      </div>

      <div className="admin-submissions__toolbar">
        <label className="admin-submissions__field">
          <span>Course</span>
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setSearch('');
            }}
            disabled={loadingCourses}
          >
            <option value="all">All courses</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-submissions__field admin-submissions__field--search">
          <span>Search</span>
          <input
            type="search"
            placeholder="Name, roll no., title, teacher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!courseSelected}
          />
        </label>
      </div>

      {loadingCourses ? (
        <p className="admin-submissions__loading">Loading courses…</p>
      ) : loadingData ? (
        <p className="admin-submissions__loading">Loading submissions…</p>
      ) : (
        <>
          <section className="admin-submissions__section">
            <h3 className="admin-submissions__section-title">Assignment submissions</h3>
            <div className="admin-submissions__table-wrap">
              <table className="admin-submissions__table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Roll no.</th>
                    <th>Assignment</th>
                    <th>Course</th>
                    <th>Teacher</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((s) => (
                    <tr key={s._id}>
                      <td className="admin-submissions__name">{s.student?.name || '—'}</td>
                      <td>{s.student?.studentId || '—'}</td>
                      <td>{s.assignment?.title || '—'}</td>
                      <td>{s.assignment?.course?.title || '—'}</td>
                      <td>{s.assignment?.teacher?.name || s.assignment?.course?.instructorName || '—'}</td>
                      <td>
                        <span className={`admin-submissions__badge admin-submissions__badge--${s.status}`}>
                          {s.status === 'graded' ? 'Graded' : 'Submitted'}
                        </span>
                      </td>
                      <td>{formatScore(s.score, s.assignment?.maxPoints)}</td>
                      <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                      <td>
                        <button type="button" className="admin-submissions__view-btn" onClick={() => setAssignmentDetail(s)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredAssignments.length ? (
                <p className="admin-submissions__empty">
                  {courseFilter === 'all' ? 'No assignment submissions yet.' : 'No assignment submissions for this course.'}
                </p>
              ) : null}
            </div>
          </section>

          <section className="admin-submissions__section">
            <h3 className="admin-submissions__section-title">Quiz submissions</h3>
            <div className="admin-submissions__table-wrap">
              <table className="admin-submissions__table admin-submissions__table--quiz">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Roll no.</th>
                    <th>Quiz</th>
                    <th>Course</th>
                    <th>Teacher</th>
                    <th>Score</th>
                    <th>Submitted</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredQuizzes.map((a) => (
                    <tr key={a._id}>
                      <td className="admin-submissions__name">{a.student?.name || '—'}</td>
                      <td>{a.student?.studentId || '—'}</td>
                      <td>{a.quiz?.title || '—'}</td>
                      <td>{a.quiz?.course?.title || '—'}</td>
                      <td>{a.quiz?.teacher?.name || a.quiz?.course?.instructorName || '—'}</td>
                      <td>{a.scoreDisplay || formatScore(a.score, a.quiz?.totalMarks)}</td>
                      <td>{a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</td>
                      <td>
                        <button type="button" className="admin-submissions__view-btn" onClick={() => setQuizDetail(a)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredQuizzes.length ? (
                <p className="admin-submissions__empty">
                  {courseFilter === 'all' ? 'No quiz attempts yet.' : 'No quiz attempts for this course.'}
                </p>
              ) : null}
            </div>
          </section>
        </>
      )}

      {assignmentDetail ? (
        <PortalModal title={`Assignment — ${assignmentDetail.student?.name}`} onClose={() => setAssignmentDetail(null)} wide>
          <div className="admin-submissions__detail-grid">
            <p>
              <strong>Roll no.:</strong> {assignmentDetail.student?.studentId || '—'}
            </p>
            <p>
              <strong>Email:</strong> {assignmentDetail.student?.email || '—'}
            </p>
            <p>
              <strong>Assignment:</strong> {assignmentDetail.assignment?.title}
            </p>
            <p>
              <strong>Course:</strong> {assignmentDetail.assignment?.course?.title}
            </p>
            <p>
              <strong>Teacher:</strong>{' '}
              {assignmentDetail.assignment?.teacher?.name || assignmentDetail.assignment?.course?.instructorName || '—'}
            </p>
            <p>
              <strong>Score:</strong> {formatScore(assignmentDetail.score, assignmentDetail.assignment?.maxPoints)}
            </p>
          </div>
          {(assignmentDetail.text || '').trim() ? (
            <div className="admin-submissions__detail-text">
              <strong>Written answer</strong>
              <p>{assignmentDetail.text}</p>
            </div>
          ) : null}
          {assignmentDetail.attachments?.length ? (
            <>
              <p>
                <strong>Files</strong>
              </p>
              <SubmissionFiles attachments={assignmentDetail.attachments} />
            </>
          ) : null}
          {assignmentDetail.feedback ? (
            <div className="admin-submissions__detail-feedback">
              <strong>Teacher feedback</strong>
              <p>{assignmentDetail.feedback}</p>
            </div>
          ) : null}
        </PortalModal>
      ) : null}

      {quizDetail ? (
        <PortalModal title={`Quiz — ${quizDetail.student?.name}`} onClose={() => setQuizDetail(null)} wide>
          <div className="admin-submissions__detail-grid">
            <p>
              <strong>Roll no.:</strong> {quizDetail.student?.studentId || '—'}
            </p>
            <p>
              <strong>Quiz:</strong> {quizDetail.quiz?.title}
            </p>
            <p>
              <strong>Course:</strong> {quizDetail.quiz?.course?.title}
            </p>
            <p>
              <strong>Teacher:</strong>{' '}
              {quizDetail.quiz?.teacher?.name || quizDetail.quiz?.course?.instructorName || '—'}
            </p>
            <p>
              <strong>Score:</strong> {quizDetail.scoreDisplay || formatScore(quizDetail.score, quizDetail.quiz?.totalMarks)}
            </p>
          </div>
          {quizDetail.review ? (
            <QuizReviewPanel review={quizDetail.review} title="Student answers" />
          ) : null}
        </PortalModal>
      ) : null}
    </div>
  );
};

export default AdminAssignmentSubmissions;
