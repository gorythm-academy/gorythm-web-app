import React, { useEffect, useState } from 'react';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import FileUploadField from '../shared/FileUploadField';
import PortalModal from '../shared/PortalModal';
import QuizReviewPanel from '../shared/QuizReviewPanel';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import { portalDocId } from '../../../utils/portalDocId';
import { absFileUrl } from '../../../utils/fileUrl';

const EMPTY_Q = { question: '', options: ['', '', ''], correctAnswer: 0 };
const OPTION_LABELS = ['A', 'B', 'C'];

const TeacherQuizzes = () => {
  const [courses, setCourses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingAttemptCount, setEditingAttemptCount] = useState(0);
  const [attemptsModal, setAttemptsModal] = useState(null);
  const [detailAttempt, setDetailAttempt] = useState(null);
  const [form, setForm] = useState({
    title: '',
    courseId: '',
    totalMarks: '',
    dueDate: '',
    resourceLink: '',
    resourceFileUrl: '',
    questions: [{ ...EMPTY_Q }],
  });

  const reload = () =>
    Promise.all([portalGet('/teacher/courses'), portalGet('/teacher/quizzes')]).then(([c, q]) => {
      if (c.success) setCourses(c.courses || []);
      if (q.success) setQuizzes(q.quizzes || []);
    });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

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
      setEditingId(null);
      setEditingAttemptCount(0);
      setForm({
        title: '',
        courseId: '',
        totalMarks: '',
        dueDate: '',
        resourceLink: '',
        resourceFileUrl: '',
        questions: [{ ...EMPTY_Q }],
      });
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

  const viewAttempts = async (q) => {
    const id = portalDocId(q);
    if (!id) {
      setMsg('Quiz id missing.');
      return;
    }
    try {
      const res = await portalGet(`/teacher/quizzes/${id}/attempts`);
      if (res.success) setAttemptsModal(res);
      else setMsg(res.error || 'Failed');
    } catch (err) {
      setMsg(err.message || 'Failed');
    }
  };

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader
        title="Quizzes"
        subtitle="Each question has 3 options (A/B/C). Students see results with green/red after submit."
      />

      <section className="portal-content-section">
        <h2 className="portal-content-section-title">{editingId ? 'Edit quiz' : 'Create quiz'}</h2>
        {editingId && editingAttemptCount > 0 ? (
          <PortalAlert type="info">
            {editingAttemptCount} student(s) already took this quiz — questions are locked; you can still change
            title, due date, marks, and materials.
          </PortalAlert>
        ) : null}
        <form className="portal-card portal-form-card" onSubmit={saveQuiz} autoComplete="off">
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
            label="Study file (optional text/PDF)"
            value={form.resourceFileUrl}
            onChange={(url) => setForm({ ...form, resourceFileUrl: url })}
          />
          {form.questions.map((q, idx) => (
            <div
              key={idx}
              className="portal-card"
              style={{ padding: '0.75rem', opacity: editingAttemptCount > 0 ? 0.55 : 1 }}
            >
              <label className="portal-field-label">
                <span>Question {idx + 1}</span>
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
                  <label key={oi} style={{ marginRight: '1rem' }}>
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
            className="portal-btn-secondary"
            disabled={editingAttemptCount > 0}
            onClick={() => setForm({ ...form, questions: [...form.questions, { ...EMPTY_Q }] })}
          >
            + Add question
          </button>
          <button type="submit">{editingId ? 'Save quiz' : 'Publish quiz'}</button>
        </form>
      </section>

      <section className="portal-content-section">
        <h2 className="portal-content-section-title">Your quizzes</h2>
        <SimpleTable
          columns={[
            { key: 'title', label: 'Title' },
            { key: 'course', label: 'Course', render: (r) => r.course?.title },
            { key: 'q', label: 'Questions', render: (r) => r.questions?.length ?? 0 },
            { key: 'marks', label: 'Max marks', render: (r) => (r.totalMarks != null ? r.totalMarks : '—') },
            {
              key: 'attempts',
              label: 'Submissions',
              render: (r) => (r.attemptCount > 0 ? `${r.attemptCount} taken` : 'None yet'),
            },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => (
                <div className="portal-table-actions">
                  <button type="button" onClick={() => viewAttempts(r)}>
                    Results
                  </button>
                  <button type="button" onClick={() => startEdit(r)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => deleteQuiz(r)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={quizzes}
          emptyLabel="No quizzes yet."
        />
      </section>

      {attemptsModal ? (
        <PortalModal
          title={`Quiz results — ${attemptsModal.quiz?.title}`}
          onClose={() => {
            setAttemptsModal(null);
            setDetailAttempt(null);
          }}
          wide
        >
          <SimpleTable
            columns={[
              { key: 'student', label: 'Student', render: (r) => r.student?.name },
              { key: 'score', label: 'Score', render: (r) => r.scoreDisplay || r.score },
              {
                key: 'date',
                label: 'Submitted',
                render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'),
              },
              {
                key: 'view',
                label: '',
                render: (r) => (
                  <button type="button" onClick={() => setDetailAttempt(r)}>
                    View full result
                  </button>
                ),
              },
            ]}
            rows={attemptsModal.attempts || []}
            emptyLabel="No attempts yet."
          />
          {detailAttempt ? (
            <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
              <h4>{detailAttempt.student?.name} — full answers</h4>
              <QuizReviewPanel review={detailAttempt.review} />
            </div>
          ) : null}
        </PortalModal>
      ) : null}

      {msg ? <PortalAlert type="info">{msg}</PortalAlert> : null}
    </div>
  );
};

export default TeacherQuizzes;
