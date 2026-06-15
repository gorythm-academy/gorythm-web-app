import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { portalGet } from '../components/Portals/shared/portalApi';
import { getItemsNewSinceLastVisit } from '../utils/portalNewItems';

const SEEN_SUBMISSIONS = 'teacher_submissions';
const SEEN_QUIZ_ATTEMPTS = 'teacher_quiz_attempts';

export function useTeacherPortalBadges(enabled) {
  const location = useLocation();
  const [badges, setBadges] = useState({ submissions: 0, quizAttempts: 0 });

  const refresh = useCallback(() => {
    if (!enabled) return;
    Promise.all([portalGet('/teacher/submissions'), portalGet('/teacher/quiz-attempts')])
      .then(([sRes, qRes]) => {
        const submissions = (sRes.success ? sRes.submissions || [] : []).map((s) => ({
          ...s,
          submittedAt: s.submittedAt || s.createdAt,
        }));
        const attempts = qRes.success ? qRes.attempts || [] : [];
        setBadges({
          submissions: getItemsNewSinceLastVisit(SEEN_SUBMISSIONS, submissions, {
            dateField: 'submittedAt',
          }).length,
          quizAttempts: getItemsNewSinceLastVisit(SEEN_QUIZ_ATTEMPTS, attempts).length,
        });
      })
      .catch(() => {
        setBadges({ submissions: 0, quizAttempts: 0 });
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onSeen = () => refresh();
    window.addEventListener('portal-seen-updated', onSeen);
    return () => window.removeEventListener('portal-seen-updated', onSeen);
  }, [enabled, refresh]);

  return badges;
}
