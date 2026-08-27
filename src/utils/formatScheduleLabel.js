import { formatTime12h } from './formatTime12h';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Day + time only (for display under a course name). */
export const formatScheduleTimeLabel = (slot) => {
    if (!slot) return '';
    const day = DAY_LABELS[slot.dayOfWeek] ?? `Day ${slot.dayOfWeek}`;
    return `${day} ${formatTime12h(slot.startTime)}–${formatTime12h(slot.endTime)}`;
};

/** Day + time + teacher (for enroll dropdowns and full labels). */
export const formatScheduleLabel = (slot) => {
    if (!slot) return '';
    const teacher = slot.teacher?.name || 'Teacher';
    return `${formatScheduleTimeLabel(slot)} · ${teacher}`;
};
