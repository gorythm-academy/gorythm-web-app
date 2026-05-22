import React, { useEffect, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader } from '../shared/PortalUi';
import { absFileUrl } from '../../../utils/fileUrl';

const StudentContent = () => {
  const [courses, setCourses] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/student/content')
      .then((res) => {
        if (res.success) {
          setCourses(res.courses || []);
          setResources(res.resources || []);
        } else setError(res.error || 'Failed to load');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="portal-page">
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="portal-page">
        <PortalLoading />
      </div>
    );
  }

  return (
    <div className="portal-page">
      <PortalPageHeader title="Course content" subtitle="Materials for your enrolled courses only" />
      {courses.map((c) => (
        <div key={c._id} className="portal-card" style={{ marginBottom: '1rem' }}>
          <h3>{c.title}</h3>
          {(c.modules || []).length === 0 ? (
            <p className="portal-empty">No modules uploaded.</p>
          ) : (
            <ul>
              {c.modules.map((m, i) => (
                <li key={i}>
                  <strong>{m.title}</strong>
                  {m.videos?.length ? ` — ${m.videos.length} video(s)` : ''}
                  {m.documents?.length ? ` — ${m.documents.length} document(s)` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <h3>Resources</h3>
      {resources.length === 0 ? (
        <p className="portal-empty">No extra resources.</p>
      ) : (
        <ul>
          {resources.map((r) => (
            <li key={r._id}>
              {r.title || 'Resource'} — {r.course?.title}
              {r.fileUrl ? (
                <>
                  {' '}
                  <a href={absFileUrl(r.fileUrl)} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StudentContent;
