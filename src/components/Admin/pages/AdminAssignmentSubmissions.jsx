import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lmsAdminGet, lmsAdminPost, lmsAdminDelete, lmsAdminPatch } from '../../../utils/lmsAdminApi';
import { useAdminDialog } from '../AdminDialogContext';
import PortalModal from '../../Portals/shared/PortalModal';
import SubmissionFiles from '../../Portals/shared/SubmissionFiles';
import QuizReviewPanel from '../../Portals/shared/QuizReviewPanel';
import LmsTrashTabs from '../shared/LmsTrashTabs';
import { QUARANTINE_LABEL, MOVED_TO_QUARANTINE_PHRASE, MOVE_TO_QUARANTINE_PHRASE } from '../../../utils/adminListLabels';
import { formatScore } from '../../../utils/formatScore';
import { buildListCacheKey, createListCache } from '../../../utils/adminListCache';
import AdminSearchBox from '../shared/AdminSearchBox';
import { useAdminSearch } from '../../../hooks/useAdminSearch';
import AdminTablePagination from '../shared/AdminTablePagination';
import { PortalActivityBanner } from '../../Portals/shared/PortalUi';
import {
  collectSubmissionRevisionNotices,
  dismissActivityNotices,
  filterDismissedActivityNotices,
  getSubmissionRevisionLabel,
} from '../../../utils/portalAssignmentNotices';
import { ADMIN_SEEN_TAB_SUBMISSIONS } from '../../../utils/portalNewItems';
import './AdminAssignmentSubmissions.scss';

const SUBMISSIONS_PAGE_SIZE = 25;
const SEEN_SUBMISSION_ACTIVITY_KEY = 'admin_submissions_activity';

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
                    <i className="fas fa-archive" aria-hidden />
                    {deleting ? 'Working…' : `${MOVE_TO_QUARANTINE_PHRASE} (${selectedCount})`}
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
  const [loadingData, setLoadingData] = useState(false);
  const {
    searchTerm: search,
    setSearchTerm: setSearch,
    debouncedSearch,
    flushSearch: flushSubmissionSearch,
  } = useAdminSearch();
  const [assignmentDetail, setAssignmentDetail] = useState(null);
  const [quizDetail, setQuizDetail] = useState(null);
  const [loadingAssignmentDetail, setLoadingAssignmentDetail] = useState(false);
  const [loadingQuizDetail, setLoadingQuizDetail] = useState(false);
  const [assignmentTableExpanded, setAssignmentTableExpanded] = useState(false);
  const [quizTableExpanded, setQuizTableExpanded] = useState(false);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(() => new Set());
  const [selectedQuizIds, setSelectedQuizIds] = useState(() => new Set());
  const [deletingAssignments, setDeletingAssignments] = useState(false);
  const [deletingQuizzes, setDeletingQuizzes] = useState(false);
  const [listMode, setListMode] = useState('active');
  const [submissionTrashCount, setSubmissionTrashCount] = useState(0);
  const [quizTrashCount, setQuizTrashCount] = useState(0);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [quizPage, setQuizPage] = useState(1);
  const [assignmentPages, setAssignmentPages] = useState(1);
  const [quizPages, setQuizPages] = useState(1);
  const [assignmentTotal, setAssignmentTotal] = useState(0);
  const [quizTotal, setQuizTotal] = useState(0);
  const [activityDismissTick, setActivityDismissTick] = useState(0);
  const assignCacheRef = useRef(createListCache());
  const quizCacheRef = useRef(createListCache());
  const coursesLoadedRef = useRef(false);

  const invalidateSubmissionCaches = useCallback(() => {
    assignCacheRef.current.clear();
    quizCacheRef.current.clear();
    coursesLoadedRef.current = false;
  }, []);

  const buildListUrl = useCallback(
    (basePath, page, { includeMeta = false } = {}) => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(SUBMISSIONS_PAGE_SIZE));
      if (includeMeta) params.set('includeMeta', '1');
      if (courseFilter && courseFilter !== 'all') params.set('courseId', courseFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (listMode === 'trash') params.set('trash', '1');
      return `${basePath}?${params.toString()}`;
    },
    [courseFilter, debouncedSearch, listMode]
  );

  const loadData = useCallback(
    async ({ force = false } = {}) => {
      if (!courseFilter) {
        setSubmissions([]);
        setQuizAttempts([]);
        return;
      }
      setLoadingData(true);
      try {
        const includeMeta = !coursesLoadedRef.current;
        const assignCacheKey = buildListCacheKey({
          kind: 'assignments',
          courseFilter,
          listMode,
          page: assignmentPage,
          search: debouncedSearch,
        });
        const quizCacheKey = buildListCacheKey({
          kind: 'quizzes',
          courseFilter,
          listMode,
          page: quizPage,
          search: debouncedSearch,
        });

        let subRes = !force ? assignCacheRef.current.get(assignCacheKey) : null;
        let quizRes = !force ? quizCacheRef.current.get(quizCacheKey) : null;

        const pending = [];
        if (!subRes) {
          pending.push(
            lmsAdminGet(buildListUrl('/submissions', assignmentPage, { includeMeta })).then((res) => {
              if (res.success) assignCacheRef.current.set(assignCacheKey, res);
              return { kind: 'sub', res };
            })
          );
        }
        if (!quizRes) {
          pending.push(
            lmsAdminGet(buildListUrl('/quiz-attempts', quizPage)).then((res) => {
              if (res.success) quizCacheRef.current.set(quizCacheKey, res);
              return { kind: 'quiz', res };
            })
          );
        }

        if (pending.length) {
          const results = await Promise.all(pending);
          for (const item of results) {
            if (item.kind === 'sub') subRes = item.res;
            if (item.kind === 'quiz') quizRes = item.res;
          }
        }

        if (subRes?.success) {
          setSubmissions(subRes.submissions || []);
          setAssignmentPages(subRes.pages || 1);
          setAssignmentTotal(subRes.total ?? subRes.submissions?.length ?? 0);
          if (typeof subRes.trashCount === 'number') setSubmissionTrashCount(subRes.trashCount);
          if (subRes.courses?.length) {
            setCourses(subRes.courses);
            coursesLoadedRef.current = true;
          }
        }
        if (quizRes?.success) {
          setQuizAttempts(quizRes.attempts || []);
          setQuizPages(quizRes.pages || 1);
          setQuizTotal(quizRes.total ?? quizRes.attempts?.length ?? 0);
          if (typeof quizRes.trashCount === 'number') setQuizTrashCount(quizRes.trashCount);
          if (quizRes.courses?.length) {
            setCourses(quizRes.courses);
            coursesLoadedRef.current = true;
          }
        }
        setSelectedAssignmentIds(new Set());
        setSelectedQuizIds(new Set());
      } catch (err) {
        showAlert(err.message, 'error');
      } finally {
        setLoadingData(false);
      }
    },
    [assignmentPage, buildListUrl, courseFilter, debouncedSearch, listMode, quizPage, showAlert]
  );

  useEffect(() => {
    setAssignmentPage(1);
    setQuizPage(1);
  }, [debouncedSearch, listMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAssignmentDetail = async (row) => {
    setLoadingAssignmentDetail(true);
    try {
      const res = await lmsAdminGet(`/submissions/${row._id}`);
      if (!res.success || !res.submission) throw new Error(res.error || 'Failed to load submission');
      setAssignmentDetail(res.submission);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoadingAssignmentDetail(false);
    }
  };

  const openQuizDetail = async (row) => {
    setLoadingQuizDetail(true);
    try {
      const res = await lmsAdminGet(`/quiz-attempts/${row._id}`);
      if (!res.success || !res.attempt) throw new Error(res.error || 'Failed to load quiz attempt');
      setQuizDetail(res.attempt);
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setLoadingQuizDetail(false);
    }
  };

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
    const allIds = submissions.map((s) => String(s._id));
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
    const allIds = quizAttempts.map((a) => String(a._id));
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
      const verb = action === 'trash' ? MOVED_TO_QUARANTINE_PHRASE : action === 'restore' ? 'restored' : 'deleted forever';
      showAlert(`${n} submission${n === 1 ? '' : 's'} ${verb}.`, 'success');
      if (assignmentDetail && idList.includes(String(assignmentDetail._id))) setAssignmentDetail(null);
      setSelectedAssignmentIds(new Set());
      invalidateSubmissionCaches();
      await loadData({ force: true });
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
      const verb = action === 'trash' ? MOVED_TO_QUARANTINE_PHRASE : action === 'restore' ? 'restored' : 'deleted forever';
      showAlert(`${n} quiz attempt${n === 1 ? '' : 's'} ${verb}.`, 'success');
      if (quizDetail && idList.includes(String(quizDetail._id))) setQuizDetail(null);
      setSelectedQuizIds(new Set());
      invalidateSubmissionCaches();
      await loadData({ force: true });
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setDeletingQuizzes(false);
    }
  };

  const isTrashView = listMode === 'trash';
  const combinedTrashCount = submissionTrashCount + quizTrashCount;

  const assignmentEmptyMessage = isTrashView
    ? `${QUARANTINE_LABEL} is empty for assignment submissions.`
    : courseFilter === 'all'
      ? 'No assignment submissions yet.'
      : 'No assignment submissions for this course.';
  const quizEmptyMessage = isTrashView
    ? `${QUARANTINE_LABEL} is empty for quiz attempts.`
    : courseFilter === 'all'
      ? 'No quiz attempts yet.'
      : 'No quiz attempts for this course.';

  const submissionRevisionNotices = useMemo(
    () => collectSubmissionRevisionNotices(submissions, ADMIN_SEEN_TAB_SUBMISSIONS),
    [submissions]
  );

  const visibleSubmissionRevisionNotices = useMemo(
    () => {
      void activityDismissTick;
      return filterDismissedActivityNotices(SEEN_SUBMISSION_ACTIVITY_KEY, submissionRevisionNotices);
    },
    [submissionRevisionNotices, activityDismissTick]
  );

  const dismissSubmissionActivityBanner = () => {
    dismissActivityNotices(
      SEEN_SUBMISSION_ACTIVITY_KEY,
      visibleSubmissionRevisionNotices.map((row) => `${row.id}-${row.message}`)
    );
    setActivityDismissTick((n) => n + 1);
  };

  return (
    <div className="admin-submissions">
      <div className="admin-submissions__hero">
        <div className="admin-submissions__hero-icon" aria-hidden="true">
          <i className="fas fa-file-signature" />
        </div>
        <div>
          <h2>Student Submissions</h2>
          <p>
            Use {QUARANTINE_LABEL} to move records out of active lists. Restore or delete forever from the {QUARANTINE_LABEL} tab.
          </p>
        </div>
      </div>

      <div className="admin-submissions__stats">
        <div className="admin-submissions__stat">
          <span>Assignments</span>
          <strong>{courseSelected ? assignmentTotal : '—'}</strong>
        </div>
        <div className="admin-submissions__stat admin-submissions__stat--pending">
          <span>Quiz Attempts</span>
          <strong>{courseSelected ? quizTotal : '—'}</strong>
        </div>
      </div>

      <div className="controls-bar admin-submissions__toolbar">
        <AdminSearchBox
          placeholder="Name, roll no., title, teacher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onEnter={() => flushSubmissionSearch()}
          disabled={!courseSelected}
        />
        <div className="filter-controls">
          <label className="admin-submissions__field">
            <span>Course</span>
            <select
              value={courseFilter}
              onChange={(e) => {
                setCourseFilter(e.target.value);
                setSearch('');
                setAssignmentPage(1);
                setQuizPage(1);
              }}
              disabled={loadingData && !courses.length}
            >
              <option value="all">All courses</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        </div>
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

      <PortalActivityBanner
        title="Student submission updates"
        rows={visibleSubmissionRevisionNotices}
        onDismiss={dismissSubmissionActivityBanner}
        className="admin-submissions__activity-banner"
      />

      {loadingData && !submissions.length && !quizAttempts.length ? (
        <p className="admin-submissions__loading">Loading submissions…</p>
      ) : (
        <>
          <CollapsibleSubmissionTable
            title="Assignment Submissions"
            icon="fa-file-alt"
            expanded={assignmentTableExpanded}
            onToggle={() => setAssignmentTableExpanded((v) => !v)}
            count={assignmentTotal}
            selectedCount={selectedAssignmentIds.size}
            onClearSelection={() => setSelectedAssignmentIds(new Set())}
            isTrashView={isTrashView}
            onBulkTrash={() =>
              handleSubmissions('trash', selectedAssignmentIds, `Move ${selectedAssignmentIds.size} submission(s) to ${QUARANTINE_LABEL}?`)
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
                        submissions.length > 0 &&
                        submissions.every((s) => selectedAssignmentIds.has(String(s._id)))
                      }
                      onChange={toggleAllAssignments}
                      aria-label="Select all assignment submissions"
                    />
                  </th>
                  <th>Student</th>
                  <th>Roll No.</th>
                  <th>Assignment</th>
                  <th>Course</th>
                  <th>Teacher</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
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
                      <td>
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}
                        {getSubmissionRevisionLabel(s) ? (
                          <div className="lms-due-date-notice">{getSubmissionRevisionLabel(s)}</div>
                        ) : null}
                      </td>
                      <td className="admin-submissions__actions">
                        <button
                          type="button"
                          className="admin-submissions__view-btn"
                          onClick={() => openAssignmentDetail(s)}
                          disabled={loadingAssignmentDetail}
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
                              handleSubmissions('trash', [sid], `Move submission from ${s.student?.name || 'student'} to ${QUARANTINE_LABEL}?`)
                            }
                          >
                            <i className="fas fa-archive" aria-hidden /> {QUARANTINE_LABEL}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <AdminTablePagination
              currentPage={assignmentPage}
              totalPages={assignmentPages}
              onPageChange={setAssignmentPage}
            />
          </CollapsibleSubmissionTable>

          <CollapsibleSubmissionTable
            title="Quiz Submissions"
            icon="fa-clipboard-check"
            expanded={quizTableExpanded}
            onToggle={() => setQuizTableExpanded((v) => !v)}
            count={quizTotal}
            selectedCount={selectedQuizIds.size}
            onClearSelection={() => setSelectedQuizIds(new Set())}
            isTrashView={isTrashView}
            onBulkTrash={() =>
              handleQuizzes('trash', selectedQuizIds, `Move ${selectedQuizIds.size} quiz attempt(s) to ${QUARANTINE_LABEL}?`)
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
                        quizAttempts.length > 0 &&
                        quizAttempts.every((a) => selectedQuizIds.has(String(a._id)))
                      }
                      onChange={toggleAllQuizzes}
                      aria-label="Select all quiz attempts"
                    />
                  </th>
                  <th>Student</th>
                  <th>Roll No.</th>
                  <th>Quiz</th>
                  <th>Course</th>
                  <th>Teacher</th>
                  <th>Score</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quizAttempts.map((a) => {
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
                        <button
                          type="button"
                          className="admin-submissions__view-btn"
                          onClick={() => openQuizDetail(a)}
                          disabled={loadingQuizDetail}
                        >
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
                              handleQuizzes('trash', [aid], `Move quiz attempt from ${a.student?.name || 'student'} to ${QUARANTINE_LABEL}?`)
                            }
                          >
                            <i className="fas fa-archive" aria-hidden /> {QUARANTINE_LABEL}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <AdminTablePagination currentPage={quizPage} totalPages={quizPages} onPageChange={setQuizPage} />
          </CollapsibleSubmissionTable>
        </>
      )}

      {assignmentDetail ? (
        <PortalModal title={`Assignment — ${assignmentDetail.student?.name}`} onClose={() => setAssignmentDetail(null)} wide>
          <div className="admin-submissions__detail-grid">
            <p>
              <strong>Roll No.:</strong> {assignmentDetail.student?.studentId || '—'}
            </p>
            <p>
              <strong>Email:</strong> <span className="admin-email">{assignmentDetail.student?.email || '—'}</span>
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
              <strong>Roll No.:</strong> {quizDetail.student?.studentId || '—'}
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
          {quizDetail.review ? <QuizReviewPanel review={quizDetail.review} title="Student Answers" /> : null}
        </PortalModal>
      ) : null}
    </div>
  );
};

export default AdminAssignmentSubmissions;
