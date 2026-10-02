import React, { useCallback, useEffect, useMemo, useState } from 'react';
import RequiredMark from '../../../shared/RequiredMark';
import FileUploadField from '../../../Portals/shared/FileUploadField';
import LmsCollapsibleFormPanel from '../../shared/LmsCollapsibleFormPanel';
import { useAdminDialog } from '../../AdminDialogContext';
import QuizPreviewModal from '../../../Portals/shared/QuizPreviewModal';
import { PortalActivityBanner } from '../../../Portals/shared/PortalUi';
import { collectQuizUpdateNotices } from '../../../../utils/adminEditNotices';
import { ADMIN_SEEN_QUIZ_UPDATES, markPortalPageVisited } from '../../../../utils/portalNewItems';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch, lmsAdminDelete } from '../../../../utils/lmsAdminApi';
import { hasLmsUploadValue, resolveLmsUploadList } from '../../../../utils/fileUploadApi';
import { AUTH_REALM } from '../../../../utils/authStorage';
import './AdminQuizzesTab.scss';

const EMPTY_Q = { question: '', options: ['', '', ''], correctAnswer: 0 };
const OPTION_LABELS = ['A', 'B', 'C'];

const EMPTY_FORM = {
  quizType: 'mcq',
  title: '',
  courseId: '',
  teacherId: '',
  totalMarks: '',
  dueDate: '',
  resourceLink: '',
  resourceFiles: [],
  questions: [{ ...EMPTY_Q }],
};

function quizFiles(quiz) {
  const files = Array.isArray(quiz?.attachments) ? quiz.attachments.filter(Boolean) : [];
  if (quiz?.resourceFileUrl && !files.includes(quiz.resourceFileUrl)) files.unshift(quiz.resourceFileUrl);
  return files;
}

const AdminQuizzesTab = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [courses, setCourses] = useState([]);
  const [courseTeachers, setCourseTeachers] = useState({});
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingAttemptCount, setEditingAttemptCount] = useState(0);
  const [form, setForm] = useState({ ...EMPTY_FORM, questions: [{ ...EMPTY_Q }] });
  const [viewQuiz, setViewQuiz] = useState(null);
  const [updateTick, setUpdateTick] = useState(0);

  const load = useCallback(async () => {
    const res = await lmsAdminGet('/quizzes');
    if (!res.success) throw new Error(res.error || 'Failed to load quizzes');
    setCourses(res.courses || []);
    setCourseTeachers(res.courseTeachers || {});
    setQuizzes(res.quizzes || []);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => showAlert(err.message || 'Failed to load quizzes', 'error'))
      .finally(() => setLoading(false));
  }, [load, showAlert]);

  const teachersForCourse = courseTeachers[String(form.courseId)] || [];
  const quizUpdateNotices = useMemo(
    () => collectQuizUpdateNotices(quizzes, { storageKey: ADMIN_SEEN_QUIZ_UPDATES, audience: 'admin' }),
    [quizzes, updateTick]
  );

  const resetForm = () => {
    setEditingId(null);
    setEditingAttemptCount(0);
    setForm({ ...EMPTY_FORM, questions: [{ ...EMPTY_Q }] });
    setExpanded(false);
  };

  const updateQuestion = (idx, patch) => {
    setForm((current) => {
      const questions = [...current.questions];
      questions[idx] = { ...questions[idx], ...patch };
      return { ...current, questions };
    });
  };

  const startEdit = (quiz) => {
    const pad3 = (opts) => {
      const next = [...(opts || [])];
      while (next.length < 3) next.push('');
      return next.slice(0, 3);
    };
    setEditingId(quiz._id);
    setEditingAttemptCount(quiz.attemptCount || 0);
    setForm({
      quizType: quiz.quizType === 'file' ? 'file' : 'mcq',
      title: quiz.title || '',
      courseId: String(quiz.course?._id || quiz.course || ''),
      teacherId: String(quiz.teacher?._id || quiz.teacher || ''),
      totalMarks: quiz.totalMarks != null ? String(quiz.totalMarks) : '',
      dueDate: quiz.dueDate ? new Date(quiz.dueDate).toISOString().slice(0, 10) : '',
      resourceLink: quiz.resourceLink || '',
      resourceFiles: quizFiles(quiz),
      questions: quiz.questions?.length
        ? quiz.questions.map((q) => ({
            question: q.question || '',
            options: pad3(q.options),
            correctAnswer: q.correctAnswer ?? 0,
          }))
        : [{ ...EMPTY_Q }],
    });
    setExpanded(true);
  };

  const saveQuiz = async (e) => {
    e.preventDefault();
    const quizType = form.quizType === 'file' ? 'file' : 'mcq';
    const link = String(form.resourceLink || '').trim();
    let questions = [];
    if (quizType === 'file') {
      if (!link && !hasLmsUploadValue(form.resourceFiles)) {
        showAlert('Add a reading link or at least one study file.', 'warning');
        return;
      }
    } else {
      const orphanIndex = form.questions.findIndex(
        (q) => !String(q.question || '').trim() && (q.options || []).some((o) => String(o).trim())
      );
      if (orphanIndex !== -1) {
        showAlert(
          `Question ${orphanIndex + 1} has an option filled in but no question text.`,
          'warning'
        );
        return;
      }
      questions = form.questions
        .filter((q) => String(q.question || '').trim())
        .map((q) => ({
          question: String(q.question).trim(),
          options: (q.options || []).slice(0, 3).map((o) => String(o).trim()),
          correctAnswer: Number(q.correctAnswer) || 0,
        }));
      if (!questions.length) {
        showAlert('Add at least one question with 3 options.', 'warning');
        return;
      }
      for (const q of questions) {
        if (q.options.filter(Boolean).length < 3) {
          showAlert('Each question needs 3 options (A, B, C).', 'warning');
          return;
        }
      }
    }
    setSaving(true);
    try {
      const attachments =
        quizType === 'file' ? await resolveLmsUploadList(form.resourceFiles, 'quizzes', AUTH_REALM.ADMIN) : [];
      const body = {
        quizType,
        courseId: form.courseId,
        teacherId: form.teacherId,
        title: form.title,
        totalMarks: quizType === 'file' || form.totalMarks === '' ? null : Number(form.totalMarks),
        dueDate: form.dueDate || null,
        resourceLink: quizType === 'file' ? link : '',
        attachments,
        resourceFileUrl: attachments[0] || '',
        questions,
      };
      const res = editingId
        ? await lmsAdminPatch(`/quizzes/${editingId}`, body)
        : await lmsAdminPost('/quizzes', body);
      if (!res.success) throw new Error(res.error || 'Failed to save quiz');
      showAlert(editingId ? 'Quiz updated.' : 'Quiz published. Teachers will see it with an Admin label.', 'success');
      resetForm();
      await load();
    } catch (err) {
      showAlert(err.message || 'Failed to save quiz', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeQuiz = async (quiz) => {
    const ok = await showConfirm({
      title: 'Delete quiz?',
      message: `Delete "${quiz.title}"? Students will no longer see it.`,
      confirmLabel: 'Delete',
      type: 'warning',
    });
    if (!ok) return;
    try {
      const res = await lmsAdminDelete(`/quizzes/${quiz._id}`);
      if (!res.success) throw new Error(res.error || 'Failed to delete quiz');
      showAlert('Quiz deleted.', 'success');
      if (editingId === quiz._id) resetForm();
      await load();
    } catch (err) {
      showAlert(err.message || 'Failed to delete quiz', 'error');
    }
  };

  const grouped = useMemo(() => quizzes, [quizzes]);

  return (
    <div className="lms-panel admin-quizzes">
      <LmsCollapsibleFormPanel
        title={editingId ? 'Edit quiz' : 'Create quiz'}
        subtitle={
          form.quizType === 'file'
            ? 'Share a reading link or files. Teachers see an Admin label. Students do not.'
            : 'Multiple-choice quiz with options A, B, and C.'
        }
        icon="fa-question-circle"
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      >
        <div className="admin-quizzes__type-toggle" role="tablist">
          <button
            type="button"
            className={form.quizType !== 'file' ? 'is-active' : ''}
            disabled={Boolean(editingId)}
            onClick={() => setForm((f) => ({ ...f, quizType: 'mcq' }))}
          >
            MCQ Quiz
          </button>
          <button
            type="button"
            className={form.quizType === 'file' ? 'is-active' : ''}
            disabled={Boolean(editingId)}
            onClick={() => setForm((f) => ({ ...f, quizType: 'file' }))}
          >
            File / Reading Quiz
          </button>
        </div>
        <form className="lms-form-grid portal-form-card" onSubmit={saveQuiz} autoComplete="off">
          <label className="lms-field-label">
            <span>Title <RequiredMark /></span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label className="lms-field-label">
            <span>Course <RequiredMark /></span>
            <select
              value={form.courseId}
              onChange={(e) => setForm({ ...form, courseId: e.target.value, teacherId: '' })}
              required
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>{c.title}</option>
              ))}
            </select>
          </label>
          <label className="lms-field-label">
            <span>Teacher <RequiredMark /></span>
            <select
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
              required
              disabled={!form.courseId}
            >
              <option value="">Select teacher</option>
              {teachersForCourse.map((t) => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </label>
          {form.quizType !== 'file' ? (
            <label className="lms-field-label">
              <span>Total marks (optional)</span>
              <input
                type="number"
                min="1"
                value={form.totalMarks}
                onChange={(e) => setForm({ ...form, totalMarks: e.target.value })}
              />
            </label>
          ) : null}
          <label className="lms-field-label">
            <span>Due date (optional)</span>
            <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </label>
          {form.quizType === 'file' ? (
            <>
              <label className="lms-field-label">
                <span>Reading link {hasLmsUploadValue(form.resourceFiles) ? '(optional)' : <RequiredMark />}</span>
                <input
                  type="url"
                  placeholder="https://..."
                  value={form.resourceLink}
                  onChange={(e) => setForm({ ...form, resourceLink: e.target.value })}
                />
              </label>
              <FileUploadField
                label="Study files"
                multiple
                value={form.resourceFiles}
                onChange={(files) => setForm({ ...form, resourceFiles: files })}
                category="quizzes"
              />
            </>
          ) : null}
          {form.quizType !== 'file'
            ? form.questions.map((q, idx) => (
                <div key={idx} className="admin-quizzes__question">
                  <div className="admin-quizzes__question-label">Question {idx + 1}</div>
                  <label className="lms-field-label">
                    <span>Question text{idx === 0 ? <RequiredMark /> : null}</span>
                    <input
                      value={q.question}
                      disabled={editingAttemptCount > 0}
                      onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                      required={idx === 0}
                    />
                  </label>
                  {OPTION_LABELS.map((label, oi) => (
                    <div key={oi} className="admin-quizzes__option-row">
                      <label className="admin-quizzes__option-radio">
                        <input
                          type="radio"
                          name={`admin-correct-${idx}`}
                          checked={Number(q.correctAnswer) === oi}
                          disabled={editingAttemptCount > 0}
                          onChange={() => updateQuestion(idx, { correctAnswer: oi })}
                        />
                        <span>{label}</span>
                      </label>
                      <input
                        value={(q.options || [])[oi] || ''}
                        disabled={editingAttemptCount > 0}
                        required={idx === 0}
                        aria-label={`Option ${label}`}
                        onChange={(e) => {
                          const options = [...(q.options || ['', '', ''])];
                          options[oi] = e.target.value;
                          updateQuestion(idx, { options });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ))
            : null}
          {form.quizType !== 'file' ? (
            <button
              type="button"
              className="admin-quizzes__add"
              disabled={editingAttemptCount > 0}
              onClick={() => setForm({ ...form, questions: [...form.questions, { ...EMPTY_Q }] })}
            >
              + Add question
            </button>
          ) : null}
          <div className="admin-quizzes__actions">
            <button type="submit" className="admin-quizzes__publish" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save quiz' : 'Publish quiz'}
            </button>
            <button type="button" className="admin-quizzes__cancel" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      </LmsCollapsibleFormPanel>

      <PortalActivityBanner
        title="Quiz updates"
        rows={quizUpdateNotices}
        onDismiss={() => {
          markPortalPageVisited(ADMIN_SEEN_QUIZ_UPDATES);
          setUpdateTick((n) => n + 1);
        }}
      />

      <div className="admin-quizzes__list">
        <h3>Quizzes</h3>
        {loading ? <p>Loading quizzes…</p> : null}
        {!loading && grouped.length === 0 ? <p>No quizzes yet.</p> : null}
        {grouped.length ? (
          <div className="portal-data-table-wrap">
            <table className="portal-data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Course</th>
                  <th>Teacher</th>
                  <th>From</th>
                  <th>Taken</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((quiz) => (
                  <tr key={quiz._id}>
                    <td>{quiz.title}</td>
                    <td>{quiz.quizType === 'file' ? 'File / Reading' : 'MCQ'}</td>
                    <td>{quiz.course?.title || '—'}</td>
                    <td>{quiz.teacher?.name || '—'}</td>
                    <td>{quiz.createdByRole === 'admin' || quiz.lockedForTeacher ? 'Admin' : 'Teacher'}</td>
                    <td>{quiz.attemptCount || 0}</td>
                    <td className="lms-table-actions">
                      <button type="button" className="lms-btn-secondary" onClick={() => setViewQuiz(quiz)}>
                        <i className="fas fa-eye" aria-hidden /> View
                      </button>
                      <button type="button" className="lms-btn-secondary" onClick={() => startEdit(quiz)}>
                        Edit
                      </button>
                      <button type="button" className="lms-btn-trash" onClick={() => removeQuiz(quiz)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      <QuizPreviewModal quiz={viewQuiz} tone="admin" showCorrect onClose={() => setViewQuiz(null)} />
    </div>
  );
};

export default AdminQuizzesTab;
