import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RequiredMark from '../../../shared/RequiredMark';
import FileUploadField from '../../../Portals/shared/FileUploadField';
import LmsCollapsibleFormPanel from '../../shared/LmsCollapsibleFormPanel';
import LmsTrashTabs from '../../shared/LmsTrashTabs';
import { useAdminDialog } from '../../AdminDialogContext';
import { QUARANTINE_LABEL, MOVE_TO_QUARANTINE_PHRASE, MOVED_TO_QUARANTINE_PHRASE } from '../../../../utils/adminListLabels';
import QuizPreviewModal from '../../../Portals/shared/QuizPreviewModal';
import { PortalActivityBanner } from '../../../Portals/shared/PortalUi';
import { collectQuizUpdateNotices } from '../../../../utils/adminEditNotices';
import { ADMIN_SEEN_QUIZ_UPDATES, markPortalPageVisited } from '../../../../utils/portalNewItems';
import { lmsAdminGet, lmsAdminPost, lmsAdminPatch } from '../../../../utils/lmsAdminApi';
import { hasLmsUploadValue, resolveLmsUploadList } from '../../../../utils/fileUploadApi';
import { AUTH_REALM } from '../../../../utils/authStorage';
import { LmsTargetSelect, filterSchedulesForTargeting } from './lmsTargeting';
import { formatScheduleLabel, formatScheduleTimeLabel } from '../../../../utils/formatScheduleLabel';
import './AdminQuizzesTab.scss';

const EMPTY_Q = { question: '', options: ['', '', ''], correctAnswer: 0 };
const OPTION_LABELS = ['A', 'B', 'C'];

const EMPTY_FORM = {
  quizType: 'mcq',
  title: '',
  courseIds: [],
  teacherIds: [],
  scheduleIds: [],
  courseId: '',
  teacherId: '',
  scheduleId: '',
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
  const [schedules, setSchedules] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingAttemptCount, setEditingAttemptCount] = useState(0);
  const [form, setForm] = useState({ ...EMPTY_FORM, questions: [{ ...EMPTY_Q }] });
  const [viewQuiz, setViewQuiz] = useState(null);
  const [updateTick, setUpdateTick] = useState(0);
  const [listMode, setListMode] = useState('active');
  const [trashCount, setTrashCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const trashQ = listMode === 'trash' ? '?trash=1' : '';
    const res = await lmsAdminGet(`/quizzes${trashQ}`);
    if (seq !== loadSeq.current) return;
    if (!res.success) throw new Error(res.error || 'Failed to load quizzes');
    let nextSchedules = [];
    try {
      const scheduleRes = await lmsAdminGet('/schedules');
      nextSchedules = scheduleRes.schedules || [];
    } catch {
      nextSchedules = [];
    }
    if (seq !== loadSeq.current) return;
    setCourses(res.courses || []);
    setCourseTeachers(res.courseTeachers || {});
    setSchedules(nextSchedules);
    setQuizzes(res.quizzes || []);
    setTrashCount(Number(res.trashCount) || 0);
  }, [listMode]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((err) => {
        if (active) showAlert(err.message || 'Failed to load quizzes', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, showAlert]);

  const teachers = useMemo(() => {
    const byId = new Map();
    Object.values(courseTeachers || {}).forEach((list) => {
      (list || []).forEach((teacher) => {
        if (teacher?._id) byId.set(String(teacher._id), teacher);
      });
    });
    schedules.forEach((slot) => {
      const teacher = slot.teacher;
      if (teacher?._id) byId.set(String(teacher._id), teacher);
    });
    return [...byId.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [courseTeachers, schedules]);
  const teachersForCourse = courseTeachers[String(form.courseId)] || [];
  const quizUpdateNotices = useMemo(() => {
    void updateTick;
    return collectQuizUpdateNotices(quizzes, { storageKey: ADMIN_SEEN_QUIZ_UPDATES, audience: 'admin' });
  }, [quizzes, updateTick]);

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
      courseIds: [],
      teacherIds: [],
      scheduleIds: [],
      courseId: String(quiz.course?._id || quiz.course || ''),
      teacherId: String(quiz.teacher?._id || quiz.teacher || ''),
      scheduleId: String(quiz.assignedSchedule?._id || quiz.assignedSchedule || ''),
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
    if (!editingId && !form.scheduleIds.length) {
      showAlert('Select at least one class slot.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const attachments =
        quizType === 'file' ? await resolveLmsUploadList(form.resourceFiles, 'quizzes', AUTH_REALM.ADMIN) : [];
      const body = {
        quizType,
        ...(editingId
          ? { courseId: form.courseId, teacherId: form.teacherId, scheduleId: form.scheduleId }
          : { scheduleIds: form.scheduleIds }),
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
      if (editingId) {
        showAlert('Quiz updated.', 'success');
      } else {
        const n = res.createdCount ?? 1;
        showAlert(
          `${n} quiz${n === 1 ? '' : 'zes'} published. Visible only to students on the selected class slot${n === 1 ? '' : 's'}.`,
          'success'
        );
      }
      resetForm();
      await load();
    } catch (err) {
      showAlert(err.message || 'Failed to save quiz', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isTrashView = listMode === 'trash';

  const runQuizIds = async (mode, ids, confirmText) => {
    const idList = [...ids].map(String).filter(Boolean);
    if (!idList.length) return;
    const ok = await showConfirm({
      title: mode === 'permanent' ? 'Delete forever?' : mode === 'restore' ? 'Restore quizzes?' : `Move to ${QUARANTINE_LABEL}?`,
      message: confirmText,
      confirmLabel: mode === 'permanent' ? 'Delete forever' : mode === 'restore' ? 'Restore' : QUARANTINE_LABEL,
      type: mode === 'restore' ? 'info' : 'warning',
    });
    if (!ok) return;
    const path =
      mode === 'permanent'
        ? '/quizzes/bulk-permanent-delete'
        : mode === 'restore'
          ? '/quizzes/bulk-restore'
          : '/quizzes/bulk-delete';
    setDeleting(true);
    try {
      const res = await lmsAdminPost(path, { ids: idList });
      if (!res.success) throw new Error(res.error || 'Failed to update quizzes');
      if (mode === 'trash') {
        const moved = res.deletedCount ?? idList.length;
        showAlert(`${moved} quiz${moved === 1 ? '' : 'zes'} ${MOVED_TO_QUARANTINE_PHRASE}.`, 'success');
        if (editingId && idList.includes(String(editingId))) resetForm();
      } else if (mode === 'restore') {
        const restored = res.restoredCount ?? idList.length;
        showAlert(`${restored} quiz${restored === 1 ? '' : 'zes'} restored.`, 'success');
      } else {
        const removed = res.deletedCount ?? idList.length;
        showAlert(`${removed} quiz${removed === 1 ? '' : 'zes'} deleted forever.`, 'success');
      }
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      showAlert(err.message || 'Failed to update quizzes', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleQuizSelect = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allQuizzesSelected = quizzes.length > 0 && quizzes.every((quiz) => selectedIds.has(String(quiz._id)));

  const grouped = useMemo(() => quizzes, [quizzes]);

  return (
    <div className="lms-panel admin-quizzes">
      <LmsCollapsibleFormPanel
        title={editingId ? 'Edit quiz' : 'Create quiz'}
        subtitle={
          editingId
            ? 'Update this quiz for its course and teacher.'
            : 'Choose class slots. One quiz is published for each selected slot.'
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
          {editingId ? (
            <>
              <label className="lms-field-label">
                <span>Course <RequiredMark /></span>
                <select
                  value={form.courseId}
                  onChange={(e) => setForm({ ...form, courseId: e.target.value, teacherId: '', scheduleId: '' })}
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
                  onChange={(e) => setForm({ ...form, teacherId: e.target.value, scheduleId: '' })}
                  required
                  disabled={!form.courseId}
                >
                  <option value="">Select teacher</option>
                  {teachersForCourse.map((t) => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label className="lms-field-label">
                <span>Class slot <RequiredMark /></span>
                <select
                  value={form.scheduleId}
                  onChange={(e) => setForm({ ...form, scheduleId: e.target.value })}
                  required
                >
                  <option value="">Select class slot</option>
                  {filterSchedulesForTargeting(
                    schedules,
                    form.courseId ? [form.courseId] : [],
                    form.teacherId ? [form.teacherId] : []
                  ).map((slot) => (
                    <option key={slot._id} value={slot._id}>
                      {formatScheduleLabel(slot)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <LmsTargetSelect
              courses={courses}
              teachers={teachers}
              schedules={schedules}
              courseTeachers={courseTeachers}
              selectedCourseIds={form.courseIds}
              selectedTeacherIds={form.teacherIds}
              selectedScheduleIds={form.scheduleIds}
              onCoursesChange={(courseIds) => setForm((current) => ({ ...current, courseIds }))}
              onTeachersChange={(teacherIds) => setForm((current) => ({ ...current, teacherIds }))}
              onSchedulesChange={(scheduleIds) => setForm((current) => ({ ...current, scheduleIds }))}
              previewNoun="quiz"
              linkSelections
            />
          )}
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
        <LmsTrashTabs
          mode={listMode}
          trashCount={trashCount}
          onChange={(mode) => {
            setListMode(mode);
            setSelectedIds(new Set());
          }}
        />
        {loading ? <p className="admin-submissions__loading">Loading quizzes…</p> : null}
        {!loading && selectedIds.size > 0 ? (
          <div className="lms-resources-bulk-bar admin-submissions__bulk-bar">
            <span>{selectedIds.size} selected</span>
            <div className="lms-form-actions">
              <button type="button" className="lms-btn-secondary" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
              {isTrashView ? (
                <>
                  <button
                    type="button"
                    className="lms-btn-restore"
                    onClick={() => runQuizIds('restore', selectedIds, `Restore ${selectedIds.size} quiz${selectedIds.size === 1 ? '' : 'zes'}?`)}
                    disabled={deleting}
                  >
                    <i className="fas fa-undo" aria-hidden />
                    {deleting ? 'Working…' : `Restore (${selectedIds.size})`}
                  </button>
                  <button
                    type="button"
                    className="lms-btn-delete-forever"
                    onClick={() =>
                      runQuizIds(
                        'permanent',
                        selectedIds,
                        `Permanently delete ${selectedIds.size} quiz${selectedIds.size === 1 ? '' : 'zes'}? This cannot be undone.`
                      )
                    }
                    disabled={deleting}
                  >
                    <i className="fas fa-trash-alt" aria-hidden />
                    {deleting ? 'Working…' : `Delete forever (${selectedIds.size})`}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="lms-btn-trash"
                  onClick={() =>
                    runQuizIds(
                      'trash',
                      selectedIds,
                      `Move ${selectedIds.size} quiz${selectedIds.size === 1 ? '' : 'zes'} to ${QUARANTINE_LABEL}? Student attempts are moved to ${QUARANTINE_LABEL} too.`
                    )
                  }
                  disabled={deleting}
                >
                  <i className="fas fa-archive" aria-hidden />
                  {deleting ? 'Working…' : `${MOVE_TO_QUARANTINE_PHRASE} (${selectedIds.size})`}
                </button>
              )}
            </div>
          </div>
        ) : null}
        {!loading && grouped.length === 0 ? (
          <p className="admin-submissions__empty">
            {isTrashView ? `${QUARANTINE_LABEL} is empty.` : 'No quizzes yet.'}
          </p>
        ) : null}
        {!loading && grouped.length ? (
          <div className="admin-submissions__table-wrap">
            <table className="admin-submissions__table">
              <thead>
                <tr>
                  <th className="lms-table-check-col">
                    <input
                      type="checkbox"
                      checked={allQuizzesSelected}
                      onChange={() => {
                        if (allQuizzesSelected) setSelectedIds(new Set());
                        else setSelectedIds(new Set(grouped.map((quiz) => String(quiz._id))));
                      }}
                      aria-label="Select all quizzes"
                    />
                  </th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Course</th>
                  <th>Teacher</th>
                  <th>Class slot</th>
                  <th>From</th>
                  <th>Taken</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grouped.map((quiz) => {
                  const qid = String(quiz._id);
                  const selected = selectedIds.has(qid);
                  return (
                    <tr key={quiz._id} className={selected ? 'lms-table-row--selected' : ''}>
                      <td className="lms-table-check-col">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleQuizSelect(qid)}
                          aria-label={`Select ${quiz.title || 'quiz'}`}
                        />
                      </td>
                      <td className="admin-submissions__name">{quiz.title}</td>
                      <td>{quiz.quizType === 'file' ? 'File / Reading' : 'MCQ'}</td>
                      <td>{quiz.course?.title || '—'}</td>
                      <td>{quiz.teacher?.name || '—'}</td>
                      <td>
                        {quiz.assignedSchedule
                          ? formatScheduleTimeLabel(quiz.assignedSchedule)
                          : '—'}
                      </td>
                      <td>{quiz.createdByRole === 'admin' || quiz.lockedForTeacher ? 'Admin' : 'Teacher'}</td>
                      <td>{quiz.attemptCount || 0}</td>
                      <td className="admin-submissions__actions">
                        <button type="button" className="admin-submissions__view-btn" onClick={() => setViewQuiz(quiz)}>
                          View
                        </button>
                        {isTrashView ? (
                          <>
                            <button
                              type="button"
                              className="lms-btn-restore"
                              disabled={deleting}
                              onClick={() => runQuizIds('restore', [qid], `Restore "${quiz.title}"?`)}
                            >
                              <i className="fas fa-undo" aria-hidden /> Restore
                            </button>
                            <button
                              type="button"
                              className="lms-btn-delete-forever"
                              disabled={deleting}
                              onClick={() =>
                                runQuizIds('permanent', [qid], `Permanently delete "${quiz.title}"? This cannot be undone.`)
                              }
                            >
                              <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="admin-submissions__view-btn" onClick={() => startEdit(quiz)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="lms-btn-trash"
                              disabled={deleting}
                              onClick={() =>
                                runQuizIds(
                                  'trash',
                                  [qid],
                                  `Move "${quiz.title}" to ${QUARANTINE_LABEL}? Student attempts are moved to ${QUARANTINE_LABEL} too.`
                                )
                              }
                            >
                              <i className="fas fa-archive" aria-hidden /> {QUARANTINE_LABEL}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
