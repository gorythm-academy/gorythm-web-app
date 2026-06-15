import React, { useEffect, useMemo, useState } from 'react';
import { portalGet, portalPost } from '../shared/portalApi';
import {
  PortalLoading,
  PortalAlert,
  PortalPageHeader,
  PortalCourseToolbar,
  PortalNewBanner,
} from '../shared/PortalUi';
import QuizReviewPanel from '../shared/QuizReviewPanel';
import { absFileUrl } from '../../../utils/fileUrl';
import { formatScore } from '../../../utils/formatScore';
import { portalDocId } from '../../../utils/portalDocId';
import {
  filterPortalItemsByCourse,
  getItemsNewSinceLastVisit,
  markPortalPageVisited,
} from '../../../utils/portalNewItems';

const SEEN_KEY = 'student_quizzes';

const StudentQuizzes = () => {
  const [quizzes, setQuizzes] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [review, setReview] = useState(null);
  const [answers, setAnswers] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [newItems, setNewItems] = useState([]);

  const load = () => {
    Promise.all([portalGet('/student/quizzes'), portalGet('/student/courses')])
      .then(([qRes, cRes]) => {
        if (qRes.success) {
          const list = qRes.quizzes || [];
          setQuizzes(list);
          setNewItems(getItemsNewSinceLastVisit(SEEN_KEY, list));
        } else setError(qRes.error || 'Failed to load');
        if (cRes.success) {
          const active = (cRes.enrollments || [])
            .filter((e) => e.course && e.status === 'active')
            .map((e) => ({ _id: e.course._id, title: e.course.title }));
          setCourses(active);
        }
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    markPortalPageVisited(SEEN_KEY);
    setNewItems([]);
  }, []);

  const filtered = useMemo(
    () => filterPortalItemsByCourse(quizzes || [], courseFilter),
    [quizzes, courseFilter]
  );

  const openQuiz = async (quizId) => {
    setMsg('');
    setReview(null);
    try {
      const res = await portalGet(`/student/quizzes/${quizId}`);
      if (res.success) {
        if (res.attempt && res.review) {
          setActiveQuiz({ quiz: res.quiz, attempt: res.attempt });
          setReview(res.review);
        } else {
          setActiveQuiz(res);
          setAnswers({});
        }
      } else setMsg(res.error || 'Failed to load quiz');
    } catch (err) {
      setMsg(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!activeQuiz?.quiz) return;
    const ordered = (activeQuiz.quiz.questions || []).map((_, idx) =>
      answers[idx] != null ? Number(answers[idx]) : -1
    );
    try {
      const res = await portalPost('/student/quiz-attempts', {
        quizId: portalDocId(activeQuiz.quiz),
        answers: ordered,
      });
      if (res.success) {
        setReview(res.review);
        setActiveQuiz({ quiz: activeQuiz.quiz, attempt: res.attempt });
        setMsg('');
        load();
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  const dismissNew = () => {
    markPortalPageVisited(SEEN_KEY);
    setNewItems([]);
  };

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (quizzes === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  const q = activeQuiz?.quiz;
  const taking = q && !activeQuiz?.attempt && !review;
  const visibleNew = courseFilter ? filterPortalItemsByCourse(newItems, courseFilter) : newItems;

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="Quizzes"
        subtitle="Choose one answer per question (A, B, or C). Results show after you submit."
      />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-question-circle" />
        </div>
        <div>
          <h2>Course quizzes</h2>
          <p>Filter by course, take quizzes once, and review your scores when results are ready.</p>
        </div>
      </div>

      <PortalNewBanner
        title={`${visibleNew.length} new quiz${visibleNew.length === 1 ? '' : 'zes'} available`}
        items={visibleNew}
        itemLabel={(quiz) => quiz.title}
        onDismiss={dismissNew}
      />

      <PortalCourseToolbar
        value={courseFilter}
        onChange={setCourseFilter}
        courses={courses}
        label="Filter by course"
        count={courseFilter ? filtered.length : null}
      />

      <div className="portal-panel">
          <div className="portal-panel__head">
            <div>
              <h2>Quiz list</h2>
              <p>Due dates, scores, and actions</p>
            </div>
          </div>
          <div className="portal-panel__body">
            {filtered.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                No quizzes for this selection.
              </p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--purple">
                  <thead>
                    <tr>
                      <th>Quiz</th>
                      <th>Course</th>
                      <th>Due</th>
                      <th>Your score</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <strong>{r.title}</strong>
                        </td>
                        <td>{r.course?.title || '—'}</td>
                        <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
                        <td>{r.attempt ? formatScore(r.attempt.score, r.totalMarks) : 'Not attempted'}</td>
                        <td>
                          <button
                            type="button"
                            className="portal-action-btn portal-action-btn--purple"
                            onClick={() => openQuiz(portalDocId(r))}
                          >
                            {r.attempt ? 'View result' : 'Take quiz'}
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

      {review ? (
        <div className="portal-panel" style={{ marginTop: '1.25rem' }}>
          <div className="portal-panel__body portal-panel__body--padded">
            <QuizReviewPanel review={review} title={q?.title ? `Results — ${q.title}` : 'Your results'} />
            <button
              type="button"
              className="portal-btn-secondary"
              style={{ marginTop: '1rem' }}
              onClick={() => {
                setActiveQuiz(null);
                setReview(null);
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {taking ? (
        <form className="portal-quiz-take-panel" onSubmit={submit}>
          <h3>{q.title}</h3>
          {q.resourceLink ? (
            <p>
              <a href={q.resourceLink} target="_blank" rel="noreferrer">
                Open reading link
              </a>
            </p>
          ) : null}
          {q.resourceFileUrl ? (
            <p>
              <a href={absFileUrl(q.resourceFileUrl)} target="_blank" rel="noreferrer">
                Open study file
              </a>
            </p>
          ) : null}
          {(q.questions || []).map((question, idx) => (
            <fieldset key={idx} className="portal-quiz-fieldset">
              <legend className="portal-field-label">
                <span>
                  {idx + 1}. {question.question}
                </span>
              </legend>
              {(question.options || []).slice(0, 3).map((opt, oi) => (
                <label key={oi} className="portal-quiz-option-label">
                  <input
                    type="radio"
                    name={`q-${idx}`}
                    value={oi}
                    checked={Number(answers[idx]) === oi}
                    onChange={() => setAnswers({ ...answers, [idx]: oi })}
                    required
                  />
                  <span className="portal-quiz-option-letter">{['A', 'B', 'C'][oi]}.</span> {opt}
                </label>
              ))}
            </fieldset>
          ))}
          <button type="submit">Submit quiz</button>
        </form>
      ) : null}

      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}
    </div>
  );
};

export default StudentQuizzes;
