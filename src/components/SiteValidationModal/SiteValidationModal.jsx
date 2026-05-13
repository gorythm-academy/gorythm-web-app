import React, { useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { FiAlertCircle, FiX } from 'react-icons/fi';
import './SiteValidationModal.scss';

/**
 * Same design as Contact page validation popup; portaled to `document.body` for stacking.
 */
const SiteValidationModal = ({ open, title, issues, onClose, showIcon = true }) => {
  const closeBtnRef = useRef(null);
  const titleId = useId();

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const list = Array.isArray(issues) ? issues.filter(Boolean) : [];
  if (list.length === 0) return null;

  const node = (
    <div
      className="site-validation-modal"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) handleClose();
      }}
    >
      <div
        className="site-validation-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          className={`site-validation-modal__head${showIcon ? '' : ' site-validation-modal__head--no-icon'}`}
        >
          {showIcon ? (
            <span className="site-validation-modal__icon" aria-hidden="true">
              <FiAlertCircle />
            </span>
          ) : null}
          <h2 id={titleId} className="site-validation-modal__title">
            {title || 'Please check the following'}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="site-validation-modal__close"
            onClick={handleClose}
            aria-label="Close"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>
        <ul
          className={`site-validation-modal__list${showIcon ? '' : ' site-validation-modal__list--notice'}`}
        >
          {list.map((line, i) => (
            <li key={`${i}-${String(line).slice(0, 48)}`}>{line}</li>
          ))}
        </ul>
        <button type="button" className="site-validation-modal__ok" onClick={handleClose}>
          OK
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
};

export default SiteValidationModal;
