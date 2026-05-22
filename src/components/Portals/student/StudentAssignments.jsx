import React, { useEffect, useState } from 'react';
import { portalGet, portalPost } from '../shared/portalApi';
import FileUploadField from '../shared/FileUploadField';
import { PortalLoading, PortalAlert, PortalPageHeader, SimpleTable } from '../shared/PortalUi';
import { absFileUrl } from '../../../utils/fileUrl';
import { formatScore } from '../../../utils/formatScore';
import SubmissionFiles from '../shared/SubmissionFiles';

const StudentAssignments = () => {
  const [assignments, setAssignments] = useState(null);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    portalGet('/student/assignments')
      .then((res) => {
        if (res.success) setAssignments(res.assignments || []);
        else setError(res.error || 'Failed to load');
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const attachments = fileUrl ? [fileUrl] : [];
    try {
      const res = await portalPost('/student/submissions', {
        assignmentId: selected,
        text,
        attachments,
      });
      if (res.success) {
        setMsg('Submitted successfully.');
        setText('');
        setFileUrl('');
        load();
      } else setMsg(res.error || 'Submit failed');
    } catch (err) {
      setMsg(err.message || 'Submit failed');
    }
  };

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (assignments === null) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  const selectedRow = assignments.find((a) => String(a._id) === String(selected));

  return (
    <div className="portal-page">
      <PortalPageHeader title="Assignments" subtitle="View instructions, submit work, and see grades" />
      <SimpleTable
        columns={[
          { key: 'title', label: 'Title', render: (r) => r.title },
          { key: 'course', label: 'Course', render: (r) => r.course?.title },
          {
            key: 'due',
            label: 'Due',
            render: (r) => (r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'),
          },
          {
            key: 'submitted',
            label: 'Status',
            render: (r) => {
              if (!r.submission) return 'Pending';
              if (r.submission.status === 'graded') return 'Graded';
              return 'Submitted';
            },
          },
          {
            key: 'grade',
            label: 'Score',
            render: (r) => formatScore(r.submission?.score, r.maxPoints),
          },
          {
            key: 'feedback',
            label: 'Feedback',
            render: (r) =>
              r.submission?.feedback ? (
                <span title={r.submission.feedback}>
                  {r.submission.feedback.length > 40
                    ? `${r.submission.feedback.slice(0, 40)}…`
                    : r.submission.feedback}
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'yourFile',
            label: 'Your file',
            render: (r) =>
              r.submission?.attachments?.length ? (
                <a href={absFileUrl(r.submission.attachments[0])} target="_blank" rel="noreferrer">
                  View upload
                </a>
              ) : (
                '—'
              ),
          },
        ]}
        rows={assignments}
        emptyLabel="No assignments."
      />
      {assignments.some((a) => a.attachments?.length) ? (
        <div className="portal-card" style={{ marginTop: '1rem' }}>
          <h3>Teacher materials</h3>
          <ul>
            {assignments.flatMap((a) =>
              (a.attachments || []).map((url, i) => (
                <li key={`${a._id}-${i}`}>
                  <a href={absFileUrl(url)} target="_blank" rel="noreferrer">
                    {a.title} — download
                  </a>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
      <form className="portal-card portal-form-card" onSubmit={submit} style={{ marginTop: '1rem' }} autoComplete="off">
        <h3>Submit homework</h3>
        <label className="portal-field-label">
          <span>Assignment</span>
          <select value={selected || ''} onChange={(e) => setSelected(e.target.value)} required>
            <option value="">Select assignment</option>
            {assignments.map((a) => (
              <option key={a._id} value={a._id} disabled={a.submission?.status === 'graded'}>
                {a.title}
                {a.submission?.status === 'graded' ? ' (graded)' : ''}
              </option>
            ))}
          </select>
        </label>
        {selectedRow ? (
          <div className="portal-submission-preview">
            {selectedRow.description ? (
              <p>
                <strong>Instructions:</strong> {selectedRow.description}
              </p>
            ) : null}
            {selectedRow.maxPoints != null ? (
              <p>
                <strong>Graded out of:</strong> {selectedRow.maxPoints} points
              </p>
            ) : null}
            {selectedRow.attachments?.length ? (
              <>
                <p>
                  <strong>Teacher materials:</strong>
                </p>
                <SubmissionFiles attachments={selectedRow.attachments} />
              </>
            ) : null}
          </div>
        ) : null}
        {selectedRow?.submission?.attachments?.length ? (
          <p>
            <strong>Your upload:</strong>{' '}
            <SubmissionFiles attachments={selectedRow.submission.attachments} />
          </p>
        ) : null}
        {selectedRow?.submission?.feedback ? (
          <PortalAlert type="info">
            <strong>Teacher feedback:</strong> {selectedRow.submission.feedback}
          </PortalAlert>
        ) : null}
        <label className="portal-field-label">
          <span>Your answer</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your answer or notes for the teacher"
            rows={4}
            required={!fileUrl}
            autoComplete="off"
          />
        </label>
        <FileUploadField label="Attach file (optional)" value={fileUrl} onChange={setFileUrl} />
        <button type="submit" disabled={selectedRow?.submission?.status === 'graded'}>
          {selectedRow?.submission ? 'Update submission' : 'Submit'}
        </button>
        {msg ? <PortalAlert type={msg.includes('success') ? 'success' : 'error'}>{msg}</PortalAlert> : null}
      </form>
    </div>
  );
};

export default StudentAssignments;
