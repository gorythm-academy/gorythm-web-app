import { useCallback, useEffect, useState } from 'react';
import { lmsAdminGet } from '../utils/lmsAdminApi';
import {
  badgesFromLmsTabBadgesResponse,
  lmsTabBadgesClientCache,
} from '../utils/lmsTabBadgesClientCache';
import {
  ADMIN_LMS_ATTENDANCE_UPDATED_EVENT,
  ADMIN_LMS_BADGE_LOAD_FAILED_EVENT,
} from '../utils/adminEvents';

export { ADMIN_LMS_ATTENDANCE_UPDATED_EVENT } from '../utils/adminEvents';

const EMPTY_BADGES = {
  lmsAttendance: 0,
  lmsAttendanceBreakdown: { attendance: 0, payroll: 0 },
};

export function fetchLmsTabBadges(options = {}) {
  if (!options.force) {
    const cached = lmsTabBadgesClientCache.get();
    if (cached) return Promise.resolve(cached);
  }
  return lmsAdminGet('/lms-tab-badges').then((res) => {
    if (!res?.success) throw new Error(res?.error || 'Failed to load LMS badges');
    const next = badgesFromLmsTabBadgesResponse(res);
    lmsTabBadgesClientCache.set(next);
    return next;
  });
}

export function invalidateLmsTabBadgesCache() {
  lmsTabBadgesClientCache.invalidate();
}

export function useAdminPortalBadges(enabled = true) {
  const [badges, setBadges] = useState(() => lmsTabBadgesClientCache.get() || EMPTY_BADGES);
  const [lmsBadgeLoadFailed, setLmsBadgeLoadFailed] = useState(false);

  const refresh = useCallback((options = {}) => {
    if (!enabled) return;
    fetchLmsTabBadges(options)
      .then((next) => {
        setLmsBadgeLoadFailed(false);
        setBadges(next);
      })
      .catch(() => {
        setLmsBadgeLoadFailed(true);
        window.dispatchEvent(new Event(ADMIN_LMS_BADGE_LOAD_FAILED_EVENT));
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onUpdated = () => refresh({ force: true });
    window.addEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onUpdated);
  }, [enabled, refresh]);

  return { ...badges, lmsBadgeLoadFailed };
}
