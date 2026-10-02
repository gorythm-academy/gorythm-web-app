import React, { useId } from 'react';

/** Collapsible section using the standard portal-panel styling (chevron up/down). */
export default function PortalCollapsiblePanel({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  bodyClassName = '',
}) {
  const bodyId = useId();

  return (
    <section
      className={`portal-panel portal-panel--collapsible ${expanded ? 'is-expanded' : 'is-collapsed'}`}
    >
      <button
        type="button"
        className="portal-panel__toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <div className="portal-panel__toggle-text">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span className="portal-panel__chevron" aria-hidden>
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} />
        </span>
      </button>
      {expanded ? (
        <div className={['portal-panel__body', bodyClassName].filter(Boolean).join(' ')} id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
