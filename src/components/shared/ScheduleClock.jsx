import React, { useMemo } from 'react';
import { describeScheduleClock, readViewerTimeZone } from '../../utils/scheduleClock';
import { formatScheduleTimeLabel } from '../../utils/formatScheduleLabel';
import './ScheduleClock.scss';

export function useScheduleClock(slot, audience = 'student') {
    const viewerTimeZone = useMemo(() => readViewerTimeZone(), []);
    return useMemo(
        () => (slot ? describeScheduleClock(slot, { audience, viewerTimeZone }) : null),
        [slot, audience, viewerTimeZone]
    );
}

export default function ScheduleClock({ slot, audience = 'student', hideDay = false, clock }) {
    const live = useScheduleClock(clock === undefined ? slot : null, audience);
    const view = clock === undefined ? live : clock;
    if (!view) {
        const fallback = formatScheduleTimeLabel(slot);
        return fallback ? <span className="schedule-clock__fallback">{fallback}</span> : null;
    }

    const when = hideDay ? view.primary.time : `${view.primary.day}, ${view.primary.time}`;
    return (
        <span className={`schedule-clock schedule-clock--${audience}`}>
            <span className="schedule-clock__when">{when}</span>
            <span className="schedule-clock__tag">{view.primary.tag}</span>
            {view.secondary ? <span className="schedule-clock__secondary">{view.secondary}</span> : null}
        </span>
    );
}
