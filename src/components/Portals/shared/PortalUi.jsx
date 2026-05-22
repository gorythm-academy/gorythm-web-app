import React from 'react';
import { Link } from 'react-router-dom';
import './PortalUi.scss';

export function PortalLoading({ label = 'Loading…' }) {
  return <p className="portal-ui-loading">{label}</p>;
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
  const s = status || 'pending';
  return <span className={`portal-fee-badge portal-fee-badge--${s}`}>{s}</span>;
}

export function SimpleTable({
  columns,
  rows,
  emptyLabel = 'No records yet.',
  onRowClick,
  rowClassName,
}) {
  if (!rows?.length) return <p className="portal-empty">{emptyLabel}</p>;
  return (
    <div className="portal-table-wrap">
      <table className={`portal-table ${onRowClick ? 'portal-table--clickable' : ''}`}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id || row._id || i}
              className={[
                onRowClick ? 'portal-table-row--click' : '',
                rowClassName ? rowClassName(row) : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
            >
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
