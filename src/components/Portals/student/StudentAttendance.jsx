import React from 'react';
import { PortalPageHeader } from '../shared/PortalUi';
import AttendancePeriodView from '../shared/AttendancePeriodView';
import './StudentAttendance.scss';

const StudentAttendance = () => (
  <div className="portal-page student-attendance">
    <PortalPageHeader
      title="My attendance"
      subtitle="View attendance by course — daily, weekly, or monthly."
    />

    <div className="student-attendance__hero">
      <div className="student-attendance__hero-icon" aria-hidden="true">
        <i className="fas fa-user-check" />
      </div>
      <div>
        <h2>Course attendance</h2>
        <p>
          Select a course below. If you are enrolled in multiple courses, switch the dropdown to see each one
          separately.
        </p>
      </div>
    </div>

    <section className="student-attendance__panel">
      <AttendancePeriodView
        coursesUrl="/student/attendance/courses"
        viewUrl="/student/attendance/view"
      />
    </section>
  </div>
);

export default StudentAttendance;
