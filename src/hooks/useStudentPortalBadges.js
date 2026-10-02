import { useCallback, useEffect, useState } from 'react';
import { portalGet } from '../components/Portals/shared/portalApi';
import { getPortalSeenCutoff } from '../utils/portalNewItems';

const SEEN_ASSIGNMENTS = 'student_assignments';
const SEEN_QUIZZES = 'student_quizzes';
const SEEN_CONTENT = 'student_content';

export const PORTAL_SEEN_UPDATED_EVENT = 'portal-seen-updated';

export function useStudentPortalBadges(enabled) {
  const [badges, setBadges] = useState({
    assignments: 0,
    assignmentsEdit: false,
    quizzes: 0,
    quizzesEdit: false,
    content: 0,
  });

  const refresh = useCallback(() => {
    if (!enabled) return;
    const q = new URLSearchParams({
      sinceAssignments: getPortalSeenCutoff(SEEN_ASSIGNMENTS),
      sinceQuizzes: getPortalSeenCutoff(SEEN_QUIZZES),
      sinceContent: getPortalSeenCutoff(SEEN_CONTENT),
    });
    portalGet(`/student/badges?${q.toString()}`)
      .then((res) => {
        if (!res?.success) throw new Error(res?.error || 'Failed to load badges');
        setBadges({
          assignments: Number(res.assignments) || 0,
          assignmentsEdit: Boolean(res.assignmentsEdit),
          quizzes: Number(res.quizzes) || 0,
          quizzesEdit: Boolean(res.quizzesEdit),
          content: Number(res.content) || 0,
        });
      })
      .catch((err) => {
        console.warn('Student portal badges failed:', err);
        setBadges({ assignments: 0, assignmentsEdit: false, quizzes: 0, quizzesEdit: false, content: 0 });
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
