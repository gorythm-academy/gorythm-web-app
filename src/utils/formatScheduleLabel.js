import { formatTime12h } from './formatTime12h';
import { describeScheduleClock, officialZoneShort } from './scheduleClock';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Official class clock, labeled with its timezone (PKT for Pakistan). */
export const formatScheduleTimeLabel = (slot) => {
    if (!slot) return '';
    const day = DAY_LABELS[slot.dayOfWeek] ?? `Day ${slot.dayOfWeek}`;
    const range = `${formatTime12h(slot.startTime)}–${formatTime12h(slot.endTime)}`;
    return `${day} ${range} ${officialZoneShort(slot.timezone)}`.trim();
};

/** Day + official time + the viewer's local time when they are outside that zone. */
export const formatScheduleLabel = (slot) => {
    if (!slot) return '';
    const teacher = slot.teacher?.name || 'Teacher';
    const clock = describeScheduleClock(slot, { audience: 'staff' });
    const local = clock?.secondary ? ` · ${clock.secondary}` : '';
    return `${formatScheduleTimeLabel(slot)}${local} · ${teacher}`;
};
