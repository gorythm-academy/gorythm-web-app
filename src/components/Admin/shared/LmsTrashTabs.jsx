import React from 'react';

export default function LmsTrashTabs({ mode, onChange, trashCount = 0, className = '' }) {
  return (
    <div className={`lms-trash-tabs ${className}`.trim()}>
      <button
        type="button"
        className={`lms-trash-tabs__btn ${mode === 'active' ? 'is-active' : ''}`}
        onClick={() => onChange('active')}
      >
        Active
      </button>
      <button
        type="button"
        className={`lms-trash-tabs__btn lms-trash-tabs__btn--trash ${mode === 'trash' ? 'is-active' : ''}`}
        onClick={() => onChange('trash')}
      >
        <i className="fas fa-trash-alt" aria-hidden />
        Trash
        {trashCount > 0 ? <span className="lms-trash-tabs__count">{trashCount}</span> : null}
      </button>
    </div>
  );
}
