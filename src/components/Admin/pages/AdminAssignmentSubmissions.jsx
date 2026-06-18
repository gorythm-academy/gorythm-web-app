import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { lmsAdminGet, lmsAdminPost, lmsAdminDelete, lmsAdminPatch } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import PortalModal from '../../Portals/shared/PortalModal';
import SubmissionFiles from '../../Portals/shared/SubmissionFiles';
import QuizReviewPanel from '../../Portals/shared/QuizReviewPanel';
import LmsTrashTabs from '../shared/LmsTrashTabs';
import { formatScore } from '../../../utils/formatScore';
import './AdminAssignmentSubmissions.scss';

function CollapsibleSubmissionTable({
  title,
  icon,
  expanded,
  onToggle,
  count,
  selectedCount,
  onClearSelection,
  onBulkTrash,
  onBulkRestore,
  onBulkPermanent,
  deleting,
  isTrashView,
  emptyMessage,
  children,
}) {
  return (
    <section className={`admin-submissions__section admin-submissions__section--collapsible ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <div className="admin-submissions__section-head">
        <button
          type="button"
          className="admin-submissions__section-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="admin-submissions__section-toggle-main">
            <span className="admin-submissions__section-icon" aria-hidden>
              <i className={`fas ${icon}`} />
            </span>
            <span className="admin-submissions__section-titles">
              <h3>{title}</h3>
              <p>
                {count} record{count === 1 ? '' : 's'}
                {!expanded ? ' · click to expand' : ''}
              </p>
            </span>
          </span>
          <span className="admin-submissions__section-chevron" aria-hidden>
            <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} />
          </span>
        </button>
      </div>

      {expanded ? (
        <div className="admin-submissions__section-body">
          {selectedCount > 0 ? (
            <div className="lms-resources-bulk-bar admin-submissions__bulk-bar">
              <span>{selectedCount} selected</span>
              <div className="lms-form-actions">
                <button type="button" className="lms-btn-secondary" onClick={onClearSelection}>
                  Clear
                </button>
                {isTrashView ? (
                  <>
                    <button type="button" className="lms-btn-restore" onClick={onBulkRestore} disabled={deleting}>
                      <i className="fas fa-undo" aria-hidden />
                      {deleting ? 'Working…' : `Restore (${selectedCount})`}
                    </button>
                    <button type="button" className="lms-btn-delete-forever" onClick={onBulkPermanent} disabled={deleting}>
                      <i className="fas fa-trash-alt" aria-hidden />
                      {deleting ? 'Working…' : `Delete forever (${selectedCount})`}
                    </button>
                  </>
                ) : (
                  <button type="button" className="lms-btn-trash" onClick={onBulkTrash} disabled={deleting}>
                    <i className="fas fa-trash" aria-hidden />
                    {deleting ? 'Working…' : `Move to trash (${selectedCount})`}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {count === 0 ? (
            <p className="admin-submissions__empty">{emptyMessage}</p>
          ) : (
            <div className="admin-submissions__table-wrap">{children}</div>
          )}
        </div>
      ) : null}
    </section>
  );
}

const AdminAssignmentSubmissions = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [courses, setCourses] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [search, setSearch] = useState('');
  const [assignmentDetail, setAssignmentDetail] = useState(null);
  const [quizDetail, setQuizDetail] = useState(null);
  const [assignmentTableExpanded, setAssignmentTableExpanded] = useState(false);
  const [quizTableExpanded, setQuizTableExpanded] = useState(false);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(() => new Set());
  const [selectedQuizIds, setSelectedQuizIds] = useState(() => new Set());
  const [deletingAssignments, setDeletingAssignments] = useState(false);
  const [deletingQuizzes, setDeletingQuizzes] = useState(false);
  const [listMode, setListMode] = useState('active');
  const [submissionTrashCount, setSubmissionTrashCount] = useState(0);
  const [quizTrashCount, setQuizTrashCount] = useState(0);

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
    setLoadingData(true);
    try {
      const courseQuery =
        courseFilter === 'all' ? '' : `?courseId=${encodeURIComponent(courseFilter)}`;
      const trashQ = listMode === 'trash' ? (courseQuery ? '&trash=1' : '?trash=1') : '';
      const [subRes, quizRes] = await Promise.all([
        lmsAdminGet(`/submissions${courseQuery}${trashQ}`),
        lmsAdminGet(`/quiz-attempts${courseQuery}${trashQ}`),
      ]);
      if (subRes.success) {
        setSubmissions(subRes.submissions || []);
        if (typeof subRes.trashCount === 'number') setSubmissionTrashCount(subRes.trashCount);
      }
      if (quizRes.success) {
        setQuizAttempts(quizRes.attempts || []);
        if (typeof quizRes.trashCount === 'number') setQuizTrashCount(quizRes.trashCount);
      }
      setSelectedAssignmentIds(new Set());
      setSelectedQuizIds(new Set());
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoadingData(false);
    }
  }, [courseFilter, listMode, showAlert]);

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
    return { total: filteredAssignments.length };
  }, [filteredAssignments]);

  const courseSelected = Boolean(courseFilter);

  const toggleAssignmentSelect = (id) => {
    const sid = String(id);
    setSelectedAssignmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const toggleAllAssignments = () => {
    const allIds = filteredAssignments.map((s) => String(s._id));
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedAssignmentIds.has(id));
    setSelectedAssignmentIds(allSelected ? new Set() : new Set(allIds));
  };

  const toggleQuizSelect = (id) => {
    const sid = String(id);
    setSelectedQuizIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const toggleAllQuizzes = () => {
    const allIds = filteredQuizzes.map((a) => String(a._id));
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedQuizIds.has(id));
    setSelectedQuizIds(allSelected ? new Set() : new Set(allIds));
  };

  const handleSubmissions = async (action, ids, confirmText) => {
    const idList = [...ids];
    if (!idList.length) return;
    const ok = await showConfirm(confirmText);
    if (!ok) return;
    setDeletingAssignments(true);
    try {
      let res;
      if (action === 'trash') {
        res =
          idList.length === 1
            ? await lmsAdminDelete(`/submissions/${idList[0]}`)
            : await lmsAdminPost('/submissions/bulk-delete', { ids: idList });
      } else if (action === 'restore') {
        res =
          idList.length === 1
            ? await lmsAdminPatch(`/submissions/${idList[0]}/restore`, {})
            : await lmsAdminPost('/submissions/bulk-restore', { ids: idList });
      } else {
        res =
          idList.length === 1
            ? await lmsAdminDelete(`/submissions/${idList[0]}/permanent`)
            : await lmsAdminPost('/submissions/bulk-permanent-delete', { ids: idList });
      }
      if (!res.success) throw new Error(res.error || 'Request failed');
      const n = res.deletedCount ?? res.restoredCount ?? idList.length;
      const verb = action === 'trash' ? 'moved to trash' : action === 'restore' ? 'restored' : 'deleted forever';
      showAlert(`${n} submission${n === 1 ? '' : 's'} ${verb}.`, 'success');
      if (assignmentDetail && idList.includes(String(assignmentDetail._id))) setAssignmentDetail(null);
      setSelectedAssignmentIds(new Set());
      await loadData();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingAssignments(false);
    }
  };

  const handleQuizzes = async (action, ids, confirmText) => {
    const idList = [...ids];
    if (!idList.length) return;
    const ok = await showConfirm(confirmText);
    if (!ok) return;
    setDeletingQuizzes(true);
    try {
      let res;
      if (action === 'trash') {
        res =
          idList.length === 1
            ? await lmsAdminDelete(`/quiz-attempts/${idList[0]}`)
            : await lmsAdminPost('/quiz-attempts/bulk-delete', { ids: idList });
      } else if (action === 'restore') {
        res =
          idList.length === 1
            ? await lmsAdminPatch(`/quiz-attempts/${idList[0]}/restore`, {})
            : await lmsAdminPost('/quiz-attempts/bulk-restore', { ids: idList });
      } else {
        res =
          idList.length === 1
            ? await lmsAdminDelete(`/quiz-attempts/${idList[0]}/permanent`)
            : await lmsAdminPost('/quiz-attempts/bulk-permanent-delete', { ids: idList });
      }
      if (!res.success) throw new Error(res.error || 'Request failed');
      const n = res.deletedCount ?? res.restoredCount ?? idList.length;
      const verb = action === 'trash' ? 'moved to trash' : action === 'restore' ? 'restored' : 'deleted forever';
      showAlert(`${n} quiz attempt${n === 1 ? '' : 's'} ${verb}.`, 'success');
      if (quizDetail && idList.includes(String(quizDetail._id))) setQuizDetail(null);
      setSelectedQuizIds(new Set());
      await loadData();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingQuizzes(false);
    }
  };

  const isTrashView = listMode === 'trash';
  const combinedTrashCount = submissionTrashCount + quizTrashCount;

  const assignmentEmptyMessage = isTrashView
    ? 'Trash is empty for assignment submissions.'
    : courseFilter === 'all'
      ? 'No assignment submissions yet.'
      : 'No assignment submissions for this course.';
  const quizEmptyMessage = isTrashView
    ? 'Trash is empty for quiz attempts.'
    : courseFilter === 'all'
      ? 'No quiz attempts yet.'
      : 'No quiz attempts for this course.';

  return (
    <div className="admin-submissions">
      <div className="admin-submissions__hero">
        <div className="admin-submissions__hero-icon" aria-hidden="true">
          <i className="fas fa-file-signature" />
        </div>
        <div>
          <h2>Student submissions</h2>
          <p>
            Use Trash to move records out of active lists. Restore or delete forever from the Trash tab.
          </p>
        </div>
      </div>

      <div className="admin-submissions__stats">
        <div className="admin-submissions__stat">
          <span>Assignments</span>
          <strong>{courseSelected ? assignmentStats.total : '—'}</strong>
        </div>
        <div className="admin-submissions__stat admin-submissions__stat--pending">
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

      <LmsTrashTabs
        mode={listMode}
        trashCount={combinedTrashCount}
        onChange={(mode) => {
          setListMode(mode);
          if (mode === 'trash') {
            setAssignmentTableExpanded(true);
            setQuizTableExpanded(true);
          }
        }}
      />

      {loadingCourses ? (
        <p className="admin-submissions__loading">Loading courses…</p>
      ) : loadingData ? (
        <p className="admin-submissions__loading">Loading submissions…</p>
      ) : (
        <>
          <CollapsibleSubmissionTable
            title="Assignment submissions"
            icon="fa-file-alt"
            expanded={assignmentTableExpanded}
            onToggle={() => setAssignmentTableExpanded((v) => !v)}
            count={filteredAssignments.length}
            selectedCount={selectedAssignmentIds.size}
            onClearSelection={() => setSelectedAssignmentIds(new Set())}
            isTrashView={isTrashView}
            onBulkTrash={() =>
              handleSubmissions('trash', selectedAssignmentIds, `Move ${selectedAssignmentIds.size} submission(s) to trash?`)
            }
            onBulkRestore={() =>
              handleSubmissions('restore', selectedAssignmentIds, `Restore ${selectedAssignmentIds.size} submission(s)?`)
            }
            onBulkPermanent={() =>
              handleSubmissions(
                'permanent',
                selectedAssignmentIds,
                `Permanently delete ${selectedAssignmentIds.size} submission(s)?`
              )
            }
            deleting={deletingAssignments}
            emptyMessage={assignmentEmptyMessage}
          >
            <table className="admin-submissions__table">
              <thead>
                <tr>
                  <th className="lms-table-check-col">
                    <input
                      type="checkbox"
                      checked={
                        filteredAssignments.length > 0 &&
                        filteredAssignments.every((s) => selectedAssignmentIds.has(String(s._id)))
                      }
                      onChange={toggleAllAssignments}
                      aria-label="Select all assignment submissions"
                    />
                  </th>
                  <th>Student</th>
                  <th>Roll no.</th>
                  <th>Assignment</th>
                  <th>Course</th>
                  <th>Teacher</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((s) => {
                  const sid = String(s._id);
                  const selected = selectedAssignmentIds.has(sid);
                  return (
                    <tr key={s._id} className={selected ? 'lms-table-row--selected' : ''}>
                      <td className="lms-table-check-col">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleAssignmentSelect(sid)}
                          aria-label={`Select ${s.student?.name || 'submission'}`}
                        />
                      </td>
                      <td className="admin-submissions__name">{s.student?.name || '—'}</td>
                      <td>{s.student?.studentId || '—'}</td>
                      <td>{s.assignment?.title || '—'}</td>
                      <td>{s.assignment?.course?.title || '—'}</td>
                      <td>{s.assignment?.teacher?.name || s.assignment?.course?.instructorName || '—'}</td>
                      <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                      <td className="admin-submissions__actions">
                        <button
                          type="button"
                          className="admin-submissions__view-btn"
                          onClick={() => setAssignmentDetail(s)}
                        >
                          View
                        </button>
                        {isTrashView ? (
                          <>
                            <button
                              type="button"
                              className="lms-btn-restore"
                              disabled={deletingAssignments}
                              onClick={() =>
                                handleSubmissions('restore', [sid], `Restore submission from ${s.student?.name || 'student'}?`)
                              }
                            >
                              <i className="fas fa-undo" aria-hidden /> Restore
                            </button>
                            <button
                              type="button"
                              className="lms-btn-delete-forever"
                              disabled={deletingAssignments}
                              onClick={() =>
                                handleSubmissions(
                                  'permanent',
                                  [sid],
                                  `Permanently delete submission from ${s.student?.name || 'student'}?`
                                )
                              }
                            >
                              <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="lms-btn-trash"
                            disabled={deletingAssignments}
                            onClick={() =>
                              handleSubmissions('trash', [sid], `Move submission from ${s.student?.name || 'student'} to trash?`)
                            }
                          >
                            <i className="fas fa-trash" aria-hidden /> Trash
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleSubmissionTable>

          <CollapsibleSubmissionTable
            title="Quiz submissions"
            icon="fa-clipboard-check"
            expanded={quizTableExpanded}
            onToggle={() => setQuizTableExpanded((v) => !v)}
            count={filteredQuizzes.length}
            selectedCount={selectedQuizIds.size}
            onClearSelection={() => setSelectedQuizIds(new Set())}
            isTrashView={isTrashView}
            onBulkTrash={() =>
              handleQuizzes('trash', selectedQuizIds, `Move ${selectedQuizIds.size} quiz attempt(s) to trash?`)
            }
            onBulkRestore={() =>
              handleQuizzes('restore', selectedQuizIds, `Restore ${selectedQuizIds.size} quiz attempt(s)?`)
            }
            onBulkPermanent={() =>
              handleQuizzes(
                'permanent',
                selectedQuizIds,
                `Permanently delete ${selectedQuizIds.size} quiz attempt(s)?`
              )
            }
            deleting={deletingQuizzes}
            emptyMessage={quizEmptyMessage}
          >
            <table className="admin-submissions__table admin-submissions__table--quiz">
              <thead>
                <tr>
                  <th className="lms-table-check-col">
                    <input
                      type="checkbox"
                      checked={
                        filteredQuizzes.length > 0 &&
                        filteredQuizzes.every((a) => selectedQuizIds.has(String(a._id)))
                      }
                      onChange={toggleAllQuizzes}
                      aria-label="Select all quiz attempts"
                    />
                  </th>
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
                {filteredQuizzes.map((a) => {
                  const aid = String(a._id);
                  const selected = selectedQuizIds.has(aid);
                  return (
                    <tr key={a._id} className={selected ? 'lms-table-row--selected' : ''}>
                      <td className="lms-table-check-col">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleQuizSelect(aid)}
                          aria-label={`Select ${a.student?.name || 'attempt'}`}
                        />
                      </td>
                      <td className="admin-submissions__name">{a.student?.name || '—'}</td>
                      <td>{a.student?.studentId || '—'}</td>
                      <td>{a.quiz?.title || '—'}</td>
                      <td>{a.quiz?.course?.title || '—'}</td>
                      <td>{a.quiz?.teacher?.name || a.quiz?.course?.instructorName || '—'}</td>
                      <td>{a.scoreDisplay || formatScore(a.score, a.quiz?.totalMarks)}</td>
                      <td>{a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</td>
                      <td className="admin-submissions__actions">
                        <button type="button" className="admin-submissions__view-btn" onClick={() => setQuizDetail(a)}>
                          View
                        </button>
                        {isTrashView ? (
                          <>
                            <button
                              type="button"
                              className="lms-btn-restore"
                              disabled={deletingQuizzes}
                              onClick={() =>
                                handleQuizzes('restore', [aid], `Restore quiz attempt from ${a.student?.name || 'student'}?`)
                              }
                            >
                              <i className="fas fa-undo" aria-hidden /> Restore
                            </button>
                            <button
                              type="button"
                              className="lms-btn-delete-forever"
                              disabled={deletingQuizzes}
                              onClick={() =>
                                handleQuizzes(
                                  'permanent',
                                  [aid],
                                  `Permanently delete quiz attempt from ${a.student?.name || 'student'}?`
                                )
                              }
                            >
                              <i className="fas fa-trash-alt" aria-hidden /> Delete forever
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="lms-btn-trash"
                            disabled={deletingQuizzes}
                            onClick={() =>
                              handleQuizzes('trash', [aid], `Move quiz attempt from ${a.student?.name || 'student'} to trash?`)
                            }
                          >
                            <i className="fas fa-trash" aria-hidden /> Trash
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleSubmissionTable>
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
          {quizDetail.review ? <QuizReviewPanel review={quizDetail.review} title="Student answers" /> : null}
        </PortalModal>
      ) : null}
    </div>
  );
};

export default AdminAssignmentSubmissions;
