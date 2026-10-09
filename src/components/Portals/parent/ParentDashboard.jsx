import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { portalGet, readPortalCache } from '../shared/portalApi';
import {
  PortalAlert,
  PortalPageHeader,
  PortalSummaryGridSkeleton,
  SummaryGrid,
} from '../shared/PortalUi';
import { studentIdLabel } from '../shared/StudentIdentity';
import { formatScheduleTimeLabel } from '../../../utils/formatScheduleLabel';

const ParentDashboard = () => {
  const [data, setData] = useState(() => readPortalCache('/parent/dashboard'));
  const [error, setError] = useState('');

  useEffect(() => {
    portalGet('/parent/dashboard')
      .then((res) => {
        if (res.success) setData(res);
        else setError(res.error || 'Failed to load');
      })
      .catch((err) => setError(err.message));
  }, []);

  const loading = !data;
  const s = data?.summary || {};
  const children = data?.children || [];

  return (
    <div className="portal-page">
      <PortalPageHeader title="Parent Dashboard" subtitle="Overview of your linked children" />

      <div className="portal-hero portal-hero--parent">
        <div className="portal-hero__icon" aria-hidden="true">
          <i className="fa-solid fa-users" />
        </div>
        <div>
          <h2>Family Learning Hub</h2>
          <p>View attendance, assignments, and quiz results in Progress. Courses and fees are on the Fees tab.</p>
        </div>
      </div>

      {error ? <PortalAlert type="error">{error}</PortalAlert> : null}
      {loading ? (
        <PortalSummaryGridSkeleton items={4} />
      ) : (
        <SummaryGrid
          items={[
            { label: 'Children Linked', value: s.childrenCount ?? 0, to: '/parent/children' },
            { label: 'Courses', value: s.enrollmentsCount ?? 0, to: '/parent/billing' },
            { label: 'Attendance Records', value: s.attendanceRecords ?? 0, to: '/parent/progress' },
            { label: 'Pending Fees', value: s.pendingFees ?? 0, to: '/parent/billing' },
          ]}
        />
      )}

      {!loading && children.length ? (
        <div className="portal-panel">
          <div className="portal-panel__head">
            <div>
              <h2>Linked students</h2>
              <p>Use the Student ID when you contact the academy or pay a fee.</p>
            </div>
          </div>
          <div className="portal-panel__body portal-panel__body--padded">
            <ul className="portal-linked-students">
              {children.map((link) => {
                const courses = link.courses || [];
                return (
                  <li key={link._id}>
                    <div className="portal-linked-students__who">
                      <strong>{link.student?.name || '—'}</strong>
                      <span className="portal-linked-students__id">
                        Student ID {studentIdLabel(link.student?.studentId)}
                      </span>
                    </div>
                    <div className="portal-linked-students__courses">
                      {courses.length ? courses.map((course, index) => (
                        <p key={`${link._id}-${index}`} className="portal-linked-students__course">
                          <strong>{course.courseName || '—'}</strong>
                          <span>
                            {course.scheduleLocked
                              ? 'After the fee is received'
                              : course.startTime
                                ? formatScheduleTimeLabel(course)
                                : 'Time not assigned'}
                          </span>
                        </p>
                      )) : (
                        <span className="portal-linked-students__empty">No courses yet</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="portal-quick-links">
        <Link to="/parent/children" className="portal-card portal-link-card">
          My children →
        </Link>
        <Link to="/parent/billing" className="portal-card portal-link-card">
          Pay Fees →
        </Link>
        <Link to="/parent/progress" className="portal-card portal-link-card">
          Progress & Results →
        </Link>
      </div>
    </div>
  );
};

export default ParentDashboard;
