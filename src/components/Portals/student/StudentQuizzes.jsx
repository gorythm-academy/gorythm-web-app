import React, { useEffect, useMemo, useState } from 'react';
import FileUploadField from '../shared/FileUploadField';
import { hasLmsUploadValue, resolveLmsUploadList } from '../../../utils/fileUploadApi';
import RequiredMark from '../../shared/RequiredMark';
import { portalGet, portalPost } from '../shared/portalApi';
import {
  PortalDataSection,
  PortalAlert,
  PortalPageHeader,
  PortalCourseToolbar,
  PortalNewBanner,
  PortalActivityBanner,
} from '../shared/PortalUi';
import { QuizFileView } from '../shared/QuizPreviewModal';
import { collectQuizUpdateNotices } from '../../../utils/adminEditNotices';
import QuizReviewPanel from '../shared/QuizReviewPanel';
import { formatScore } from '../../../utils/formatScore';
import { portalDocId } from '../../../utils/portalDocId';
import {
  filterPortalItemsByCourse,
  getItemsNewSinceLastVisit,
  sortNewestFirst,
  markPortalPageVisited,
  STUDENT_QUIZ_UPDATES,
} from '../../../utils/portalNewItems';

const SEEN_KEY = 'student_quizzes';

const StudentQuizzes = () => {
  const [quizzes, setQuizzes] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [review, setReview] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submissionFiles, setSubmissionFiles] = useState([]);
  const [updateTick, setUpdateTick] = useState(0);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  const filtered = useMemo(
    () => sortNewestFirst(filterPortalItemsByCourse(quizzes || [], courseFilter)),
    [quizzes, courseFilter]
  );

  const openQuiz = async (quizId, { mode = 'auto' } = {}) => {
    setMsg('');
    setReview(null);
    try {
      const res = await portalGet(`/student/quizzes/${quizId}`);
      if (!res.success) {
        setMsg(res.error || 'Failed to load quiz');
        return;
      }
      const wantRetake = mode === 'retake' || (mode === 'auto' && res.canRetake);
      if (wantRetake) {
        setActiveQuiz({ quiz: res.quiz, attempt: null, canRetake: true });
        setAnswers({});
        setSubmissionFiles([]);
        setReview(null);
        return;
      }
      if (res.attempt && res.review) {
        setActiveQuiz({ quiz: res.quiz, attempt: res.attempt, canRetake: res.canRetake });
        setReview(res.review);
        requestAnimationFrame(() => {
          document.querySelector('.portal-quiz-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        return;
      }
      setActiveQuiz(res);
      setAnswers({});
      setSubmissionFiles([]);
    } catch (err) {
      setMsg(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!activeQuiz?.quiz || submitting) return;
    const ordered = (activeQuiz.quiz.questions || []).map((_, idx) =>
      answers[idx] != null ? Number(answers[idx]) : -1
    );
    if (activeQuiz.quiz.quizType === 'file' && !hasLmsUploadValue(submissionFiles)) {
      setMsg('Attach at least one file before submitting this quiz.');
      return;
    }
    setSubmitting(true);
    try {
      const attachments =
        activeQuiz.quiz.quizType === 'file'
          ? await resolveLmsUploadList(submissionFiles, 'quizzes')
          : [];
      if (activeQuiz.quiz.quizType === 'file' && !attachments.length) {
        setMsg('Attach at least one file before submitting this quiz.');
        return;
      }
      const res = await portalPost('/student/quiz-attempts', {
        quizId: portalDocId(activeQuiz.quiz),
        answers: ordered,
        attachments,
      });
      if (res.success) {
        setReview(res.review);
        setActiveQuiz({ quiz: activeQuiz.quiz, attempt: res.attempt });
        setMsg('');
        load();
        requestAnimationFrame(() => {
          document.querySelector('.portal-quiz-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      } else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const dismissNew = () => {
    markPortalPageVisited(SEEN_KEY);
    setNewItems([]);
  };

  const loading = quizzes === null;

  const q = activeQuiz?.quiz;
  const taking = q && !activeQuiz?.attempt && !review;
  const visibleNew = courseFilter ? filterPortalItemsByCourse(newItems, courseFilter) : newItems;
  const quizUpdateNotices = useMemo(() => {
    void updateTick;
    return collectQuizUpdateNotices(filtered, { storageKey: STUDENT_QUIZ_UPDATES, audience: 'student' });
  }, [filtered, updateTick]);

  useEffect(() => {
    if (!taking) return undefined;
    const frame = requestAnimationFrame(() => {
      document.querySelector('.portal-quiz-take-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [taking, q?._id]);

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="Quizzes"
        subtitle="Choose one answer per question (A, B, or C). After submit, you will see the correct answers and your score."
      />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-question-circle" />
        </div>
        <div>
          <h2>Course Quizzes</h2>
          <p>Filter by course, take quizzes, and review your scores when results are ready. If a quiz is updated after you submit, you can retake it.</p>
        </div>
      </div>

      <PortalDataSection loading={loading} error={error} loadingLabel="Loading quizzes…">
      <PortalNewBanner
        title={`${visibleNew.length} new quiz${visibleNew.length === 1 ? '' : 'zes'} available`}
        items={visibleNew}
        itemLabel={(quiz) => quiz.title}
        onDismiss={dismissNew}
      />
      <PortalActivityBanner
        title="Quiz updates"
        rows={quizUpdateNotices}
        onDismiss={() => {
          markPortalPageVisited(STUDENT_QUIZ_UPDATES);
          setUpdateTick((n) => n + 1);
        }}
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
              <h2>Quiz List</h2>
              <p>Due dates, scores, and actions</p>
            </div>
          </div>
          <div className="portal-panel__body">
            {filtered.length === 0 ? (
              <p className="portal-select-hint" style={{ border: 'none', background: 'transparent' }}>
                There are no quizzes to show right now.
              </p>
            ) : (
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--purple">
                  <thead>
                    <tr>
                      <th>Quiz</th>
                      <th>Course</th>
                      <th>Due</th>
                      <th>Your Score</th>
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
                        <td>
                          {r.quizType === 'file'
                            ? r.attempt
                              ? 'Completed'
                              : 'Not opened yet'
                            : r.attempt
                              ? formatScore(r.attempt.score, r.totalMarks)
                              : 'Not attempted'}
                        </td>
                        <td>
                          <div className="portal-quiz-actions">
                            <button
                              type="button"
                              className="portal-action-btn portal-action-btn--purple"
                              onClick={() =>
                                openQuiz(portalDocId(r), {
                                  mode: r.canRetake ? 'retake' : 'auto',
                                })
                              }
                            >
                              <span className="portal-action-btn__label">
                                {r.canRetake
                                  ? 'Retake quiz'
                                  : r.quizType === 'file'
                                    ? r.attempt
                                      ? 'View'
                                      : 'Open'
                                    : r.attempt
                                      ? 'View result'
                                      : 'Take quiz'}
                              </span>
                            </button>
                            {r.canRetake && r.attempt ? (
                              <button
                                type="button"
                                className="portal-action-btn portal-action-btn--ghost"
                                onClick={() => openQuiz(portalDocId(r), { mode: 'result' })}
                              >
                                <span className="portal-action-btn__label">View last result</span>
                              </button>
                            ) : null}
                          </div>
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
            {q?.quizType === 'file' ? (
              <div className="portal-quiz-review">
                <QuizFileView quiz={q} tone="student" />
                <p className="quiz-file-view__done">
                  <i className="fas fa-check-circle" aria-hidden /> Marked as completed.
                </p>
                {(activeQuiz?.attempt?.attachments || []).length ? (
                  <>
                  <p className="quiz-file-view__done">Your uploaded files</p>
                  <QuizFileView
                    quiz={{ title: 'Your files', attachments: activeQuiz.attempt.attachments, quizType: 'file' }}
                    tone="student"
                    compact
                  />
                  </>
                ) : null}
              </div>
            ) : (
              <QuizReviewPanel review={review} title={q?.title ? `Results — ${q.title}` : 'Your results'} />
            )}
            {review && activeQuiz?.canRetake ? (
              <button
                type="button"
                className="portal-action-btn portal-action-btn--purple"
                style={{ marginTop: '1rem', marginRight: '0.5rem' }}
                onClick={() => openQuiz(portalDocId(q), { mode: 'retake' })}
              >
                <span className="portal-action-btn__label">Retake updated quiz</span>
              </button>
            ) : null}
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

      {taking && q.quizType === 'file' ? (
        <form className="portal-quiz-take-panel" onSubmit={submit}>
          <QuizFileView quiz={q} tone="student" />
          <p className="portal-field-hint">Open the material, attach your file, then mark this quiz as done.</p>
          <FileUploadField
            label={<>Your files <RequiredMark /></>}
            multiple
            value={submissionFiles}
            onChange={setSubmissionFiles}
            category="quizzes"
          />
          <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Mark as done'}</button>
        </form>
      ) : taking ? (
        <form className="portal-quiz-take-panel" onSubmit={submit}>
          <h3>{q.title}</h3>
          <p className="portal-field-hint">Answer all questions <RequiredMark /></p>
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
          <button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit quiz'}</button>
        </form>
      ) : null}

      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}
      </PortalDataSection>
    </div>
  );
};

export default StudentQuizzes;
