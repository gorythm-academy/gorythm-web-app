import React, { useEffect, useMemo, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import { PortalLoading, PortalAlert, PortalPageHeader, PortalCourseToolbar } from '../shared/PortalUi';
import SubmissionFiles from '../shared/SubmissionFiles';
import { markPortalPageVisited } from '../../../utils/portalNewItems';
import './StudentContent.scss';

const SEEN_KEY = 'student_content';

function resourceTypeLabel(type) {
  if (type === 'link') return 'Link';
  if (type === 'note') return 'Note';
  return 'File';
}

function resourceAttachments(resource) {
  if (Array.isArray(resource.attachments) && resource.attachments.length) {
    return resource.attachments.filter(Boolean);
  }
  return resource.fileUrl ? [resource.fileUrl] : [];
}

function ResourceRow({ resource }) {
  const { type, title, description } = resource;
  const attachments = resourceAttachments(resource);

  if (type === 'note') {
    return (
      <tr>
        <td>
          <strong>{title || 'Note'}</strong>
          {description ? <p className="student-content__note">{description}</p> : null}
        </td>
        <td>{resourceTypeLabel(type)}</td>
        <td>
          {attachments.length ? <SubmissionFiles attachments={attachments} /> : '—'}
        </td>
      </tr>
    );
  }

  if (type === 'link') {
    const href = attachments[0] || null;
    return (
      <tr>
        <td>
          <strong>{title || 'Resource'}</strong>
        </td>
        <td>{resourceTypeLabel(type)}</td>
        <td>
          {href ? (
            <a href={href} target="_blank" rel="noreferrer">
              Open link
            </a>
          ) : (
            '—'
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <strong>{title || 'Resource'}</strong>
      </td>
      <td>{resourceTypeLabel(type)}</td>
      <td>
        {attachments.length ? <SubmissionFiles attachments={attachments} /> : '—'}
      </td>
    </tr>
  );
}

const StudentContent = () => {
  const [courses, setCourses] = useState([]);
  const [resources, setResources] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
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

  useEffect(() => {
    markPortalPageVisited(SEEN_KEY);
  }, []);

  const courseOptions = useMemo(
    () => courses.map((c) => ({ _id: c._id, title: c.title })),
    [courses]
  );

  const filteredResources = useMemo(() => {
    if (!courseFilter || courseFilter === 'all') return resources;
    return resources.filter((r) => {
      const id = r.course?._id || r.course;
      return id && String(id) === String(courseFilter);
    });
  }, [resources, courseFilter]);

  const resourcesByCourse = useMemo(() => {
    const groups = new Map();
    for (const r of filteredResources) {
      const courseId = String(r.course?._id || r.course || 'unknown');
      const courseTitle = r.course?.title || 'Course';
      if (!groups.has(courseId)) {
        groups.set(courseId, { courseId, courseTitle, items: [] });
      }
      groups.get(courseId).items.push(r);
    }
    return Array.from(groups.values()).sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));
  }, [filteredResources]);

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
    <div className="portal-page student-content">
      <PortalPageHeader
        title="Course content"
        subtitle="Teacher-shared files, links, and notes for your active enrollments only."
      />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-folder-open" />
        </div>
        <div>
          <h2>Content & resources</h2>
          <p>
            Materials your teachers upload per course (files, links, notes). Use the course filter to focus on one
            class.
          </p>
        </div>
      </div>

      <PortalCourseToolbar
        value={courseFilter}
        onChange={setCourseFilter}
        courses={courseOptions}
        label="Filter by course"
        count={filteredResources.length}
      />

      <div className="portal-panel student-content__resources-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Content & resources</h2>
            <p>Grouped by course — only materials for courses you are actively enrolled in</p>
          </div>
        </div>
        <div className="portal-panel__body portal-panel__body--padded">
          {resourcesByCourse.length === 0 ? (
            <p className="portal-empty">No teacher resources for this selection yet.</p>
          ) : (
            resourcesByCourse.map((group) => (
              <section key={group.courseId} className="student-content__course-group">
                <h3 className="student-content__course-heading">{group.courseTitle}</h3>
                <div className="portal-data-table-wrap">
                  <table className="portal-data-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((r) => (
                        <ResourceRow key={r._id} resource={r} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentContent;
