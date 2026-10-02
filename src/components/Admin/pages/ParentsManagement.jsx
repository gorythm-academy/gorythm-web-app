import React, { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import UsersManagement from './UsersManagement';
import ParentLinksSection from './ParentLinksSection';
import './LmsManagement.scss';

const TABS = [
  { id: 'accounts', label: 'Parent Accounts' },
  { id: 'parent-links', label: 'Parent Links' },
];

const TAB_IDS = TABS.map((t) => t.id);

const ParentsManagement = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => {
    const fromUrl = searchParams.get('tab');
    return TAB_IDS.includes(fromUrl) ? fromUrl : 'accounts';
  }, [searchParams]);

  const selectTab = useCallback(
    (tabId) => {
      if (!TAB_IDS.includes(tabId)) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === 'accounts') next.delete('tab');
          else next.set('tab', tabId);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const tabPanelId = (tabId) => `parents-tabpanel-${tabId}`;

  return (
    <div className="lms-management parents-management">
      <h1>Parents</h1>
      <p className="lms-management-lead">
        Parent and guardian accounts, and links between parents and students.
      </p>
      <div className="lms-management-tabs" role="tablist" aria-label="Parents sections">
        {TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`parents-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={tabPanelId(t.id)}
              className={selected ? 'active' : ''}
              onClick={() => selectTab(t.id)}
            >
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === 'accounts' && (
        <div role="tabpanel" id={tabPanelId('accounts')} aria-labelledby="parents-tab-accounts">
          <UsersManagement variant="parents" embedded />
        </div>
      )}

      {tab === 'parent-links' && <ParentLinksSection panelId={tabPanelId('parent-links')} />}
    </div>
  );
};

export default ParentsManagement;
