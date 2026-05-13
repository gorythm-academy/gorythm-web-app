import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import '../Admin.scss';

const ITEMS_PER_PAGE = 15;
const idKey = (id) => String(id);

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const sourceLabel = (source) => {
  const value = String(source || 'unknown').trim();
  if (!value) return 'Unknown';
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const Subscribers = () => {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [sortBy, setSortBy] = useState('subscribed');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedSubscribers, setSelectedSubscribers] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [dialog, setDialog] = useState(null);

  const tableScrollRef = useRef(null);
  const dragScrollRef = useRef({
    pointerId: null,
    startX: 0,
    startScroll: 0,
    dragging: false,
    pending: false,
  });

  const endTableDragScroll = useCallback((event) => {
    const el = tableScrollRef.current;
    const drag = dragScrollRef.current;
    if (!drag.pending && !drag.dragging) return;
    if (event && event.pointerId != null && drag.pointerId != null && event.pointerId !== drag.pointerId) return;

    const pointerId = drag.pointerId;
    const wasDragging = drag.dragging;
    drag.pending = false;
    drag.dragging = false;
    drag.pointerId = null;
    el?.classList.remove('contact-messages-table-wrap--dragging');

    if (wasDragging && el && pointerId != null) {
      try {
        el.releasePointerCapture(pointerId);
      } catch (_) {
        /* ignore */
      }
    }
  }, []);

  const onTablePointerDown = useCallback((event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target;
    if (target.closest('button, a, input, select, textarea, label, option')) return;
    if (target.closest('th.sortable')) return;

    const el = tableScrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;

    const drag = dragScrollRef.current;
    drag.pending = true;
    drag.dragging = false;
    drag.startX = event.clientX;
    drag.startScroll = el.scrollLeft;
    drag.pointerId = event.pointerId;
  }, []);

  const onTablePointerMove = useCallback((event) => {
    const drag = dragScrollRef.current;
    const el = tableScrollRef.current;
    if (!el || drag.pointerId == null || event.pointerId !== drag.pointerId) return;

    if (drag.pending && !drag.dragging) {
      if (Math.abs(event.clientX - drag.startX) < 5) return;
      drag.dragging = true;
      el.classList.add('contact-messages-table-wrap--dragging');
      try {
        el.setPointerCapture(event.pointerId);
      } catch (_) {
        /* ignore */
      }
    }

    if (!drag.dragging) return;
    el.scrollLeft = drag.startScroll - (event.clientX - drag.startX);
    event.preventDefault();
  }, []);

  const onTablePointerUp = useCallback(
    (event) => {
      endTableDragScroll(event);
    },
    [endTableDragScroll]
  );

  useEffect(() => {
    const onWindowPointerEnd = (event) => endTableDragScroll(event);
    window.addEventListener('pointerup', onWindowPointerEnd);
    window.addEventListener('pointercancel', onWindowPointerEnd);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
    };
  }, [endTableDragScroll]);

  const fetchSubscribers = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await axios.get(`${API_BASE_URL}/api/subscribers/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubscribers(response.data?.subscribers || []);
      setSelectedSubscribers([]);
    } catch (error) {
      setSubscribers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscribers();
  }, []);

  const filteredSubscribers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return subscribers.filter((subscriber) => {
      const email = String(subscriber.email || '').toLowerCase();
      const source = String(subscriber.source || '').toLowerCase();
      const matchesSearch = !q || email.includes(q) || source.includes(q);
      const matchesSource = filterSource === 'all' || source === filterSource;

      const createdAt = new Date(subscriber.createdAt);
      const now = new Date();
      let matchesDate = true;
      if (dateRange === 'today') {
        matchesDate = createdAt.toDateString() === now.toDateString();
      } else if (dateRange === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        matchesDate = createdAt >= weekAgo;
      } else if (dateRange === 'month') {
        const monthAgo = new Date();
        monthAgo.setMonth(now.getMonth() - 1);
        matchesDate = createdAt >= monthAgo;
      }

      return matchesSearch && matchesSource && matchesDate;
    });
  }, [subscribers, searchTerm, filterSource, dateRange]);

  const sortedSubscribers = useMemo(() => {
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    const rows = [...filteredSubscribers];

    rows.sort((a, b) => {
      const getValue = (subscriber, key) => {
        if (key === 'email') return String(subscriber.email || '').toLowerCase();
        if (key === 'source') return String(subscriber.source || '').toLowerCase();
        if (key === 'updated') return new Date(subscriber.updatedAt || 0).getTime();
        return new Date(subscriber.createdAt || 0).getTime();
      };

      const va = getValue(a, sortBy);
      const vb = getValue(b, sortBy);
      if (typeof va === 'string' && typeof vb === 'string') return multiplier * va.localeCompare(vb);
      return multiplier * (va < vb ? -1 : va > vb ? 1 : 0);
    });

    return rows;
  }, [filteredSubscribers, sortBy, sortOrder]);

  const sourceOptions = useMemo(() => {
    const sources = new Set();
    subscribers.forEach((subscriber) => {
      const source = String(subscriber.source || 'unknown').toLowerCase();
      sources.add(source);
    });
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }, [subscribers]);

  const subscriberStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(now.getDate() - 7);

    return {
      totalCount: subscribers.length,
      todayCount: subscribers.filter((subscriber) => {
        const createdAt = new Date(subscriber.createdAt);
        return !Number.isNaN(createdAt.getTime()) && createdAt.toDateString() === now.toDateString();
      }).length,
      weekCount: subscribers.filter((subscriber) => {
        const createdAt = new Date(subscriber.createdAt);
        return !Number.isNaN(createdAt.getTime()) && createdAt >= weekAgo;
      }).length,
      sourceCount: sourceOptions.length,
    };
  }, [subscribers, sourceOptions]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedSubscribers([]);
  }, [searchTerm, filterSource, dateRange, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedSubscribers.length / ITEMS_PER_PAGE));
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedSubscribers = sortedSubscribers.slice(pageStart, pageStart + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'subscribed' || column === 'updated' ? 'desc' : 'asc');
    }
  };

  const renderSortIcon = (column) => {
    if (sortBy !== column) return <i className="fas fa-sort"></i>;
    return <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i>;
  };

  const isRowSelected = (subscriberId) =>
    selectedSubscribers.some((id) => idKey(id) === idKey(subscriberId));

  const toggleSubscriberSelection = (subscriberId) => {
    setSelectedSubscribers((prev) =>
      prev.some((id) => idKey(id) === idKey(subscriberId))
        ? prev.filter((id) => idKey(id) !== idKey(subscriberId))
        : [...prev, subscriberId]
    );
  };

  const toggleAllSubscribers = () => {
    const visibleIds = paginatedSubscribers.map((subscriber) => subscriber._id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => isRowSelected(id));

    if (allVisibleSelected) {
      setSelectedSubscribers((prev) =>
        prev.filter((id) => !visibleIds.some((visibleId) => idKey(visibleId) === idKey(id)))
      );
    } else {
      setSelectedSubscribers((prev) => {
        const merged = [...prev];
        visibleIds.forEach((visibleId) => {
          if (!merged.some((id) => idKey(id) === idKey(visibleId))) merged.push(visibleId);
        });
        return merged;
      });
    }
  };

  const syncSubscribersFromServer = async () => {
    try {
      const token = getAuthToken();
      const response = await axios.get(`${API_BASE_URL}/api/subscribers/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubscribers(response.data?.subscribers || []);
    } catch (error) {
      console.warn('Failed to refresh subscribers:', error.response?.data || error.message);
    }
  };

  const openDialog = (nextDialog) => {
    setDialog(nextDialog);
  };

  const closeDialog = () => {
    setDialog((prev) => (prev?.busy ? prev : null));
  };

  const getDeleteErrorMessage = (error) => {
    const backendMessage = error.response?.data?.error || error.response?.data?.message;
    if (error.response?.status === 404 && String(backendMessage || '').toLowerCase().includes('route not found')) {
      return 'The subscriber delete API is not available on the running backend yet. Restart or redeploy the backend, then try again.';
    }

    return (
      backendMessage ||
      error.message ||
      'Failed to delete subscriber. Please try again.'
    );
  };

  const runDeleteRequest = async (requests) => {
    let lastError;
    for (const request of requests) {
      try {
        return await request();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };

  const deleteSubscriberIds = async (ids) => {
    if (!ids.length || deleting) return;
    setDeleting(true);
    setDialog((prev) => (prev ? { ...prev, busy: true } : prev));

    try {
      const token = getAuthToken();
      const authConfig = { headers: { Authorization: `Bearer ${token}` } };

      const response = await runDeleteRequest(
        ids.length === 1
          ? [
              () => axios.delete(`${API_BASE_URL}/api/subscribers/admin/${ids[0]}`, authConfig),
              () => axios.post(`${API_BASE_URL}/api/subscribers/admin/${ids[0]}/delete`, {}, authConfig),
              () => axios.post(`${API_BASE_URL}/api/subscribers/admin/delete`, { ids }, authConfig),
              () => axios.post(`${API_BASE_URL}/api/subscribers/admin/bulk-delete`, { ids }, authConfig),
            ]
          : [
              () => axios.post(`${API_BASE_URL}/api/subscribers/admin/delete`, { ids }, authConfig),
              () => axios.post(`${API_BASE_URL}/api/subscribers/admin/bulk-delete`, { ids }, authConfig),
            ]
      );

      const deletedCount = response.data?.deletedCount ?? ids.length;
      if (deletedCount < 1) {
        throw new Error('No subscriber record was deleted. It may have already been removed.');
      }

      setSubscribers((prev) => prev.filter((subscriber) => !ids.some((id) => idKey(id) === idKey(subscriber._id))));
      setSelectedSubscribers((prev) => prev.filter((id) => !ids.some((deletedId) => idKey(deletedId) === idKey(id))));
      setCurrentPage(1);
      openDialog({
        type: 'success',
        title: deletedCount === 1 ? 'Subscriber Deleted' : 'Subscribers Deleted',
        message:
          deletedCount === 1
            ? 'The subscriber record has been removed successfully.'
            : `${deletedCount} subscriber records have been removed successfully.`,
        confirmLabel: 'Done',
      });
      await syncSubscribersFromServer();
    } catch (error) {
      console.warn('Failed to delete subscriber:', error.response?.data || error.message);
      openDialog({
        type: 'error',
        title: 'Delete Failed',
        message: getDeleteErrorMessage(error),
        confirmLabel: 'Close',
      });
      await fetchSubscribers();
    } finally {
      setDeleting(false);
    }
  };

  const askDeleteSubscribers = (ids, label) => {
    const count = ids.length;
    if (!count || deleting) return;

    openDialog({
      type: 'warning',
      title: count === 1 ? 'Delete Subscriber?' : 'Delete Subscribers?',
      message:
        count === 1
          ? `This will permanently delete ${label || 'this subscriber'} from the subscribers list.`
          : `This will permanently delete ${count} selected subscribers from the subscribers list.`,
      confirmLabel: count === 1 ? 'Delete Subscriber' : 'Delete Selected',
      cancelLabel: 'Cancel',
      onConfirm: () => deleteSubscriberIds(ids),
    });
  };

  const handleDeleteOne = (subscriber) => {
    askDeleteSubscribers([subscriber._id], subscriber.email || 'this subscriber');
  };

  const handleDeleteSelected = () => {
    askDeleteSubscribers(selectedSubscribers);
  };

  const downloadSubscribersCsv = () => {
    if (!sortedSubscribers.length) return;

    const columns = [
      ['email', 'Email'],
      ['source', 'Source'],
      ['subscribed', 'Subscribed'],
      ['updated', 'Last Updated'],
    ];

    const rows = sortedSubscribers.map((subscriber) => ({
      email: subscriber.email || '',
      source: subscriber.source || 'unknown',
      subscribed: subscriber.createdAt ? new Date(subscriber.createdAt).toISOString() : '',
      updated: subscriber.updatedAt ? new Date(subscriber.updatedAt).toISOString() : '',
    }));

    const escapeCsv = (value) => {
      const stringValue = String(value ?? '');
      return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
    };

    const csv = [
      columns.map((column) => escapeCsv(column[1])).join(','),
      ...rows.map((row) => columns.map((column) => escapeCsv(row[column[0]])).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gorythm-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="settings-page subscribers-page">
      {dialog && (
        <div className="subscriber-dialog-overlay" role="presentation">
          <div
            className={`subscriber-dialog subscriber-dialog--${dialog.type || 'info'}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscriber-dialog-title"
          >
            <div className="subscriber-dialog__icon">
              <i
                className={
                  dialog.type === 'success'
                    ? 'fas fa-check'
                    : dialog.type === 'error'
                      ? 'fas fa-exclamation-triangle'
                      : 'fas fa-trash-alt'
                }
              ></i>
            </div>
            <div className="subscriber-dialog__content">
              <h2 id="subscriber-dialog-title">{dialog.title}</h2>
              <p>{dialog.message}</p>
            </div>
            <div className="subscriber-dialog__actions">
              {dialog.cancelLabel && (
                <button
                  type="button"
                  className="subscriber-dialog__btn subscriber-dialog__btn--secondary"
                  onClick={closeDialog}
                  disabled={dialog.busy}
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                type="button"
                className="subscriber-dialog__btn subscriber-dialog__btn--primary"
                onClick={dialog.onConfirm || closeDialog}
                disabled={dialog.busy}
              >
                {dialog.busy && <i className="fas fa-spinner fa-spin"></i>}
                {dialog.busy ? 'Please wait...' : dialog.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="settings-header">
        <h1><i className="fas fa-user-plus"></i> Subscribers</h1>
        <p>Emails collected from Subscribe section and Newsletter popup.</p>
      </div>

      <div className="contact-stats-grid">
        <div className="contact-stat-card">
          <div className="stat-icon total"><i className="fas fa-users"></i></div>
          <div className="stat-text">
            <span>Total Subscribers</span>
            <strong>{subscriberStats.totalCount}</strong>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon new"><i className="fas fa-calendar-day"></i></div>
          <div className="stat-text">
            <span>Today</span>
            <strong>{subscriberStats.todayCount}</strong>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon in-progress"><i className="fas fa-calendar-week"></i></div>
          <div className="stat-text">
            <span>Last 7 Days</span>
            <strong>{subscriberStats.weekCount}</strong>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon resolved"><i className="fas fa-layer-group"></i></div>
          <div className="stat-text">
            <span>Sources</span>
            <strong>{subscriberStats.sourceCount}</strong>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading subscribers...</p>
      ) : (
        <div className="settings-card">
          <div className="card-body">
            <div className="contact-controls-bar">
              <div className="search-box">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search by email or source..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <div className="filter-controls">
                <select value={filterSource} onChange={(event) => setFilterSource(event.target.value)}>
                  <option value="all">All Sources</option>
                  {sourceOptions.map((source) => (
                    <option key={source} value={source}>{sourceLabel(source)}</option>
                  ))}
                </select>
                <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                </select>
                <button type="button" className="refresh-btn" onClick={fetchSubscribers}>
                  <i className="fas fa-sync-alt"></i> Refresh
                </button>
                <button
                  type="button"
                  className="btn-secondary download-btn"
                  onClick={downloadSubscribersCsv}
                  disabled={sortedSubscribers.length === 0}
                >
                  <i className="fas fa-file-export"></i> Download Excel
                </button>
              </div>
            </div>

            {selectedSubscribers.length > 0 && (
              <div className="contact-summary-footer contact-summary-footer--bulk-top">
                <div className="summary-item">
                  <span className="summary-value">{selectedSubscribers.length} selected</span>
                </div>
                <div className="contact-summary-actions">
                  <button
                    type="button"
                    className="contact-delete-btn"
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                  >
                    <i className="fas fa-trash-alt"></i>{' '}
                    {deleting ? 'Deleting...' : `Delete selected (${selectedSubscribers.length})`}
                  </button>
                </div>
              </div>
            )}

            {sortedSubscribers.length === 0 ? (
              <p className="contact-empty-hint">
                {subscribers.length === 0
                  ? 'No subscriber emails yet.'
                  : 'No subscribers match your search or filters.'}
              </p>
            ) : (
              <div
                ref={tableScrollRef}
                className="contact-messages-table-wrap"
                onPointerDown={onTablePointerDown}
                onPointerMove={onTablePointerMove}
                onPointerUp={onTablePointerUp}
                onPointerCancel={onTablePointerUp}
              >
                <table className="contact-messages-table subscribers-table">
                  <thead>
                    <tr>
                      <th className="checkbox-cell">
                        <input
                          type="checkbox"
                          checked={
                            paginatedSubscribers.length > 0 &&
                            paginatedSubscribers.every((subscriber) => isRowSelected(subscriber._id))
                          }
                          onChange={toggleAllSubscribers}
                        />
                      </th>
                      <th className="sortable" onClick={() => handleSort('email')}>
                        Email {renderSortIcon('email')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('source')}>
                        Source {renderSortIcon('source')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('subscribed')}>
                        Subscribed {renderSortIcon('subscribed')}
                      </th>
                      <th className="sortable" onClick={() => handleSort('updated')}>
                        Last Updated {renderSortIcon('updated')}
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSubscribers.map((subscriber) => (
                      <tr key={subscriber._id} className={isRowSelected(subscriber._id) ? 'selected' : ''}>
                        <td className="checkbox-cell">
                          <input
                            type="checkbox"
                            checked={isRowSelected(subscriber._id)}
                            onChange={() => toggleSubscriberSelection(subscriber._id)}
                          />
                        </td>
                        <td>
                          <div className="contact-meta subscriber-meta">
                            <strong>{subscriber.email || 'No email'}</strong>
                          </div>
                        </td>
                        <td>
                          <span className="status-pill subscriber-source-pill">
                            {sourceLabel(subscriber.source)}
                          </span>
                        </td>
                        <td>{formatDateTime(subscriber.createdAt)}</td>
                        <td>{formatDateTime(subscriber.updatedAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="contact-purge-btn"
                            onClick={() => handleDeleteOne(subscriber)}
                            disabled={deleting}
                          >
                            <i className="fas fa-trash-alt"></i> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="contact-summary-footer">
              <div className="summary-item">
                <span className="summary-value">
                  {sortedSubscribers.length} of {subscribers.length} subscribers
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-value">{selectedSubscribers.length} selected</span>
              </div>
              <div className="summary-item">
                <span className="summary-value">Page {currentPage} of {totalPages}</span>
              </div>
            </div>

            {sortedSubscribers.length > ITEMS_PER_PAGE && (
              <div className="contact-pagination">
                <button
                  type="button"
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    type="button"
                    key={pageNumber}
                    className={`page-btn ${currentPage === pageNumber ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  type="button"
                  className="page-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscribers;
