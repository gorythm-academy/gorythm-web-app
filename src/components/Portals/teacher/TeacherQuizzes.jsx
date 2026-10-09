import React, { useEffect, useMemo, useRef, useState } from 'react';
import RequiredMark from '../../shared/RequiredMark';
import { portalGet, portalPost, portalPatch, portalDelete } from '../shared/portalApi';
import { hasLmsUploadValue, resolveLmsUploadList } from '../../../utils/fileUploadApi';
import FileUploadField from '../shared/FileUploadField';
import { PortalDataSection, PortalAlert, PortalPageHeader, PortalActivityBanner } from '../shared/PortalUi';
import QuizPreviewModal from '../shared/QuizPreviewModal';
import { collectQuizUpdateNotices } from '../../../utils/adminEditNotices';
import { TEACHER_SEEN_QUIZ_UPDATES } from '../../../utils/portalNewItems';
import { portalDocId } from '../../../utils/portalDocId';
import { formatScheduleLabel, formatScheduleTimeLabel } from '../../../utils/formatScheduleLabel';
import { formatScore } from '../../../utils/formatScore';
import { usePortalDialog } from '../shared/PortalDialogContext';
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
  quizType: 'mcq',
  title: '',
  courseId: '',
  scheduleIds: [],
  scheduleId: '',
  totalMarks: '',
  dueDate: '',
  resourceLink: '',
  resourceFiles: [],
  questions: [{ ...EMPTY_Q }],
};

const isAdminQuiz = (quiz) => !!(quiz?.lockedForTeacher || quiz?.createdByRole === 'admin');

function quizFiles(quiz) {
  const files = Array.isArray(quiz?.attachments) ? quiz.attachments.filter(Boolean) : [];
  if (quiz?.resourceFileUrl && !files.includes(quiz.resourceFileUrl)) files.unshift(quiz.resourceFileUrl);
  return files;
}
const OPTION_LABELS = ['A', 'B', 'C'];

const TeacherQuizzes = () => {
  const { showAlert, showConfirm } = usePortalDialog();
  const [courses, setCourses] = useState([]);
  const [teacherSchedules, setTeacherSchedules] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingAttemptCount, setEditingAttemptCount] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(null);
  const [quizCourseFilter, setQuizCourseFilter] = useState('all');
  const [submissionCourseFilter, setSubmissionCourseFilter] = useState('all');
  const [quizFilter, setQuizFilter] = useState('');
  const submissionsRef = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [viewQuiz, setViewQuiz] = useState(null);
  const [updateTick, setUpdateTick] = useState(0);
  const [form, setForm] = useState({ ...EMPTY_FORM, questions: [{ ...EMPTY_Q }] });
  const [loadError, setLoadError] = useState('');

  const notify = (message, type = 'info') => showAlert({ message, type });

  const quizUpdateNotices = useMemo(() => {
    void updateTick;
    return collectQuizUpdateNotices(quizzes, { storageKey: TEACHER_SEEN_QUIZ_UPDATES, audience: 'teacher' });
  }, [quizzes, updateTick]);

  const reload = async () => {
    setLoadError('');
    const results = await Promise.allSettled([
      portalGet('/teacher/courses'),
      portalGet('/teacher/schedule'),
      portalGet('/teacher/quizzes'),
      portalGet('/teacher/quiz-attempts'),
    ]);
    const [c, sch, q, a] = results;
    if (c.status === 'fulfilled' && c.value.success) setCourses(c.value.courses || []);
    else setLoadError((prev) => prev || (c.status === 'fulfilled' ? c.value.error : c.reason?.message) || 'Could not load courses.');
    if (sch.status === 'fulfilled' && sch.value.success) setTeacherSchedules(sch.value.schedules || []);
    else setLoadError((prev) => prev || (sch.status === 'fulfilled' ? sch.value.error : sch.reason?.message) || 'Could not load class slots.');
    if (q.status === 'fulfilled' && q.value.success) setQuizzes(q.value.quizzes || []);
    else setLoadError((prev) => prev || (q.status === 'fulfilled' ? q.value.error : q.reason?.message) || 'Could not load quizzes.');
    if (a.status === 'fulfilled' && a.value.success) {
      setAttempts(a.value.attempts || []);
    } else {
      setLoadError((prev) => prev || (a.status === 'fulfilled' ? a.value.error : a.reason?.message) || 'Could not load quiz submissions.');
    }
  };

  const courseOptions = useMemo(
    () => courses.map((c) => ({ _id: portalDocId(c), title: c.title })),
    [courses]
  );

  const courseScheduleOptions = useMemo(() => {
    if (!form.courseId) return [];
    return teacherSchedules.filter(
      (slot) => String(slot.course?._id || slot.course) === String(form.courseId)
    );
  }, [teacherSchedules, form.courseId]);

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
    return () => markPortalPageVisited(SEEN_QUIZ_ATTEMPTS_KEY);
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setEditingAttemptCount(0);
    setForm({ ...EMPTY_FORM, questions: [{ ...EMPTY_Q }] });
    setShowForm(false);
  };

  const updateQuestion = (idx, patch) => {
    setForm((f) => {
      const questions = [...f.questions];
      questions[idx] = { ...questions[idx], ...patch };
      return { ...f, questions };
    });
  };

  const saveQuiz = async (e) => {
    e.preventDefault();
    const quizType = form.quizType === 'file' ? 'file' : 'mcq';
    const link = String(form.resourceLink || '').trim();

    let questions = [];
    if (quizType === 'file') {
      if (!link && !hasLmsUploadValue(form.resourceFiles)) {
        notify('Add a reading link or at least one study file for a file/reading quiz.', 'warning');
        return;
      }
    } else {
      const orphanIndex = form.questions.findIndex(
        (q) => !q.question.trim() && (q.options || []).some((o) => String(o).trim())
      );
      if (orphanIndex !== -1) {
        notify(
          `Question ${orphanIndex + 1} has an option filled in but no question text. Add the question text or clear its options before publishing.`,
          'warning'
        );
        return;
      }
      questions = form.questions
        .filter((q) => q.question.trim())
        .map((q) => ({
          question: q.question.trim(),
          options: (q.options || []).slice(0, 3).map((o) => String(o).trim()),
          correctAnswer: Number(q.correctAnswer) || 0,
        }));
      if (!questions.length) {
        notify('Add at least one question with 3 options.', 'warning');
        return;
      }
      for (const q of questions) {
        if (q.options.filter(Boolean).length < 3) {
          notify('Each question needs 3 options (A, B, C).', 'warning');
          return;
        }
      }
    }
    if (editingId) {
      if (!form.scheduleId) {
        notify('Select a class slot.', 'warning');
        return;
      }
    } else if (!form.scheduleIds.length) {
      notify('Select at least one class slot.', 'warning');
      return;
    }
    const body = {
      quizType,
      courseId: form.courseId,
      ...(editingId ? { scheduleId: form.scheduleId } : { scheduleIds: form.scheduleIds }),
      title: form.title,
      totalMarks: quizType === 'file' || form.totalMarks === '' ? null : Number(form.totalMarks),
      dueDate: form.dueDate || null,
      resourceLink: quizType === 'file' ? link : '',
      attachments: [],
      resourceFileUrl: '',
      questions,
    };
    try {
      if (quizType === 'file') {
        body.attachments = await resolveLmsUploadList(form.resourceFiles, 'quizzes');
        body.resourceFileUrl = body.attachments[0] || '';
      }
      if (editingId) {
        const id = portalDocId(editingId);
        if (!id) {
          notify('Cannot save: click Edit on the quiz row first.', 'error');
          return;
        }
        await portalPatch(`/teacher/quizzes/${id}`, body);
        notify('Quiz updated.', 'success');
      } else {
        const result = await portalPost('/teacher/quizzes', body);
        const n = result.createdCount || 1;
        notify(
          `${n} quiz${n === 1 ? '' : 'zes'} published. Visible only to students on the selected class slot${n === 1 ? '' : 's'}.`,
          'success'
        );
      }
      resetForm();
      reload();
    } catch (err) {
      notify(err.message || 'Failed', 'error');
    }
  };

  const startEdit = (q) => {
    const id = portalDocId(q);
    if (!id) {
      notify('This quiz has no id — refresh the page.', 'error');
      return;
    }
    if (isAdminQuiz(q)) {
      notify('This quiz was published by admin. You can view results, but not edit it.', 'warning');
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
      quizType: q.quizType === 'file' ? 'file' : 'mcq',
      title: q.title || '',
      courseId: String(q.course?._id || q.course || ''),
      scheduleIds: [],
      scheduleId: String(q.assignedSchedule?._id || q.assignedSchedule || ''),
      totalMarks: q.totalMarks != null ? String(q.totalMarks) : '',
      dueDate: q.dueDate ? new Date(q.dueDate).toISOString().slice(0, 10) : '',
      resourceLink: q.resourceLink || '',
      resourceFiles: quizFiles(q),
      questions: q.questions?.length
        ? q.questions.map((qu) => ({
            question: qu.question || '',
            options: pad3(qu.options),
            correctAnswer: qu.correctAnswer ?? 0,
          }))
        : [{ ...EMPTY_Q }],
    });
    setShowForm(true);
  };

  const deleteQuiz = async (q) => {
    const ok = await showConfirm({
      title: 'Delete quiz?',
      message: `Delete quiz "${q.title}"?`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await portalDelete(`/teacher/quizzes/${portalDocId(q)}`);
      notify('Quiz deleted.', 'success');
      reload();
    } catch (err) {
      notify(err.message || 'Failed', 'error');
    }
  };

  const viewAttempts = (q) => {
    const id = portalDocId(q);
    if (!id) {
      notify('Quiz id missing.', 'error');
      return;
    }
    setSubmissionCourseFilter('all');
    setQuizFilter(id);
    submissionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderCourseFilter = (value, onChange, count) => (
    <label className="teacher-quizzes__course-filter">
      <span className="teacher-quizzes__course-filter-label">
        Filter by course
        {value ? <span className="teacher-quizzes__course-filter-meta">{count} shown</span> : null}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by course">
        <option value="all">All courses</option>
        {courseOptions.map((c) => (
          <option key={c._id} value={c._id}>
            {c.title}
          </option>
        ))}
      </select>
    </label>
  );

  const renderQuizRows = (rows) =>
    rows.map((r) => (
      <tr key={portalDocId(r)}>
        <td>
          {r.title}
          {isAdminQuiz(r) ? (
            <span className="teacher-quizzes__admin-badge" title="Published by admin">
              Admin
            </span>
          ) : null}
        </td>
        <td>
          <span
            className={`teacher-quizzes__type-pill teacher-quizzes__type-pill--${
              r.quizType === 'file' ? 'file' : 'mcq'
            }`}
          >
            {r.quizType === 'file' ? 'File / Reading' : 'MCQ'}
          </span>
        </td>
        <td>{r.course?.title}</td>
        <td>{r.assignedSchedule ? formatScheduleTimeLabel(r.assignedSchedule) : '—'}</td>
        <td>
          {r.quizType === 'file' ? '—' : <span className="teacher-quizzes__pill">{r.questions?.length ?? 0}</span>}
        </td>
        <td>{r.quizType === 'file' ? '—' : r.totalMarks != null ? r.totalMarks : '—'}</td>
        <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
        <td>{r.attemptCount > 0 ? `${r.attemptCount} taken` : 'None yet'}</td>
        <td>
          <div className="teacher-quizzes__row-actions">
            <button type="button" className="teacher-quizzes__btn teacher-quizzes__btn--ghost teacher-quizzes__btn--small" onClick={() => setViewQuiz(r)}>
              View
            </button>
            <button type="button" className="teacher-quizzes__btn teacher-quizzes__btn--ghost teacher-quizzes__btn--small" onClick={() => viewAttempts(r)}>
              Results
            </button>
            {isAdminQuiz(r) ? null : (
              <>
                <button type="button" className="teacher-quizzes__btn teacher-quizzes__btn--ghost teacher-quizzes__btn--small" onClick={() => startEdit(r)}>
                  Edit
                </button>
                <button type="button" className="teacher-quizzes__btn teacher-quizzes__btn--danger teacher-quizzes__btn--small" onClick={() => deleteQuiz(r)}>
                  Delete
                </button>
              </>
            )}
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
            className="teacher-quizzes__btn teacher-quizzes__btn--primary teacher-quizzes__btn--small"
            onClick={() => setDetailAttempt(r)}
          >
            View answers
          </button>
        </td>
      </tr>
    ));

  if (loading) {
    return (
      <div className="portal-page teacher-quizzes">
        <PortalPageHeader
          title="Quizzes"
          subtitle="Build multiple-choice quizzes. Students see green/red feedback after submitting."
        />
        <PortalDataSection loading loadingLabel="Loading quizzes…" />
      </div>
    );
  }

  return (
    <div className="portal-page teacher-quizzes">
      <PortalPageHeader
        title="Quizzes"
        subtitle="Build multiple-choice quizzes. Students see green/red feedback after submitting."
      />
      {loadError ? <PortalAlert type="error">{loadError}</PortalAlert> : null}
      <PortalActivityBanner
        title="Quiz updates"
        rows={quizUpdateNotices}
        onDismiss={() => {
          markPortalPageVisited(TEACHER_SEEN_QUIZ_UPDATES);
          setUpdateTick((n) => n + 1);
        }}
      />

      <div className="teacher-quizzes__layout">

        <div className="teacher-quizzes__main">
        <section className="teacher-quizzes__library">
          <div className="teacher-quizzes__library-head">
            <h2>Your Quizzes</h2>
            <div className="teacher-quizzes__library-actions">
              {renderCourseFilter(quizCourseFilter, setQuizCourseFilter, filteredQuizzes.length)}
              {!showForm ? (
                <button
                  type="button"
                  className="teacher-quizzes__make-btn"
                  onClick={() => setShowForm(true)}
                >
                  <i className="fas fa-plus" aria-hidden="true" /> Make a Quiz
                </button>
              ) : null}
            </div>
          </div>
        {showForm ? (
        <aside className="teacher-quizzes__form-panel">
          <div className="teacher-quizzes__form-head">
            <div className="teacher-quizzes__form-icon" aria-hidden="true">
              <i className="fas fa-question-circle" />
            </div>
            <div>
              <h2>{editingId ? 'Edit quiz' : 'Create quiz'}</h2>
              <p>
                {form.quizType === 'file'
                  ? 'Share a reading link or file — no scored questions.'
                  : 'Each question has three options (A, B, C).'}
              </p>
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

          <div className="teacher-quizzes__type-toggle" role="tablist" aria-label="Quiz type">
            <button
              type="button"
              role="tab"
              aria-selected={form.quizType !== 'file'}
              className={`teacher-quizzes__type-toggle-btn${form.quizType !== 'file' ? ' is-active' : ''}`}
              disabled={Boolean(editingId)}
              onClick={() => setForm((f) => ({ ...f, quizType: 'mcq' }))}
            >
              <i className="fas fa-list-check" aria-hidden="true" /> MCQ Quiz
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={form.quizType === 'file'}
              className={`teacher-quizzes__type-toggle-btn${form.quizType === 'file' ? ' is-active' : ''}`}
              disabled={Boolean(editingId)}
              onClick={() => setForm((f) => ({ ...f, quizType: 'file' }))}
            >
              <i className="fas fa-file-lines" aria-hidden="true" /> File / Reading Quiz
            </button>
          </div>

          <form onSubmit={saveQuiz} autoComplete="off">
            <label className="portal-field-label">
              <span>Title <RequiredMark /></span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label className="portal-field-label">
              <span>Course <RequiredMark /></span>
              <select
                value={form.courseId}
                onChange={(e) =>
                  setForm({ ...form, courseId: e.target.value, scheduleIds: [], scheduleId: '' })
                }
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
            {editingId ? (
              <label className="portal-field-label">
                <span>Class slot <RequiredMark /></span>
                <select
                  value={form.scheduleId}
                  onChange={(e) => setForm({ ...form, scheduleId: e.target.value })}
                  required
                >
                  <option value="">Select class slot</option>
                  {courseScheduleOptions.map((slot) => (
                    <option key={slot._id} value={slot._id}>
                      {formatScheduleLabel(slot)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="teacher-quizzes__slot-select">
                <div className="teacher-quizzes__slot-head">
                  <span>Class slots <RequiredMark /></span>
                  {courseScheduleOptions.length ? (
                    <label className="teacher-quizzes__slot-all">
                      <input
                        type="checkbox"
                        checked={
                          courseScheduleOptions.length > 0 &&
                          courseScheduleOptions.every((slot) =>
                            form.scheduleIds.includes(String(slot._id))
                          )
                        }
                        onChange={() => {
                          const allIds = courseScheduleOptions.map((slot) => String(slot._id));
                          const allSelected =
                            allIds.length > 0 && allIds.every((id) => form.scheduleIds.includes(id));
                          setForm({ ...form, scheduleIds: allSelected ? [] : allIds });
                        }}
                      />
                      <span>Select all</span>
                    </label>
                  ) : null}
                </div>
                {form.courseId && courseScheduleOptions.length ? (
                  <div className="teacher-quizzes__slot-grid">
                    {courseScheduleOptions.map((slot) => {
                      const id = String(slot._id);
                      return (
                        <label key={id} className="teacher-quizzes__slot-item">
                          <input
                            type="checkbox"
                            checked={form.scheduleIds.includes(id)}
                            onChange={() =>
                              setForm({
                                ...form,
                                scheduleIds: form.scheduleIds.includes(id)
                                  ? form.scheduleIds.filter((rowId) => rowId !== id)
                                  : [...form.scheduleIds, id],
                              })
                            }
                          />
                          <span>{formatScheduleLabel(slot)}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="teacher-quizzes__slot-hint">
                    {form.courseId
                      ? 'No class times are listed for this course yet. Please contact the academy.'
                      : 'Select a course to choose class times.'}
                  </p>
                )}
              </div>
            )}
            {form.quizType !== 'file' ? (
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
            ) : null}
            <label className="portal-field-label">
              <span>Due date (optional)</span>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            {form.quizType === 'file' ? (
              <>
                <label className="portal-field-label">
                  <span>
                    Reading link {!hasLmsUploadValue(form.resourceFiles) ? <RequiredMark /> : '(optional)'}
                  </span>
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
                <p className="portal-field-hint">
                  Add a reading link, one or more files, or both <RequiredMark />
                </p>
              </>
            ) : null}

            {form.quizType !== 'file' ? (
              <>
                <p className="portal-field-hint">At least one complete question (text and all three options) is required <RequiredMark /></p>

                {form.questions.map((q, idx) => (
                  <div
                    key={idx}
                    className={`teacher-quizzes__question-card${editingAttemptCount > 0 ? ' teacher-quizzes__question-card--locked' : ''}`}
                  >
                    <div className="teacher-quizzes__question-label">Question {idx + 1}</div>
                    <label className="portal-field-label">
                      <span>Question text{idx === 0 ? <RequiredMark /> : null}</span>
                      <input
                        value={q.question}
                        onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                        required={idx === 0}
                        disabled={editingAttemptCount > 0}
                      />
                    </label>
                    <div className="teacher-quizzes__options">
                      <span className="teacher-quizzes__options-label">
                        Options{idx === 0 ? <RequiredMark /> : null}
                      </span>
                      {OPTION_LABELS.map((label, oi) => (
                        <div key={oi} className="teacher-quizzes__option-row">
                          <label className="teacher-quizzes__option-radio">
                            <input
                              type="radio"
                              name={`correct-${idx}`}
                              checked={Number(q.correctAnswer) === oi}
                              disabled={editingAttemptCount > 0}
                              onChange={() => updateQuestion(idx, { correctAnswer: oi })}
                            />
                            <span>{label}</span>
                          </label>
                          <input
                            type="text"
                            value={(q.options || [])[oi] || ''}
                            disabled={editingAttemptCount > 0}
                            placeholder={`Option ${label}`}
                            aria-label={`Option ${label}`}
                            onChange={(e) => {
                              const options = [...(q.options || ['', '', ''])];
                              options[oi] = e.target.value;
                              updateQuestion(idx, { options });
                            }}
                            required={idx === 0}
                          />
                        </div>
                      ))}
                    </div>
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
              </>
            ) : null}
            <div className="teacher-quizzes__form-actions">
              <button type="submit" className="teacher-quizzes__btn teacher-quizzes__btn--primary">
                {editingId ? 'Save quiz' : 'Publish quiz'}
              </button>
              <button type="button" className="teacher-quizzes__btn teacher-quizzes__btn--ghost" onClick={resetForm}>
                {editingId ? 'Cancel edit' : 'Cancel'}
              </button>
            </div>
          </form>
        </aside>
        ) : null}

          <div className="teacher-quizzes__list-wrap">
            <table className="teacher-quizzes__table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Course</th>
                  <th>Class slot</th>
                  <th>Questions</th>
                  <th>Max Marks</th>
                  <th>Due</th>
                  <th>Submissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizGroups
                  ? quizGroups.flatMap((group) => [
                      <tr key={`head-${group.courseId}`} className="teacher-quizzes__course-row">
                        <td colSpan={9}>
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
            <h2>Student Submissions</h2>
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
                    {q.assignedSchedule
                      ? `${q.title} (${formatScheduleTimeLabel(q.assignedSchedule)})`
                      : q.title}
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
                  <th>Roll No.</th>
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
      </div>

      <QuizPreviewModal quiz={viewQuiz} tone="teacher" showCorrect onClose={() => setViewQuiz(null)} />

      <QuizPreviewModal
        quiz={detailAttempt?.quiz || null}
        review={detailAttempt?.review || null}
        attempt={detailAttempt}
        tone="teacher"
        chosenLabel="Student answer"
        heading={
          detailAttempt
            ? `${detailAttempt.student?.name || 'Student'} — ${detailAttempt.quiz?.title || 'Quiz'}`
            : null
        }
        kicker="Student submission"
        onClose={() => setDetailAttempt(null)}
      />
    </div>
  );
};

export default TeacherQuizzes;
