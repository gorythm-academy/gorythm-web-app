import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { lmsAdminGet } from '../utils/lmsAdminApi';
import { API_BASE_URL } from '../config/constants';
import { getAuthToken } from '../utils/authStorage';
import {
  badgesFromLmsTabBadgesResponse,
  lmsTabBadgesClientCache,
} from '../utils/lmsTabBadgesClientCache';
import {
  ADMIN_LMS_ATTENDANCE_UPDATED_EVENT,
  ADMIN_LMS_BADGE_LOAD_FAILED_EVENT,
} from '../utils/adminEvents';
import {
  ADMIN_SEEN_TAB_ASSIGNMENTS,
  ADMIN_SEEN_TAB_RESOURCES,
  ADMIN_SEEN_TAB_SUBMISSIONS,
  ADMIN_SEEN_PAYMENTS,
  getPortalSeenCutoff,
} from '../utils/portalNewItems';

export { ADMIN_LMS_ATTENDANCE_UPDATED_EVENT } from '../utils/adminEvents';

const EMPTY_BADGES = {
  lmsAttendance: 0,
  lmsAttendanceBreakdown: { attendance: 0, payroll: 0 },
  resourcesSubmissions: 0,
  resourcesTabCounts: { assignments: 0, resources: 0, submissions: 0 },
  paymentsNew: 0,
};

const AdminPortalBadgesContext = createContext(null);

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

function fetchResourcesSubmissionsBadge() {
  const q = new URLSearchParams({
    sinceAssignments: getPortalSeenCutoff(ADMIN_SEEN_TAB_ASSIGNMENTS),
    sinceResources: getPortalSeenCutoff(ADMIN_SEEN_TAB_RESOURCES),
    sinceSubmissions: getPortalSeenCutoff(ADMIN_SEEN_TAB_SUBMISSIONS),
  });
  return lmsAdminGet(`/resources-submissions-badge?${q.toString()}`).then((res) => {
    if (!res?.success) throw new Error(res?.error || 'Failed to load resources badge');
    const tabCounts = res.tabCounts || res.breakdown || {};
    const assignments = Number(tabCounts.assignments) || 0;
    const resources = Number(tabCounts.resources) || 0;
    const submissions = Number(tabCounts.submissions) || 0;
    return {
      total: assignments + resources + submissions,
      tabCounts: { assignments, resources, submissions },
    };
  });
}

function fetchPaymentsBadge() {
  const token = getAuthToken();
  if (!token) return Promise.resolve(0);
  return axios.get(`${API_BASE_URL}/api/payments/admin/unseen-count`, {
    params: { since: getPortalSeenCutoff(ADMIN_SEEN_PAYMENTS) },
    headers: { Authorization: `Bearer ${token}` },
  }).then((res) => Number(res.data?.count) || 0);
}

function useAdminPortalBadgesState(enabled = true) {
  const [badges, setBadges] = useState(() => ({
    ...(lmsTabBadgesClientCache.get() || EMPTY_BADGES),
    resourcesSubmissions: 0,
    paymentsNew: 0,
  }));
  const [lmsBadgeLoadFailed, setLmsBadgeLoadFailed] = useState(false);

  const refresh = useCallback((options = {}) => {
    if (!enabled) return;
    Promise.all([
      fetchLmsTabBadges(options).catch(() => null),
      fetchResourcesSubmissionsBadge().catch(() => ({ total: 0, tabCounts: EMPTY_BADGES.resourcesTabCounts })),
      fetchPaymentsBadge().catch(() => 0),
    ]).then(([lmsBadges, resourcesBadge, paymentsNew]) => {
      const resourcesCount = resourcesBadge?.total || 0;
      const tabCounts = resourcesBadge?.tabCounts || EMPTY_BADGES.resourcesTabCounts;
      const paymentsCount = Number(paymentsNew) || 0;
      if (lmsBadges) {
        setLmsBadgeLoadFailed(false);
        setBadges((prev) => ({
          ...prev,
          ...lmsBadges,
          resourcesSubmissions: resourcesCount,
          resourcesTabCounts: tabCounts,
          paymentsNew: paymentsCount,
        }));
      } else {
        setLmsBadgeLoadFailed(true);
        window.dispatchEvent(new Event(ADMIN_LMS_BADGE_LOAD_FAILED_EVENT));
        setBadges((prev) => ({
          ...prev,
          resourcesSubmissions: resourcesCount,
          resourcesTabCounts: tabCounts,
          paymentsNew: paymentsCount,
        }));
      }
    });
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onUpdated = () => refresh({ force: true });
    const onSeen = () => refresh();
    window.addEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onUpdated);
    window.addEventListener('portal-seen-updated', onSeen);
    return () => {
      window.removeEventListener(ADMIN_LMS_ATTENDANCE_UPDATED_EVENT, onUpdated);
      window.removeEventListener('portal-seen-updated', onSeen);
    };
  }, [enabled, refresh]);

  return { ...badges, lmsBadgeLoadFailed };
}

export function AdminPortalBadgesProvider({ children }) {
  const value = useAdminPortalBadgesState(true);
  return (
    <AdminPortalBadgesContext.Provider value={value}>{children}</AdminPortalBadgesContext.Provider>
  );
}

export function useAdminPortalBadges() {
  const ctx = useContext(AdminPortalBadgesContext);
  if (!ctx) {
    return { ...EMPTY_BADGES, lmsBadgeLoadFailed: false };
  }
  return ctx;
}
