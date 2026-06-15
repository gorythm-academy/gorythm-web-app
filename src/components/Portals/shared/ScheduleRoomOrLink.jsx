import React from 'react';
import { getMeetingHref } from '../../../utils/scheduleRoomOrLink';

export function ScheduleRoomOrLink({ value, className = 'portal-schedule-link' }) {
  if (!value) return '—';
  const href = getMeetingHref(value);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        Join meeting
      </a>
    );
  }
  return value;
}

export default ScheduleRoomOrLink;
