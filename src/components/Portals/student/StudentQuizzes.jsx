import React, { useEffect, useState } from 'react';
import { portalGet, portalPost } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import QuizReviewPanel from '../shared/QuizReviewPanel';
import { absFileUrl } from '../../../utils/fileUrl';
import { formatScore } from '../../../utils/formatScore';
import { portalDocId } from '../../../utils/portalDocId';

const StudentQuizzes = () => {
  const [quizzes, setQuizzes] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [review, setReview] = useState(null);
  const [answers, setAnswers] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    portalGet('/student/quizzes')
      .then((res) => {
        if (res.success) setQuizzes(res.quizzes || []);
        else setError(res.error || 'Failed to load');
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

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

  return (
    <div className="portal-page">
      <PortalPageHeader title="Quizzes" subtitle="Choose one answer per question (A, B, or C). Results show after you submit." />
      <SimpleTable
        columns={[
          { key: 'title', label: 'Quiz', render: (r) => r.title },
          { key: 'course', label: 'Course', render: (r) => r.course?.title },
          {
            key: 'due',
            label: 'Due',
            render: (r) => (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'),
          },
          {
            key: 'score',
            label: 'Your score',
            render: (r) => (r.attempt ? formatScore(r.attempt.score, r.totalMarks) : 'Not attempted'),
          },
          {
            key: 'action',
            label: '',
            render: (r) => (
              <button type="button" onClick={() => openQuiz(portalDocId(r))}>
                {r.attempt ? 'View result' : 'Take quiz'}
              </button>
            ),
          },
        ]}
        rows={quizzes}
        emptyLabel="No quizzes available."
      />

      {review ? (
        <div className="portal-card" style={{ marginTop: '1rem' }}>
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
      ) : null}

      {taking ? (
        <form className="portal-card portal-form-card" onSubmit={submit} style={{ marginTop: '1rem' }}>
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
