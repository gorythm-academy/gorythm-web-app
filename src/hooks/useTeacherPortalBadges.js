import { useCallback, useEffect, useState } from 'react';
import { portalGet } from '../components/Portals/shared/portalApi';
import {
  getPortalSeenCutoff,
  TEACHER_SEEN_ADMIN_ASSIGNMENTS,
  TEACHER_SEEN_ADMIN_RESOURCES,
} from '../utils/portalNewItems';

const SEEN_SUBMISSIONS = 'teacher_submissions';
const SEEN_QUIZ_ATTEMPTS = 'teacher_quiz_attempts';

export function useTeacherPortalBadges(enabled) {
  const [badges, setBadges] = useState({
    submissions: 0,
    submissionsEdit: false,
    adminResources: 0,
    quizAttempts: 0,
  });

  const refresh = useCallback(() => {
    if (!enabled) return;
    const q = new URLSearchParams({
      sinceSubmissions: getPortalSeenCutoff(SEEN_SUBMISSIONS),
      sinceQuizAttempts: getPortalSeenCutoff(SEEN_QUIZ_ATTEMPTS),
      sinceAdminAssignments: getPortalSeenCutoff(TEACHER_SEEN_ADMIN_ASSIGNMENTS),
      sinceAdminResources: getPortalSeenCutoff(TEACHER_SEEN_ADMIN_RESOURCES),
    });
    portalGet(`/teacher/badges?${q.toString()}`)
      .then((res) => {
        if (!res?.success) throw new Error(res?.error || 'Failed to load badges');
        setBadges({
          submissions: Number(res.submissions) || 0,
          submissionsEdit: Boolean(res.submissionsEdit),
          adminResources: Number(res.adminResources) || 0,
          quizAttempts: Number(res.quizAttempts) || 0,
        });
      })
      .catch((err) => {
        console.warn('Teacher portal badges failed:', err);
        setBadges({ submissions: 0, submissionsEdit: false, adminResources: 0, quizAttempts: 0 });
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onSeen = () => refresh();
    window.addEventListener('portal-seen-updated', onSeen);
    return () => window.removeEventListener('portal-seen-updated', onSeen);
  }, [enabled, refresh]);

  return badges;
}
