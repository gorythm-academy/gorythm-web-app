import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../../../config/constants';
import { getAuthToken } from '../../../utils/authStorage';
import ContactMessages from './ContactMessages';
import TrialRequests from './TrialRequests';
import './LmsManagement.scss';

const TABS = [
  { id: 'trials', label: 'Free Trials', countKey: 'trials' },
  { id: 'messages', label: 'Messages', countKey: 'messages' },
];

const TrialsAndMessages = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab = requested === 'messages' ? 'messages' : 'trials';
  const [counts, setCounts] = useState({ trials: 0, messages: 0 });

  const selectTab = (tabId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tabId === 'trials') next.delete('tab');
        else next.set('tab', tabId);
        return next;
      },
      { replace: true }
    );
  };

  const loadCounts = useCallback(() => {
    const headers = { Authorization: `Bearer ${getAuthToken()}` };
    Promise.all([
      axios.get(`${API_BASE_URL}/api/trials/admin/unseen-count`, { headers }).then((res) => Number(res.data?.count) || 0).catch(() => 0),
      axios.get(`${API_BASE_URL}/api/contact/admin/unseen-count`, { headers }).then((res) => Number(res.data?.count) || 0).catch(() => 0),
    ]).then(([trials, messages]) => {
      setCounts({ trials, messages });
    });
  }, []);

  useEffect(() => {
    loadCounts();
    const onRefresh = () => loadCounts();
    window.addEventListener('portal-seen-updated', onRefresh);
    return () => window.removeEventListener('portal-seen-updated', onRefresh);
  }, [loadCounts]);

  return (
    <div className="lms-management trials-and-messages">
      <h1>Trials & Messages</h1>
      <p className="lms-management-lead">
        Free trial requests and messages from the public website.
      </p>
      <div className="lms-management-tabs" role="tablist" aria-label="Trials and messages">
        {TABS.map((item) => {
          const count = counts[item.countKey] || 0;
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? 'active' : ''}
              onClick={() => selectTab(item.id)}
              aria-label={count > 0 ? `${item.label}, ${count} new` : item.label}
            >
              <span>{item.label}</span>
              {count > 0 ? (
                <span className="lms-tab-badge" aria-hidden="true">
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === 'trials' ? <TrialRequests /> : <ContactMessages embedded />}
    </div>
  );
};

export default TrialsAndMessages;
