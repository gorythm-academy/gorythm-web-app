import React, { useEffect, useMemo, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import {
  PortalLoading,
  PortalAlert,
  PortalPageHeader,
  FeeBadge,
} from '../shared/PortalUi';
import SubmissionFiles from '../shared/SubmissionFiles';
import AttendancePeriodView from '../shared/AttendancePeriodView';
import { formatScore } from '../../../utils/formatScore';

const paymentStatusLabel = (status) => {
  if (status === 'paid' || status === 'completed') return 'Paid';
  if (status === 'awaiting_review') return 'Awaiting review';
  if (status === 'processing') return 'Processing';
  if (status === 'rejected') return 'Rejected';
  if (status === 'refunded') return 'Refunded';
  if (status === 'failed') return 'Failed';
  return status || '—';
};

const ParentProgress = () => {
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    if (!selectedId) {
      setDetail(null);
      setDetailError('');
      return;
    }
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
      });
  }, [selectedId]);

  const attendanceCoursesUrl = useMemo(
    () => (selectedId ? `/parent/children/${selectedId}/attendance/courses` : ''),
    [selectedId]
  );
  const attendanceViewUrl = useMemo(
    () => (selectedId ? `/parent/children/${selectedId}/attendance/view` : ''),
    [selectedId]
  );

  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }
  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }

  const selectedChild = children.find((c) => c.student?._id === selectedId);

  return (
    <div className="portal-page">
      <PortalPageHeader title="Child progress" subtitle="Same records your child sees in the student portal" />

      <div className="portal-hero portal-hero--parent">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-chart-line" />
        </div>
        <div>
          <h2>Progress & results</h2>
          <p>
            {selectedChild?.student?.name
              ? `Viewing records for ${selectedChild.student.name}.`
              : 'Select a linked child to view their academy records.'}
          </p>
        </div>
      </div>

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

      {detailError ? <PortalAlert type="error">{detailError}</PortalAlert> : null}

      {!detail ? (
        <p className="portal-select-hint">
          {detailError ? 'Could not load this child.' : 'Select a child or ask admin to link your account.'}
        </p>
      ) : (
        <>
          <div className="portal-panel">
            <div className="portal-panel__head">
              <h2>Enrollments & fees</h2>
            </div>
            <div className="portal-panel__body">
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--green">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Price</th>
                      <th>Fee status</th>
                      <th>Enrollment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.enrollments || []).length === 0 ? (
                      <tr>
                        <td colSpan={4}>No enrollments.</td>
                      </tr>
                    ) : (
                      (detail.enrollments || []).map((r) => (
                        <tr key={r._id}>
                          <td>{r.course?.title || '—'}</td>
                          <td>{r.course?.price != null ? `$${Number(r.course.price).toFixed(2)}` : '—'}</td>
                          <td>
                            <FeeBadge status={r.paymentStatus} />
                          </td>
                          <td>{r.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="portal-panel">
            <div className="portal-panel__head">
              <h2>Attendance</h2>
              <p>View by course — weekly or monthly summary.</p>
            </div>
            <div className="portal-panel__body">
              <AttendancePeriodView
                coursesUrl={attendanceCoursesUrl}
                viewUrl={attendanceViewUrl}
                emptyCoursesHint="No active course enrollments for this child."
                allowedPeriods={['weekly', 'monthly']}
                summaryOnly
              />
            </div>
          </div>

          <div className="portal-panel">
            <div className="portal-panel__head">
              <h2>Assignments</h2>
            </div>
            <div className="portal-panel__body">
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--green">
                  <thead>
                    <tr>
                      <th>Assignment</th>
                      <th>Submitted</th>
                      <th>Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.submissions || []).length === 0 ? (
                      <tr>
                        <td colSpan={3}>No submissions.</td>
                      </tr>
                    ) : (
                      (detail.submissions || []).map((r) => (
                        <tr key={r._id}>
                          <td>{r.assignment?.title || '—'}</td>
                          <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}</td>
                          <td>
                            <SubmissionFiles attachments={r.attachments} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="portal-panel">
            <div className="portal-panel__head">
              <h2>Quiz results</h2>
            </div>
            <div className="portal-panel__body">
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--green">
                  <thead>
                    <tr>
                      <th>Quiz</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.quizAttempts || []).length === 0 ? (
                      <tr>
                        <td colSpan={2}>No quiz attempts.</td>
                      </tr>
                    ) : (
                      (detail.quizAttempts || []).map((r) => (
                        <tr key={r._id}>
                          <td>{r.quiz?.title || '—'}</td>
                          <td>{r.scoreDisplay || formatScore(r.score, r.quiz?.totalMarks)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="portal-panel">
            <div className="portal-panel__head">
              <h2>Payments</h2>
              <p>Recorded payment transactions for this child.</p>
            </div>
            <div className="portal-panel__body">
              <div className="portal-data-table-wrap">
                <table className="portal-data-table portal-data-table--green">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.payments || []).length === 0 ? (
                      <tr>
                        <td colSpan={4}>No payments.</td>
                      </tr>
                    ) : (
                      (detail.payments || []).map((r) => (
                        <tr key={r._id}>
                          <td>{r.course?.title || r.courseName || '—'}</td>
                          <td>${Number(r.amount || 0).toFixed(2)}</td>
                          <td>{paymentStatusLabel(r.status)}</td>
                          <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ParentProgress;
