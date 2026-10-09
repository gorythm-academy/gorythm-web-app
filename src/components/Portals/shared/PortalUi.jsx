import React from 'react';
import { Link } from 'react-router-dom';
import { billingStatusLabel } from '../../../utils/billingLabels';
import './PortalUi.scss';
import './PortalPages.scss';

export function PortalLoading({ label = 'Loading…' }) {
  return <p className="portal-ui-loading">{label}</p>;
}

/** Static page chrome (title, hero, toolbars) stays visible; only the data area waits on the API. */
export function PortalDataSection({
  loading = false,
  error = '',
  loadingLabel = 'Loading…',
  className = '',
  children,
}) {
  if (error) {
    return (
      <div className={`portal-data-section ${className}`.trim()}>
        <PortalAlert type="error">{error}</PortalAlert>
      </div>
    );
  }
  if (loading) {
    return (
      <div className={`portal-data-section portal-data-section--loading ${className}`.trim()}>
        <PortalLoading label={loadingLabel} />
      </div>
    );
  }
  return <div className={`portal-data-section ${className}`.trim()}>{children}</div>;
}

export function PortalSummaryGridSkeleton({ items = 4 }) {
  return (
    <div
      className="portal-grid portal-summary-grid portal-summary-grid--skeleton"
      aria-busy="true"
      aria-label="Loading summary"
    >
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="portal-card portal-summary-card portal-summary-card--skeleton">
          <span className="portal-skeleton-line portal-skeleton-line--label" />
          <strong className="portal-skeleton-line portal-skeleton-line--value" />
        </div>
      ))}
    </div>
  );
}

export function PortalAlert({ type = 'info', children }) {
  return <p className={`portal-ui-alert portal-ui-alert--${type}`}>{children}</p>;
}

export function PortalPageHeader({ title, subtitle }) {
  return (
    <header className="portal-page-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

export function SummaryGrid({ items }) {
  return (
    <div className="portal-grid portal-summary-grid">
      {items.map((item) => {
        const body = (
          <>
            <span className="portal-summary-label">{item.label}</span>
            <strong className="portal-summary-value">{item.value}</strong>
          </>
        );
        if (item.to) {
          return (
            <Link
              key={item.label}
              to={item.to}
              className="portal-card portal-summary-card portal-summary-card--link"
            >
              {body}
            </Link>
          );
        }
        return (
          <div key={item.label} className="portal-card portal-summary-card">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function FeeBadge({ status }) {
  const s = status === 'completed' ? 'paid' : status === 'pending' ? 'unpaid' : status || 'unpaid';
  return <span className={`portal-fee-badge portal-fee-badge--${s}`}>{billingStatusLabel(s)}</span>;
}

export function PortalCourseToolbar({ value, onChange, courses, label = 'Course', count }) {
  return (
    <div className="portal-course-toolbar">
      <label className="portal-course-toolbar__field">
        <span>{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="all">All courses</option>
          {courses.map((c) => (
            <option key={c._id} value={c._id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      {value && count != null ? (
        <span className="portal-course-toolbar__meta">
          {count} item{count === 1 ? '' : 's'}
        </span>
      ) : null}
    </div>
  );
}

export function PortalNewBanner({ title, items, itemLabel, onDismiss }) {
  if (!items?.length) return null;
  return (
    <div className="portal-new-banner" role="status">
      <div className="portal-new-banner__body">
        <strong>{title}</strong>
        <ul>
          {items.map((item) => (
            <li key={item._id}>
              {itemLabel(item)}
              {item.course?.title ? ` — ${item.course.title}` : ''}
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}

export function PortalActivityBanner({
  title,
  rows,
  rowKey = (row) => `${row.id}-${row.message}`,
  onDismiss,
  tone,
  dismissLabel = 'Dismiss',
  className = '',
}) {
  if (!rows?.length) return null;
  return (
    <div
      className={`portal-admin-edit-banner${tone ? ` portal-admin-edit-banner--${tone}` : ''}${className ? ` ${className}` : ''}`}
      role="status"
    >
      <strong>{title}</strong>
      <ul>
        {rows.map((row) => (
          <li key={rowKey(row)}>
            <span>{row.title}: </span>
            {row.message}
          </li>
        ))}
      </ul>
      {onDismiss ? (
        <button
          type="button"
          className="lms-btn-secondary lms-btn-secondary--compact portal-admin-edit-banner__dismiss"
          onClick={onDismiss}
        >
          {dismissLabel}
        </button>
      ) : null}
    </div>
  );
}
