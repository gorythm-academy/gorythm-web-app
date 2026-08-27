import React from 'react';
import { ACTIVE_RECORDS_LABEL, QUARANTINE_LABEL } from '../../../utils/adminListLabels';

export default function LmsTrashTabs({ mode, onChange, trashCount = 0, className = '' }) {
  return (
    <div className={`lms-trash-tabs ${className}`.trim()}>
      <button
        type="button"
        className={`lms-trash-tabs__btn ${mode === 'active' ? 'is-active' : ''}`}
        onClick={() => onChange('active')}
      >
        {ACTIVE_RECORDS_LABEL}
      </button>
      <button
        type="button"
        className={`lms-trash-tabs__btn lms-trash-tabs__btn--trash ${mode === 'trash' ? 'is-active' : ''}`}
        onClick={() => onChange('trash')}
      >
        <i className="fas fa-archive" aria-hidden />
        {QUARANTINE_LABEL}
        {trashCount > 0 ? <span className="lms-trash-tabs__count">{trashCount}</span> : null}
      </button>
    </div>
  );
}
