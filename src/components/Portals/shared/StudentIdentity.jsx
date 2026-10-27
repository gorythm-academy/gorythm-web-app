import React from 'react';
import { enrollmentStatusLabel, formatDueDate, formatMoney } from '../../../utils/billingLabels';
import ScheduleClock from '../../shared/ScheduleClock';
import { FeeBadge } from './PortalUi';

export function studentIdLabel(studentId) {
  const id = String(studentId || '').trim();
  return id || 'Not assigned yet';
}

export function accountStatusLabel(status) {
  const key = String(status || 'active').toLowerCase();
  if (key === 'inactive') return 'Inactive';
  if (key === 'completed') return 'Completed';
  return 'Active';
}

function enrollmentPillClass(status) {
  if (status === 'active') return 'submitted';
  if (status === 'completed') return 'completed';
  return 'inactive';
}

export function StudentIdLine({ studentId }) {
  return <p className="portal-student-id-line">Student ID {studentIdLabel(studentId)}</p>;
}

export function StudentProfileFields({ profile }) {
  if (!profile) return null;
  const rows = [
    ['Full Name', profile.name || '—'],
    ['Student ID', studentIdLabel(profile.studentId)],
    ['Email', profile.email || '—'],
  ];
  if (String(profile.phone || '').trim()) rows.push(['Phone', profile.phone.trim()]);
  rows.push(['Account Status', accountStatusLabel(profile.status)]);

  return (
    <dl className="portal-identity-fields">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={label === 'Email' ? 'is-email' : undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EnrollmentSummaryList({
  enrollments = [],
  emptyText = 'No courses are listed yet. When the academy adds a course, it will appear here.',
}) {
  if (!enrollments.length) {
    return <p className="portal-student-card__empty">{emptyText}</p>;
  }

  return (
    <div className="portal-data-table-wrap">
      <table className="portal-data-table portal-data-table--green portal-enrollment-table">
        <thead>
          <tr>
            <th>Course</th>
            <th>Status</th>
            <th>Class Time</th>
            <th>Teacher</th>
            <th>Enrolled</th>
            <th>Fee</th>
            <th>Due Date</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((row) => {
            const scheduleText = row.scheduleLocked
              ? 'After the fee is received'
              : row.schedule
                ? <ScheduleClock slot={row.schedule} audience="student" />
                : 'Not assigned yet';
            return (
              <tr key={row.id}>
                <td><strong>{row.courseName || '—'}</strong></td>
                <td>
                  <span className={`portal-status-pill portal-status-pill--${enrollmentPillClass(row.status)}`}>
                    {enrollmentStatusLabel(row.status)}
                  </span>
                </td>
                <td className="portal-enrollment-table__time">{scheduleText}</td>
                <td>{row.teacherName || '—'}</td>
                <td>{formatDueDate(row.enrollmentDate)}</td>
                <td>
                  <FeeBadge status={row.feeStatus} />
                  {row.feeProgress ? <div className="portal-billing-sub">{row.feeProgress}</div> : null}
                </td>
                <td>{formatDueDate(row.dueDate)}</td>
                <td>{row.amount == null || row.amount === '' ? '—' : formatMoney(row.amount, 'EUR')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
