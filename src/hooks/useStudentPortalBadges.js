import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { portalGet } from '../components/Portals/shared/portalApi';
import { getItemsNewSinceLastVisit } from '../utils/portalNewItems';

const SEEN_ASSIGNMENTS = 'student_assignments';
const SEEN_QUIZZES = 'student_quizzes';
const SEEN_CONTENT = 'student_content';

export const PORTAL_SEEN_UPDATED_EVENT = 'portal-seen-updated';

export function useStudentPortalBadges(enabled) {
  const location = useLocation();
  const [badges, setBadges] = useState({ assignments: 0, quizzes: 0, content: 0 });

  const refresh = useCallback(() => {
    if (!enabled) return;
    Promise.all([
      portalGet('/student/assignments'),
      portalGet('/student/quizzes'),
      portalGet('/student/content'),
    ])
      .then(([aRes, qRes, cRes]) => {
        const assignments = aRes.success ? aRes.assignments || [] : [];
        const quizzes = qRes.success ? qRes.quizzes || [] : [];
        const resources = cRes.success ? cRes.resources || [] : [];
        setBadges({
          assignments: getItemsNewSinceLastVisit(SEEN_ASSIGNMENTS, assignments).length,
          quizzes: getItemsNewSinceLastVisit(SEEN_QUIZZES, quizzes).length,
          content: getItemsNewSinceLastVisit(SEEN_CONTENT, resources).length,
        });
      })
      .catch((err) => {
        console.warn('Student portal badges failed:', err);
        setBadges({ assignments: 0, quizzes: 0, content: 0 });
      });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh, location.pathname]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onSeen = () => refresh();
    window.addEventListener(PORTAL_SEEN_UPDATED_EVENT, onSeen);
    return () => window.removeEventListener(PORTAL_SEEN_UPDATED_EVENT, onSeen);
  }, [enabled, refresh]);

  return badges;
}
