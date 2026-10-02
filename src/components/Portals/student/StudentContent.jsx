import React, { useEffect, useMemo, useState } from 'react';
import { portalGet } from '../shared/portalApi';
import {
  PortalDataSection,
  PortalPageHeader,
  PortalCourseToolbar,
  PortalNewBanner,
} from '../shared/PortalUi';
import PortalContentResourcesTable from '../shared/PortalContentResourcesTable';
import LmsMaterialPreviewModal from '../../Admin/shared/LmsMaterialPreviewModal';
import {
  filterPortalItemsByCourse,
  getItemsNewSinceLastVisit,
  markPortalPageVisited,
} from '../../../utils/portalNewItems';
import '../../Admin/pages/LmsManagement.scss';
import './StudentContent.scss';

const SEEN_KEY = 'student_content';

const StudentContent = () => {
  const [courses, setCourses] = useState([]);
  const [resources, setResources] = useState([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewResource, setPreviewResource] = useState(null);
  const [newItems, setNewItems] = useState([]);

  useEffect(() => {
    portalGet('/student/content')
      .then((res) => {
        if (res.success) {
          const list = res.resources || [];
          setCourses(res.courses || []);
          setResources(list);
          setNewItems(getItemsNewSinceLastVisit(SEEN_KEY, list));
        } else setError(res.error || 'Failed to load');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => markPortalPageVisited(SEEN_KEY);
  }, []);

  const dismissNew = () => {
    markPortalPageVisited(SEEN_KEY);
    setNewItems([]);
  };

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

  const visibleNew = useMemo(
    () => (courseFilter && courseFilter !== 'all' ? filterPortalItemsByCourse(newItems, courseFilter) : newItems),
    [newItems, courseFilter]
  );

  return (
    <div className="portal-page student-content">
      <PortalPageHeader
        title="Course Content"
        subtitle="Teacher-shared files, links, and notes for your active enrollments only."
      />

      <PortalNewBanner
        title={`${visibleNew.length} new item${visibleNew.length === 1 ? '' : 's'} available`}
        items={visibleNew}
        itemLabel={(item) => item.title}
        onDismiss={dismissNew}
      />

      <div className="portal-hero portal-hero--student">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-folder-open" />
        </div>
        <div>
          <h2>Content & Resources</h2>
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
        count={loading ? null : filteredResources.length}
      />

      <div className="portal-panel student-content__resources-panel">
        <div className="portal-panel__head">
          <div>
            <h2>Content & Resources</h2>
            <p>View-only — open Preview to read notes, files, and links</p>
          </div>
        </div>
        <div className="portal-panel__body portal-panel__body--padded">
          <PortalDataSection loading={loading} error={error} loadingLabel="Loading resources…">
            <PortalContentResourcesTable
              resources={filteredResources}
              onPreview={setPreviewResource}
              emptyMessage="There is no learning material to show for this course yet."
            />
          </PortalDataSection>
        </div>
      </div>

      <LmsMaterialPreviewModal
        open={Boolean(previewResource)}
        kind="resource"
        item={previewResource}
        onClose={() => setPreviewResource(null)}
        hideUploader
        tone="student"
      />
    </div>
  );
};

export default StudentContent;
