import React, { useEffect, useMemo, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import {
  PortalDataSection,
  PortalAlert,
  PortalPageHeader,
} from '../shared/PortalUi';
import SubmissionFiles from '../shared/SubmissionFiles';
import PortalContentResourcesTable from '../shared/PortalContentResourcesTable';
import PortalCollapsiblePanel from '../shared/PortalCollapsiblePanel';
import LmsMaterialPreviewModal from '../../Admin/shared/LmsMaterialPreviewModal';
import QuizPreviewModal from '../shared/QuizPreviewModal';
import AttendancePeriodView from '../shared/AttendancePeriodView';
import { formatScore } from '../../../utils/formatScore';
import { markPortalPageVisited } from '../../../utils/portalNewItems';
import '../../Admin/pages/LmsManagement.scss';

const SEEN_KEY = 'parent_progress';

const defaultExpandedSections = () => ({
  attendance: true,
  content: true,
  assignments: true,
  quizzes: true,
});

const ParentProgress = () => {
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewResource, setPreviewResource] = useState(null);
  const [previewAssignment, setPreviewAssignment] = useState(null);
  const [previewQuiz, setPreviewQuiz] = useState(null);
  const [expandedSections, setExpandedSections] = useState(defaultExpandedSections);

  const toggleSection = (sectionId) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  useEffect(() => {
    portalGet('/parent/children')
      .then((res) => {
        if (res.success) {
          const list = res.children || [];
          setChildren(list);
          if (list[0]?.student?._id) setSelectedId(list[0].student._id);
        } else setError(res.error || 'Failed');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => markPortalPageVisited(SEEN_KEY);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError('');
      return;
    }
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    portalGet(`/parent/children/${selectedId}`)
      .then((res) => {
        if (res.success) {
          setDetail(res);
          setDetailError('');
        } else {
          setDetail(null);
          setDetailError(res.error || 'Failed to load child details');
        }
      })
      .catch((err) => {
        setDetail(null);
        setDetailError(err.message || 'Failed to load child details');
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  const attendanceCoursesUrl = useMemo(
    () => (selectedId ? `/parent/children/${selectedId}/attendance/courses` : ''),
    [selectedId]
  );
  const attendanceViewUrl = useMemo(
    () => (selectedId ? `/parent/children/${selectedId}/attendance/view` : ''),
    [selectedId]
  );

  const loadingChildren = loading;
  const selectedChild = children.find((c) => c.student?._id === selectedId);

  return (
    <div className="portal-page">
      <PortalPageHeader title="Child Progress" subtitle="Attendance, content, assignments, and quiz results for each linked child" />

      <div className="portal-hero portal-hero--parent">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-chart-line" />
        </div>
        <div>
          <h2>Progress & Results</h2>
          <p>
            {selectedChild?.student?.name
              ? `Viewing records for ${selectedChild.student.name}.`
              : 'Select a linked child to view their academy records.'}
          </p>
        </div>
      </div>

      <PortalDataSection loading={loadingChildren} error={error} loadingLabel="Loading children…">
      <div className="portal-child-tabs">
        {children.map((link) => {
          const id = link.student?._id;
          if (!id) return null;
          return (
            <button
              key={id}
              type="button"
              className={selectedId === id ? 'active' : ''}
              onClick={() => setSelectedId(id)}
            >
              {link.student?.name}
            </button>
          );
        })}
      </div>

      {detailLoading ? (
        <PortalDataSection loading loadingLabel="Loading child records…" />
      ) : !detail ? (
        <p className="portal-select-hint">
          {detailError ? 'Could not load this child’s records. Please try again.' : 'No children are linked to this account yet. Please contact the academy to connect your child’s profile.'}
        </p>
      ) : (
        <>
          {detailError ? <PortalAlert type="error">{detailError}</PortalAlert> : null}

          <PortalCollapsiblePanel
            title="Attendance"
            subtitle="View by course — weekly or monthly summary."
            expanded={expandedSections.attendance}
            onToggle={() => toggleSection('attendance')}
          >
            <AttendancePeriodView
              coursesUrl={attendanceCoursesUrl}
              viewUrl={attendanceViewUrl}
              emptyCoursesHint="There are no courses to show attendance for yet."
              allowedPeriods={['weekly', 'monthly']}
              summaryOnly
            />
          </PortalCollapsiblePanel>

          <PortalCollapsiblePanel
            title="Course Content"
            subtitle="Teacher-shared files, links, and notes for your child's courses."
            expanded={expandedSections.content}
            onToggle={() => toggleSection('content')}
            bodyClassName="portal-panel__body--padded"
          >
            <PortalContentResourcesTable
              resources={detail.resources || []}
              onPreview={setPreviewResource}
              emptyMessage="There is no course material to show yet."
            />
          </PortalCollapsiblePanel>

          <PortalCollapsiblePanel
            title="Assignments"
            subtitle="Assigned homework and every submitted assignment for this child."
            expanded={expandedSections.assignments}
            onToggle={() => toggleSection('assignments')}
          >
            <div className="portal-data-table-wrap">
              <table className="portal-data-table portal-data-table--green">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Course</th>
                    <th>Due</th>
                    <th>Files</th>
                    <th>Submitted</th>
                    <th>Submitted files</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.assignments || []).length === 0 ? (
                    <tr>
                      <td colSpan={6}>There are no assignments to show yet.</td>
                    </tr>
                  ) : (
                    (detail.assignments || []).map((row) => {
                      const submittedAt = row.submission?.submittedAt;
                      return (
                        <tr key={row._id}>
                          <td>{row.title || '—'}</td>
                          <td>{row.course?.title || '—'}</td>
                          <td>
                            {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            {row.attachments?.length ? (
                              <div className="student-assignments-table__actions">
                                <SubmissionFiles attachments={row.attachments} />
                                <button
                                  type="button"
                                  className="lms-btn-secondary lms-btn-secondary--compact"
                                  onClick={() => setPreviewAssignment(row)}
                                >
                                  <i className="fas fa-eye" aria-hidden /> Preview
                                </button>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {submittedAt
                              ? new Date(submittedAt).toLocaleString()
                              : 'Not submitted yet'}
                          </td>
                          <td>
                            <SubmissionFiles attachments={row.submission?.attachments} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </PortalCollapsiblePanel>

          <PortalCollapsiblePanel
            title="Quiz Results"
            expanded={expandedSections.quizzes}
            onToggle={() => toggleSection('quizzes')}
          >
            <div className="portal-data-table-wrap">
              <table className="portal-data-table portal-data-table--green">
                <thead>
                  <tr>
                    <th>Quiz</th>
                    <th>Score</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.quizAttempts || []).length === 0 ? (
                    <tr>
                      <td colSpan={3}>No quiz results to show yet.</td>
                    </tr>
                  ) : (
                    (detail.quizAttempts || []).map((r) => (
                      <tr key={r._id}>
                        <td>{r.quiz?.title || '—'}</td>
                        <td>{r.scoreDisplay || formatScore(r.score, r.quiz?.totalMarks)}</td>
                        <td>
                          {r.quiz ? (
                            <button
                              type="button"
                              className="portal-action-btn portal-action-btn--green"
                              onClick={() =>
                                setPreviewQuiz({
                                  quiz: r.quiz,
                                  review: r.review || null,
                                  attempt: r,
                                })
                              }
                            >
                              <span className="portal-action-btn__label">View</span>
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </PortalCollapsiblePanel>
        </>
      )}
      </PortalDataSection>

      <QuizPreviewModal
        quiz={previewQuiz?.quiz || null}
        review={previewQuiz?.review || null}
        attempt={previewQuiz?.attempt || null}
        tone="parent"
        chosenLabel="Student answer"
        onClose={() => setPreviewQuiz(null)}
      />
      <LmsMaterialPreviewModal
        open={Boolean(previewResource)}
        kind="resource"
        item={previewResource}
        onClose={() => setPreviewResource(null)}
        hideUploader
        tone="parent"
      />
      <LmsMaterialPreviewModal
        open={Boolean(previewAssignment)}
        kind="assignment"
        item={previewAssignment}
        onClose={() => setPreviewAssignment(null)}
        tone="parent"
      />
    </div>
  );
};

export default ParentProgress;
