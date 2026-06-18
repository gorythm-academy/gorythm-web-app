import React, { useEffect, useMemo, useRef, useState } from 'react';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import FileUploadField from '../shared/FileUploadField';
import PortalModal from '../shared/PortalModal';
import QuizReviewPanel from '../shared/QuizReviewPanel';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import { formatScore } from '../../../utils/formatScore';
import {
  filterPortalItemsByCourse,
  filterPortalItemsByCourseField,
  groupPortalItemsByCourse,
  markPortalPageVisited,
} from '../../../utils/portalNewItems';
import './TeacherQuizzes.scss';

const SEEN_QUIZ_ATTEMPTS_KEY = 'teacher_quiz_attempts';
const EMPTY_Q = { question: '', options: ['', '', ''], correctAnswer: 0 };

const EMPTY_FORM = {
  title: '',
  courseId: '',
  totalMarks: '',
  dueDate: '',
  resourceLink: '',
  resourceFileUrl: '',
  questions: [{ ...EMPTY_Q }],
};
const OPTION_LABELS = ['A', 'B', 'C'];

const TeacherQuizzes = () => {
  const [courses, setCourses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingAttemptCount, setEditingAttemptCount] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(null);
  const [quizCourseFilter, setQuizCourseFilter] = useState('all');
  const [submissionCourseFilter, setSubmissionCourseFilter] = useState('all');
  const [quizFilter, setQuizFilter] = useState('');
  const submissionsRef = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, questions: [{ ...EMPTY_Q }] });

  const reload = async () => {
    const results = await Promise.allSettled([
      portalGet('/teacher/courses'),
      portalGet('/teacher/quizzes'),
      portalGet('/teacher/quiz-attempts'),
    ]);
    const [c, q, a] = results;
    if (c.status === 'fulfilled' && c.value.success) setCourses(c.value.courses || []);
    if (q.status === 'fulfilled' && q.value.success) setQuizzes(q.value.quizzes || []);
    if (a.status === 'fulfilled' && a.value.success) {
      setAttempts(a.value.attempts || []);
    } else if (a.status === 'rejected') {
      setMsg(a.reason?.message || 'Could not load quiz submissions.');
    }
  };

  const courseOptions = useMemo(
    () => courses.map((c) => ({ _id: portalDocId(c), title: c.title })),
    [courses]
  );

  const filteredQuizzes = useMemo(
    () => filterPortalItemsByCourse(quizzes, quizCourseFilter),
    [quizzes, quizCourseFilter]
  );

  const quizzesForSubmissionFilter = useMemo(
    () => filterPortalItemsByCourse(quizzes, submissionCourseFilter),
    [quizzes, submissionCourseFilter]
  );

  const filteredAttempts = useMemo(() => {
    let list = filterPortalItemsByCourseField(
      attempts,
      submissionCourseFilter,
      (row) => row.quiz?.course?._id || row.quiz?.course
    );
    if (quizFilter) {
      list = list.filter((row) => String(row.quiz?._id || row.quiz) === quizFilter);
    }
    return list;
  }, [attempts, submissionCourseFilter, quizFilter]);

  const quizGroups = useMemo(() => {
    if (quizCourseFilter !== 'all') return null;
    return groupPortalItemsByCourse(
      filteredQuizzes,
      (q) => q.course?._id || q.course,
      (q) => q.course?.title
    );
  }, [filteredQuizzes, quizCourseFilter]);

  const attemptGroups = useMemo(
    () =>
      groupPortalItemsByCourse(
        filteredAttempts,
        (row) => row.quiz?.course?._id || row.quiz?.course,
        (row) => row.quiz?.course?.title
      ),
    [filteredAttempts]
  );

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    markPortalPageVisited(SEEN_QUIZ_ATTEMPTS_KEY);
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setEditingAttemptCount(0);
    setForm({ ...EMPTY_FORM, questions: [{ ...EMPTY_Q }] });
    setShowForm(false);
  };

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  const updateQuestion = (idx, patch) => {
    setForm((f) => {
      const questions = [...f.questions];
      questions[idx] = { ...questions[idx], ...patch };
      return { ...f, questions };
    });
  };

  const saveQuiz = async (e) => {
    e.preventDefault();
    setMsg('');
    const questions = form.questions
      .filter((q) => q.question.trim())
      .map((q) => ({
        question: q.question.trim(),
        options: (q.options || []).slice(0, 3).map((o) => String(o).trim()),
        correctAnswer: Number(q.correctAnswer) || 0,
      }));
    if (!questions.length) {
      setMsg('Add at least one question with 3 options.');
      return;
    }
    for (const q of questions) {
      if (q.options.filter(Boolean).length < 3) {
        setMsg('Each question needs 3 options (A, B, C).');
        return;
      }
    }
    const body = {
      courseId: form.courseId,
      title: form.title,
      totalMarks: form.totalMarks === '' ? null : Number(form.totalMarks),
      dueDate: form.dueDate || null,
      resourceLink: form.resourceLink || '',
      resourceFileUrl: form.resourceFileUrl || '',
      questions,
    };
    try {
      if (editingId) {
        const id = portalDocId(editingId);
        if (!id) {
          setMsg('Cannot save: click Edit on the quiz row first.');
          return;
        }
        await portalPatch(`/teacher/quizzes/${id}`, body);
        setMsg('Quiz updated.');
      } else {
        await portalPost('/teacher/quizzes', body);
        setMsg('Quiz published.');
      }
      resetForm();
      reload();
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  const startEdit = (q) => {
    const id = portalDocId(q);
    if (!id) {
      setMsg('This quiz has no id — refresh the page.');
      return;
    }
    setEditingId(id);
    setEditingAttemptCount(q.attemptCount || 0);
    const pad3 = (opts) => {
      const o = [...(opts || [])];
      while (o.length < 3) o.push('');
      return o.slice(0, 3);
    };
    setForm({
      title: q.title || '',
      courseId: String(q.course?._id || q.course || ''),
      totalMarks: q.totalMarks != null ? String(q.totalMarks) : '',
      dueDate: q.dueDate ? new Date(q.dueDate).toISOString().slice(0, 10) : '',
      resourceLink: q.resourceLink || '',
      resourceFileUrl: q.resourceFileUrl || '',
      questions: q.questions?.length
        ? q.questions.map((qu) => ({
            question: qu.question || '',
            options: pad3(qu.options),
            correctAnswer: qu.correctAnswer ?? 0,
          }))
        : [{ ...EMPTY_Q }],
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteQuiz = async (q) => {
    if (!window.confirm(`Delete quiz "${q.title}"?`)) return;
    try {
      await portalDelete(`/teacher/quizzes/${portalDocId(q)}`);
      setMsg('Quiz deleted.');
      reload();
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  const viewAttempts = (q) => {
    const id = portalDocId(q);
    if (!id) {
      setMsg('Quiz id missing.');
      return;
    }
    setSubmissionCourseFilter('all');
    setQuizFilter(id);
    submissionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderCourseFilter = (value, onChange, count) => (
    <label className="teacher-quizzes__course-filter">
      <span className="teacher-quizzes__course-filter-label">Filter by course</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by course">
        <option value="all">All courses</option>
        {courseOptions.map((c) => (
          <option key={c._id} value={c._id}>
            {c.title}
          </option>
        ))}
      </select>
      {value ? <span className="teacher-quizzes__course-filter-meta">{count} shown</span> : null}
    </label>
  );

  const renderQuizRows = (rows) =>
    rows.map((r) => (
      <tr key={portalDocId(r)}>
        <td>{r.title}</td>
        <td>{r.course?.title}</td>
        <td>
          <span className="teacher-quizzes__pill">{r.questions?.length ?? 0}</span>
        </td>
        <td>{r.totalMarks != null ? r.totalMarks : '—'}</td>
        <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
        <td>{r.attemptCount > 0 ? `${r.attemptCount} taken` : 'None yet'}</td>
        <td>
          <div className="portal-table-actions">
            <button type="button" className="teacher-quizzes__btn teacher-quizzes__btn--primary" onClick={() => viewAttempts(r)}>
              Results
            </button>
            <button type="button" className="teacher-quizzes__btn" onClick={() => startEdit(r)}>
              Edit
            </button>
            <button type="button" className="teacher-quizzes__btn teacher-quizzes__btn--danger" onClick={() => deleteQuiz(r)}>
              Delete
            </button>
          </div>
        </td>
      </tr>
    ));

  const renderAttemptRows = (rows) =>
    rows.map((r) => (
      <tr key={r._id}>
        <td>{r.student?.name || '—'}</td>
        <td>{r.student?.studentId || '—'}</td>
        <td>{r.quiz?.title || '—'}</td>
        <td>{r.quiz?.course?.title || '—'}</td>
        <td>{r.scoreDisplay || formatScore(r.score, r.quiz?.totalMarks)}</td>
        <td>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
        <td>
          <button
            type="button"
            className="teacher-quizzes__btn teacher-quizzes__btn--primary"
            onClick={() => setDetailAttempt(r)}
          >
            View answers
          </button>
        </td>
      </tr>
    ));

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-quizzes">
      <PortalPageHeader
        title="Quizzes"
        subtitle="Build multiple-choice quizzes. Students see green/red feedback after submitting."
      />

      <div className="teacher-quizzes__layout">
        {showForm ? (
        <aside className="teacher-quizzes__form-panel">
          <div className="teacher-quizzes__form-head">
            <div className="teacher-quizzes__form-icon" aria-hidden="true">
              <i className="fas fa-question-circle" />
            </div>
            <div>
              <h2>{editingId ? 'Edit quiz' : 'Create quiz'}</h2>
              <p>Each question has three options (A, B, C).</p>
            </div>
            <button
              type="button"
              className="teacher-quizzes__form-close"
              onClick={resetForm}
              aria-label="Close quiz form"
            >
              <i className="fas fa-times" />
            </button>
          </div>

          {editingId && editingAttemptCount > 0 ? (
            <PortalAlert type="info">
              {editingAttemptCount} student(s) already took this quiz — questions are locked; you can still change
              title, due date, marks, and materials.
            </PortalAlert>
          ) : null}

          <form onSubmit={saveQuiz} autoComplete="off">
            <label className="portal-field-label">
              <span>Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="portal-field-label">
              <span>Course</span>
              <select
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                required
              >
                <option value="">Select course</option>
                {courses.map((c) => (
                  <option key={portalDocId(c)} value={portalDocId(c)}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="portal-field-label">
              <span>Total marks (optional)</span>
              <input
                type="number"
                min="1"
                placeholder="Leave empty for raw correct count"
                value={form.totalMarks}
                onChange={(e) => setForm({ ...form, totalMarks: e.target.value })}
              />
            </label>
            <label className="portal-field-label">
              <span>Due date (optional)</span>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label className="portal-field-label">
              <span>Reading link (optional)</span>
              <input
                type="url"
                placeholder="https://..."
                value={form.resourceLink}
                onChange={(e) => setForm({ ...form, resourceLink: e.target.value })}
              />
            </label>
            <FileUploadField
              label="Study file (optional PDF)"
              value={form.resourceFileUrl}
              onChange={(url) => setForm({ ...form, resourceFileUrl: url })}
              category="quizzes"
            />

            {form.questions.map((q, idx) => (
              <div
                key={idx}
                className={`teacher-quizzes__question-card${editingAttemptCount > 0 ? ' teacher-quizzes__question-card--locked' : ''}`}
              >
                <div className="teacher-quizzes__question-label">Question {idx + 1}</div>
                <label className="portal-field-label">
                  <span>Question text</span>
                  <input
                    value={q.question}
                    onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                    required={idx === 0}
                    disabled={editingAttemptCount > 0}
                  />
                </label>
                {OPTION_LABELS.map((label, oi) => (
                  <label key={oi} className="portal-field-label">
                    <span>Option {label}</span>
                    <input
                      value={(q.options || [])[oi] || ''}
                      disabled={editingAttemptCount > 0}
                      onChange={(e) => {
                        const options = [...(q.options || ['', '', ''])];
                        options[oi] = e.target.value;
                        updateQuestion(idx, { options });
                      }}
                      required={idx === 0}
                    />
                  </label>
                ))}
                <fieldset className="portal-quiz-correct-pick" disabled={editingAttemptCount > 0}>
                  <legend>Correct answer</legend>
                  {OPTION_LABELS.map((label, oi) => (
                    <label key={oi}>
                      <input
                        type="radio"
                        name={`correct-${idx}`}
                        checked={Number(q.correctAnswer) === oi}
                        onChange={() => updateQuestion(idx, { correctAnswer: oi })}
                      />{' '}
                      {label}
                    </label>
                  ))}
                </fieldset>
              </div>
            ))}

            <button
              type="button"
              className="teacher-quizzes__add-q"
              disabled={editingAttemptCount > 0}
              onClick={() => setForm({ ...form, questions: [...form.questions, { ...EMPTY_Q }] })}
            >
              + Add question
            </button>
            <button type="submit">{editingId ? 'Save quiz' : 'Publish quiz'}</button>
            {editingId ? (
              <button type="button" className="teacher-quizzes__btn" onClick={resetForm}>
                Cancel edit
              </button>
            ) : (
              <button type="button" className="teacher-quizzes__btn" onClick={resetForm}>
                Cancel
              </button>
            )}
          </form>
        </aside>
        ) : null}

        <section className="teacher-quizzes__library">
          <div className="teacher-quizzes__library-head">
            <h2>Your quizzes</h2>
            <div className="teacher-quizzes__library-actions">
              {renderCourseFilter(quizCourseFilter, setQuizCourseFilter, filteredQuizzes.length)}
              {!showForm ? (
                <button
                  type="button"
                  className="teacher-quizzes__make-btn"
                  onClick={() => setShowForm(true)}
                >
                  <i className="fas fa-plus" aria-hidden="true" /> Make a quiz
                </button>
              ) : null}
            </div>
          </div>
          <div className="teacher-quizzes__list-wrap">
            <table className="teacher-quizzes__table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Course</th>
                  <th>Questions</th>
                  <th>Max marks</th>
                  <th>Due</th>
                  <th>Submissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizGroups
                  ? quizGroups.flatMap((group) => [
                      <tr key={`head-${group.courseId}`} className="teacher-quizzes__course-row">
                        <td colSpan={7}>
                          <span className="portal-course-group__title">{group.title}</span>
                        </td>
                      </tr>,
                      ...renderQuizRows(group.items),
                    ])
                  : renderQuizRows(filteredQuizzes)}
              </tbody>
            </table>
            {!filteredQuizzes.length ? (
              <p className="teacher-quizzes__empty">
                {quizCourseFilter === 'all' ? 'No quizzes yet.' : 'No quizzes for this course.'}
              </p>
            ) : null}
          </div>
        </section>

        <section className="teacher-quizzes__submissions" ref={submissionsRef}>
          <div className="teacher-quizzes__submissions-head">
            <h2>Student submissions</h2>
            <div className="teacher-quizzes__submissions-filter">
              {renderCourseFilter(submissionCourseFilter, (value) => {
                setSubmissionCourseFilter(value);
                setQuizFilter('');
              }, filteredAttempts.length)}
              <label className="teacher-quizzes__quiz-filter">
                <span className="teacher-quizzes__course-filter-label">Filter by quiz</span>
                <select
                  value={quizFilter}
                  onChange={(e) => setQuizFilter(e.target.value)}
                  aria-label="Filter by quiz"
                >
                <option value="">All quizzes</option>
                {quizzesForSubmissionFilter.map((q) => (
                  <option key={portalDocId(q)} value={portalDocId(q)}>
                    {q.title}
                  </option>
                ))}
                </select>
              </label>
              {quizFilter ? (
                <button type="button" className="teacher-quizzes__btn" onClick={() => setQuizFilter('')}>
                  Clear quiz filter
                </button>
              ) : null}
            </div>
          </div>
          <div className="teacher-quizzes__list-wrap">
            <table className="teacher-quizzes__table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Roll no.</th>
                  <th>Quiz</th>
                  <th>Course</th>
                  <th>Score</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attemptGroups.flatMap((group) => [
                  <tr key={`sub-head-${group.courseId}`} className="teacher-quizzes__course-row">
                    <td colSpan={7}>
                      <span className="portal-course-group__title">{group.title}</span>
                    </td>
                  </tr>,
                  ...renderAttemptRows(group.items),
                ])}
              </tbody>
            </table>
            {!filteredAttempts.length ? (
              <p className="teacher-quizzes__empty">
                {quizFilter
                  ? 'No submissions for this quiz yet.'
                  : submissionCourseFilter === 'all'
                    ? 'No student quiz submissions yet.'
                    : 'No submissions for this course yet.'}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      {detailAttempt ? (
        <PortalModal
          title={`${detailAttempt.student?.name} — ${detailAttempt.quiz?.title || 'Quiz'}`}
          onClose={() => setDetailAttempt(null)}
          wide
        >
          <p>
            <strong>Score:</strong>{' '}
            {detailAttempt.scoreDisplay || formatScore(detailAttempt.score, detailAttempt.quiz?.totalMarks)}
          </p>
          {detailAttempt.review ? <QuizReviewPanel review={detailAttempt.review} /> : null}
        </PortalModal>
      ) : null}

      {msg ? <div className="teacher-quizzes__toast" role="status">{msg}</div> : null}
    </div>
  );
};

export default TeacherQuizzes;
