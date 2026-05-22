import React, { useEffect } from 'react';
import './PortalModal.scss';

export default function PortalModal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="portal-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`portal-modal ${wide ? 'portal-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="portal-modal-header">
          <h2 id="portal-modal-title">{title}</h2>
          <button type="button" className="portal-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="portal-modal-body">{children}</div>
      </div>
    </div>
  );
}
