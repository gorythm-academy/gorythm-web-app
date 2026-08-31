import React from 'react';

const LmsPanelLoading = ({ label = 'Loading…' }) => (
  <div className="lms-panel-loading" aria-live="polite">
    <div className="lms-panel-loading__spinner" aria-hidden="true" />
    <p>{label}</p>
  </div>
);

export default LmsPanelLoading;
