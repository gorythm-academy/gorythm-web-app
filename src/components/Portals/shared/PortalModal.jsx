import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../../../hooks/useModalFocus';
import './PortalModal.scss';

export default function PortalModal({ title, onClose, children, wide, tone = 'default', kicker = null }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useModalFocus(dialogRef, true, { onEscape: onClose });

  return createPortal(
    <div className="portal-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`portal-modal portal-modal--${tone} ${wide ? 'portal-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="portal-modal-header">
          <div>
            {kicker ? <p className="portal-modal-kicker">{kicker}</p> : null}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="portal-modal-close" onClick={onClose} aria-label="Close">
            <i className="fas fa-times" aria-hidden />
          </button>
        </header>
        <div className="portal-modal-body">{children}</div>
        <footer className="portal-modal-footer">
          <button type="button" className="portal-modal-dismiss" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
