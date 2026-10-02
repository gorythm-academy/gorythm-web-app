import { useCallback, useEffect, useState } from 'react';
import { portalGet } from '../components/Portals/shared/portalApi';
import { getPortalSeenCutoff } from '../utils/portalNewItems';
import { PORTAL_SEEN_UPDATED_EVENT } from './useStudentPortalBadges';

const SEEN_PROGRESS = 'parent_progress';

export function useParentPortalBadges(enabled) {
  const [badges, setBadges] = useState({ progress: 0 });

  const refresh = useCallback(() => {
    if (!enabled) return;
    const q = new URLSearchParams({
      sinceProgress: getPortalSeenCutoff(SEEN_PROGRESS),
    });
    portalGet(`/parent/badges?${q.toString()}`)
      .then((res) => {
        if (!res?.success) throw new Error(res?.error || 'Failed to load badges');
        setBadges({ progress: Number(res.progress) || 0 });
      })
      .catch((err) => {
        console.warn('Parent portal badges failed:', err);
        setBadges({ progress: 0 });
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onSeen = () => refresh();
    window.addEventListener(PORTAL_SEEN_UPDATED_EVENT, onSeen);
    return () => window.removeEventListener(PORTAL_SEEN_UPDATED_EVENT, onSeen);
  }, [enabled, refresh]);

  return badges;
}
