import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import {
  PortalLoading,
  PortalAlert,
  PortalPageHeader,
  FeeBadge,
  SimpleTable,
} from '../shared/PortalUi';
import SubmissionFiles from '../shared/SubmissionFiles';
import { formatScore } from '../../../utils/formatScore';

const ParentProgress = () => {
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
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
      return;
    }
    portalGet(`/parent/children/${selectedId}`)
      .then((res) => {
        if (res.success) setDetail(res);
        else setDetail(null);
      })
      .catch(() => setDetail(null));
  }, [selectedId]);

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

  return (
    <div className="portal-page">
      <PortalPageHeader title="Child progress" subtitle="Same records your child sees in the student portal" />
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
      {!detail ? (
        <p className="portal-empty">Select a child or ask admin to link your account.</p>
      ) : (
        <>
          <section className="portal-content-section" style={{ borderTop: 'none', paddingTop: 0 }}>
            <h2 className="portal-content-section-title">Enrollments & fees</h2>
            <SimpleTable
              columns={[
                { key: 'course', label: 'Course', render: (r) => r.course?.title },
                {
                  key: 'price',
                  label: 'Price',
                  render: (r) =>
                    r.course?.price != null ? `$${Number(r.course.price).toFixed(2)}` : '—',
                },
                { key: 'fee', label: 'Fee status', render: (r) => <FeeBadge status={r.paymentStatus} /> },
                { key: 'status', label: 'Enrollment' },
              ]}
              rows={detail.enrollments || []}
              emptyLabel="No enrollments."
            />
          </section>
          <section className="portal-content-section">
            <h2 className="portal-content-section-title">Attendance</h2>
            <SimpleTable
              columns={[
                { key: 'course', label: 'Course', render: (r) => r.course?.title },
                { key: 'status', label: 'Status' },
                { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString() },
                { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
              ]}
              rows={detail.attendance || []}
              emptyLabel="No attendance records."
            />
          </section>
          <section className="portal-content-section">
            <h2 className="portal-content-section-title">Assignments</h2>
            <SimpleTable
              columns={[
                { key: 'assignment', label: 'Assignment', render: (r) => r.assignment?.title },
                {
                  key: 'score',
                  label: 'Score',
                  render: (r) => r.scoreDisplay || formatScore(r.score, r.assignment?.maxPoints),
                },
                { key: 'status', label: 'Status' },
                {
                  key: 'feedback',
                  label: 'Feedback',
                  render: (r) => r.feedback || '—',
                },
                {
                  key: 'files',
                  label: 'Files',
                  render: (r) => <SubmissionFiles attachments={r.attachments} />,
                },
              ]}
              rows={detail.submissions || []}
              emptyLabel="No submissions."
            />
          </section>
          <section className="portal-content-section">
            <h2 className="portal-content-section-title">Quiz results</h2>
            <SimpleTable
              columns={[
                { key: 'quiz', label: 'Quiz', render: (r) => r.quiz?.title },
                {
                  key: 'score',
                  label: 'Score',
                  render: (r) => r.scoreDisplay || formatScore(r.score, r.quiz?.totalMarks),
                },
              ]}
              rows={detail.quizAttempts || []}
              emptyLabel="No quiz attempts."
            />
          </section>
          <section className="portal-content-section">
            <h2 className="portal-content-section-title">Payments</h2>
            <SimpleTable
              columns={[
                { key: 'course', label: 'Course', render: (r) => r.course?.title || r.courseName },
                {
                  key: 'amount',
                  label: 'Amount',
                  render: (r) => `$${Number(r.amount || 0).toFixed(2)}`,
                },
                { key: 'status', label: 'Status' },
                {
                  key: 'date',
                  label: 'Date',
                  render: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'),
                },
              ]}
              rows={detail.payments || []}
              emptyLabel="No payments."
            />
          </section>
        </>
      )}
    </div>
  );
};

export default ParentProgress;
