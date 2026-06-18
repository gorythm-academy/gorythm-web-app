import React from 'react';

export default function LmsCollapsibleFormPanel({
  title,
  subtitle,
  icon = 'fa-plus',
  expanded,
  onToggle,
  children,
  tone = 'indigo',
}) {
  return (
    <section
      className={`lms-collapsible-form lms-collapsible-form--${tone} ${expanded ? 'is-expanded' : 'is-collapsed'}`}
    >
      <button
        type="button"
        className="lms-collapsible-form__toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="lms-collapsible-form__toggle-main">
          <span className="lms-collapsible-form__icon" aria-hidden>
            <i className={`fas ${icon}`} />
          </span>
          <span className="lms-collapsible-form__titles">
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </span>
        </span>
        <span className="lms-collapsible-form__chevron" aria-hidden>
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`} />
        </span>
      </button>
      {expanded ? <div className="lms-collapsible-form__body">{children}</div> : null}
    </section>
  );
}
