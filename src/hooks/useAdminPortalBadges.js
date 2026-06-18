import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { lmsAdminGet } from '../utils/lmsAdminApi';

export const ADMIN_LMS_ATTENDANCE_UPDATED_EVENT = 'admin-lms-attendance-updated';

export function useAdminPortalBadges(enabled = true) {
  const location = useLocation();
  const [badges, setBadges] = useState({ lmsAttendance: 0 });

  const refresh = useCallback(() => {
    if (!enabled) return;
    lmsAdminGet('/lms-tab-badges')
      .then((res) => {
        if (!res.success) {
          setBadges({ lmsAttendance: 0 });
          return;
        }
        const attendance = Number(res.attendanceCount) || 0;
        const payroll = Number(res.payrollCount) || 0;
        setBadges({ lmsAttendance: attendance + payroll });
      })
      .catch(() => setBadges({ lmsAttendance: 0 }));
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onUpdated = () => refresh();
    window.addEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onUpdated);
  }, [enabled, refresh]);

  return badges;
}
