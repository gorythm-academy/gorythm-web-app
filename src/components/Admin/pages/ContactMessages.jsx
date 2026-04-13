import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import '../Admin.scss';

const idKey = (id) => String(id);

/** True if message was soft-deleted (API may still return it in edge cases). */
const isTrashedMessage = (m) => {
  const d = m?.deletedAt;
  return d != null && d !== '';
};

const ContactMessages = () => {
  const [listTab, setListTab] = useState('inbox');
  const [messages, setMessages] = useState([]);
  const [trashCount, setTrashCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [sortBy, setSortBy] = useState('submitted');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [purging, setPurging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const tableScrollRef = useRef(null);
  const dragScrollRef = useRef({
    pointerId: null,
    startX: 0,
    startScroll: 0,
    dragging: false,
    pending: false,
  });

  const endTableDragScroll = useCallback((e) => {
    const el = tableScrollRef.current;
    const d = dragScrollRef.current;
    if (!d.pending && !d.dragging) return;
    if (e && e.pointerId != null && d.pointerId != null && e.pointerId !== d.pointerId) return;
    const pid = d.pointerId;
    const wasDragging = d.dragging;
    d.pending = false;
    d.dragging = false;
    d.pointerId = null;
    el?.classList.remove('contact-messages-table-wrap--dragging');
    if (wasDragging && el && pid != null) {
      try {
        el.releasePointerCapture(pid);
      } catch (_) {
        /* ignore */
      }
    }
  }, []);

  const onTablePointerDown = useCallback((e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const t = e.target;
    if (t.closest('button, a, input, select, textarea, label, option')) return;
    if (t.closest('th.sortable')) return;
    const el = tableScrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const d = dragScrollRef.current;
    d.pending = true;
    d.dragging = false;
    d.startX = e.clientX;
    d.startScroll = el.scrollLeft;
    d.pointerId = e.pointerId;
  }, []);

  const onTablePointerMove = useCallback((e) => {
    const d = dragScrollRef.current;
    const el = tableScrollRef.current;
    if (!el || d.pointerId == null || e.pointerId !== d.pointerId) return;
    if (d.pending && !d.dragging) {
      if (Math.abs(e.clientX - d.startX) < 5) return;
      d.dragging = true;
      el.classList.add('contact-messages-table-wrap--dragging');
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
    if (!d.dragging) return;
    el.scrollLeft = d.startScroll - (e.clientX - d.startX);
    e.preventDefault();
  }, []);

  const onTablePointerUp = useCallback(
    (e) => {
      endTableDragScroll(e);
    },
    [endTableDragScroll]
  );

  useEffect(() => {
    const onWin = (e) => endTableDragScroll(e);
    window.addEventListener('pointerup', onWin);
    window.addEventListener('pointercancel', onWin);
    return () => {
      window.removeEventListener('pointerup', onWin);
      window.removeEventListener('pointercancel', onWin);
    };
  }, [endTableDragScroll]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setSelectedMessages([]);
      try {
        const token = getAuthToken();
        const response = await axios.get(`${API_BASE_URL}/api/contact/admin/messages`, {
          headers: { Authorization: `Bearer ${token}` },
          params: listTab === 'trash' ? { trash: '1' } : {},
        });
        if (cancelled) return;
        setMessages(response.data?.messages || []);
        if (typeof response.data?.trashCount === 'number') {
          setTrashCount(response.data.trashCount);
        }
      } catch (error) {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [listTab]);

  useEffect(() => {
    if (listTab === 'trash') {
      setSortBy('deleted');
      setSortOrder('desc');
    } else {
      setSortBy('submitted');
      setSortOrder('desc');
    }
  }, [listTab]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await axios.get(`${API_BASE_URL}/api/contact/admin/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params: listTab === 'trash' ? { trash: '1' } : {},
      });
      setMessages(response.data?.messages || []);
      if (typeof response.data?.trashCount === 'number') {
        setTrashCount(response.data.trashCount);
      }
    } catch (error) {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const syncMessagesFromServer = async () => {
    try {
      const token = getAuthToken();
      const response = await axios.get(`${API_BASE_URL}/api/contact/admin/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params: listTab === 'trash' ? { trash: '1' } : {},
      });
      setMessages(response.data?.messages || []);
      if (typeof response.data?.trashCount === 'number') {
        setTrashCount(response.data.trashCount);
      }
    } catch (error) {
      console.warn('Failed to refresh messages:', error.response?.data || error.message);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'submitted' || column === 'deleted' ? 'desc' : 'asc');
    }
  };

  const handleStatusChange = async (messageId, nextStatus) => {
    if (listTab !== 'inbox') return;
    // Optimistic UI: update Status column immediately
    setMessages((prev) =>
      prev.map((message) =>
        idKey(message._id) === idKey(messageId) ? { ...message, status: nextStatus } : message
      )
    );
    setUpdatingId(messageId);
    try {
      const token = getAuthToken();
      await axios.patch(
        `${API_BASE_URL}/api/contact/admin/messages/${messageId}/status`,
        { status: nextStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      // Keep UI update even if backend persistence fails for now.
      console.warn('Failed to persist contact status update:', error.response?.data || error.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const renderStatusClass = (status) => {
    if (status === 'in-progress') return 'in-progress';
    if (status === 'resolved') return 'resolved';
    return 'new';
  };

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (listTab === 'inbox' && isTrashedMessage(message)) return false;

      const q = searchTerm.toLowerCase();
      const matchesSearch = (
        (message.name || '').toLowerCase().includes(q) ||
        (message.email || '').toLowerCase().includes(q) ||
        (message.phone || '').toLowerCase().includes(q) ||
        (message.message || '').toLowerCase().includes(q)
      );

      const matchesStatus =
        listTab === 'trash' || filterStatus === 'all' || (message.status || 'new') === filterStatus;

      const createdAt = new Date(message.createdAt);
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

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [messages, searchTerm, filterStatus, dateRange, listTab]);

  const sortedMessages = useMemo(() => {
    const mult = sortOrder === 'asc' ? 1 : -1;
    const data = [...filteredMessages];
    data.sort((a, b) => {
      const getValue = (item, key) => {
        if (key === 'contact') return `${item.name || ''} ${item.email || ''}`.toLowerCase();
        if (key === 'message') return (item.message || '').toLowerCase();
        if (key === 'status') return (item.status || 'new').toLowerCase();
        if (key === 'deleted') return new Date(item.deletedAt || 0).getTime();
        return new Date(item.createdAt || 0).getTime();
      };
      const va = getValue(a, sortBy);
      const vb = getValue(b, sortBy);
      if (typeof va === 'string' && typeof vb === 'string') return mult * va.localeCompare(vb);
      return mult * (va < vb ? -1 : va > vb ? 1 : 0);
    });
    return data;
  }, [filteredMessages, sortBy, sortOrder]);

  const statusStats = useMemo(() => {
    const rows = messages.filter((m) => !isTrashedMessage(m));
    const normalized = (value) => value || 'new';
    return {
      newCount: rows.filter((m) => normalized(m.status) === 'new').length,
      inProgressCount: rows.filter((m) => normalized(m.status) === 'in-progress').length,
      resolvedCount: rows.filter((m) => normalized(m.status) === 'resolved').length,
      totalCount: rows.length,
    };
  }, [messages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, dateRange, sortBy, sortOrder, listTab]);

  const totalPages = Math.max(1, Math.ceil(sortedMessages.length / ITEMS_PER_PAGE));
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMessages = sortedMessages.slice(pageStart, pageStart + ITEMS_PER_PAGE);

  const isRowSelected = (messageId) =>
    selectedMessages.some((s) => idKey(s) === idKey(messageId));

  const toggleMessageSelection = (messageId) => {
    setSelectedMessages((prev) =>
      prev.some((id) => idKey(id) === idKey(messageId))
        ? prev.filter((id) => idKey(id) !== idKey(messageId))
        : [...prev, messageId]
    );
  };

  const toggleAllMessages = () => {
    const visibleIds = paginatedMessages.map((m) => m._id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => isRowSelected(id));
    if (allVisibleSelected) {
      setSelectedMessages((prev) => prev.filter((id) => !visibleIds.some((vid) => idKey(vid) === idKey(id))));
    } else {
      setSelectedMessages((prev) => {
        const merged = [...prev];
        visibleIds.forEach((vid) => {
          if (!merged.some((id) => idKey(id) === idKey(vid))) merged.push(vid);
        });
        return merged;
      });
    }
  };

  const handleDeleteSelected = async () => {
    if (listTab !== 'inbox' || selectedMessages.length === 0 || deleting) return;
    const n = selectedMessages.length;
    const label = n === 1 ? 'this message' : `${n} messages`;
    if (
      !window.confirm(
        `Move ${label} to Deleted? You can open “Deleted messages” below and restore them later.`
      )
    ) {
      return;
    }

    setDeleting(true);
    const token = getAuthToken();
    const idSet = new Set(selectedMessages.map(idKey));
    try {
      await Promise.all(
        selectedMessages.map((id) =>
          axios.delete(`${API_BASE_URL}/api/contact/admin/messages/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      setSelectedMessages([]);
      await syncMessagesFromServer();
      setCurrentPage(1);
    } catch (error) {
      console.warn('Failed to delete contact message(s):', error.response?.data || error.message);
      await fetchMessages();
    } finally {
      setDeleting(false);
    }
  };

  const handleRestoreOne = async (messageId) => {
    if (listTab !== 'trash' || restoring || purging) return;
    setRestoring(true);
    const token = getAuthToken();
    try {
      await axios.post(
        `${API_BASE_URL}/api/contact/admin/messages/${messageId}/restore`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await syncMessagesFromServer();
      setCurrentPage(1);
    } catch (error) {
      console.warn('Failed to restore message:', error.response?.data || error.message);
      await fetchMessages();
    } finally {
      setRestoring(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (listTab !== 'trash' || selectedMessages.length === 0 || restoring || purging) return;
    const n = selectedMessages.length;
    if (!window.confirm(`Restore ${n === 1 ? 'this message' : `${n} messages`} to the inbox?`)) return;

    setRestoring(true);
    const token = getAuthToken();
    try {
      await Promise.all(
        selectedMessages.map((id) =>
          axios.post(
            `${API_BASE_URL}/api/contact/admin/messages/${id}/restore`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      setSelectedMessages([]);
      await syncMessagesFromServer();
      setCurrentPage(1);
    } catch (error) {
      console.warn('Failed to restore message(s):', error.response?.data || error.message);
      await fetchMessages();
    } finally {
      setRestoring(false);
    }
  };

  const handlePurgeOne = async (messageId) => {
    if (listTab !== 'trash' || purging || restoring) return;
    if (!window.confirm('Permanently erase this message? This cannot be undone.')) return;

    setPurging(true);
    const token = getAuthToken();
    try {
      await axios.delete(`${API_BASE_URL}/api/contact/admin/messages/${messageId}/permanent`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await syncMessagesFromServer();
      setCurrentPage(1);
    } catch (error) {
      console.warn('Failed to permanently delete:', error.response?.data || error.message);
      await fetchMessages();
    } finally {
      setPurging(false);
    }
  };

  const handlePurgeSelected = async () => {
    if (listTab !== 'trash' || selectedMessages.length === 0 || purging || restoring) return;
    const n = selectedMessages.length;
    if (
      !window.confirm(
        `Permanently erase ${n === 1 ? 'this message' : `${n} messages`}? This cannot be undone.`
      )
    ) {
      return;
    }

    setPurging(true);
    const token = getAuthToken();
    try {
      await Promise.all(
        selectedMessages.map((id) =>
          axios.delete(`${API_BASE_URL}/api/contact/admin/messages/${id}/permanent`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );
      setSelectedMessages([]);
      await syncMessagesFromServer();
      setCurrentPage(1);
    } catch (error) {
      console.warn('Failed to permanently delete:', error.response?.data || error.message);
      await fetchMessages();
    } finally {
      setPurging(false);
    }
  };

  const trashActionsBusy = purging || restoring;

  const tabMessageCount = useMemo(() => {
    if (listTab === 'inbox') return messages.filter((m) => !isTrashedMessage(m)).length;
    return messages.length;
  }, [messages, listTab]);

  return (
    <div className="settings-page contact-messages-page">
      <div className="settings-header">
        <h1><i className="fas fa-envelope-open-text"></i> Contact Messages</h1>
        <p>Messages sent from the public contact form.</p>
      </div>
      {listTab === 'inbox' && (
        <div className="contact-stats-grid">
          <div className="contact-stat-card">
            <div className="stat-icon new"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-text">
              <span>New Messages</span>
              <strong>{statusStats.newCount}</strong>
            </div>
          </div>
          <div className="contact-stat-card">
            <div className="stat-icon in-progress"><i className="fas fa-clock"></i></div>
            <div className="stat-text">
              <span>In Progress</span>
              <strong>{statusStats.inProgressCount}</strong>
            </div>
          </div>
          <div className="contact-stat-card">
            <div className="stat-icon resolved"><i className="fas fa-check-circle"></i></div>
            <div className="stat-text">
              <span>Resolved</span>
              <strong>{statusStats.resolvedCount}</strong>
            </div>
          </div>
          <div className="contact-stat-card">
            <div className="stat-icon total"><i className="fas fa-eye"></i></div>
            <div className="stat-text">
              <span>Total</span>
              <strong>{statusStats.totalCount}</strong>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <p>Loading messages...</p>
      ) : (
        <div className="settings-card">
          <div className="card-body">
            <div className="contact-list-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'inbox'}
                className={`contact-list-tab ${listTab === 'inbox' ? 'active' : ''}`}
                onClick={() => setListTab('inbox')}
              >
                <i className="fas fa-inbox"></i> Inbox
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={listTab === 'trash'}
                className={`contact-list-tab ${listTab === 'trash' ? 'active' : ''}`}
                onClick={() => setListTab('trash')}
              >
                <i className="fas fa-trash-alt"></i> Deleted messages
                {trashCount > 0 && <span className="contact-tab-badge">{trashCount}</span>}
              </button>
            </div>
            <div className="contact-controls-bar">
              <div className="search-box">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search by name, email, phone, or message..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-controls">
                {listTab === 'inbox' && (
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="new">New</option>
                    <option value="in-progress">In-progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                )}
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                </select>
                <button type="button" className="refresh-btn" onClick={fetchMessages}>
                  <i className="fas fa-sync-alt"></i> Refresh
                </button>
              </div>
            </div>

            {selectedMessages.length > 0 && (
              <div className="contact-summary-footer contact-summary-footer--bulk-top">
                {listTab === 'inbox' && (
                  <div className="contact-summary-actions">
                    <button
                      type="button"
                      className="contact-delete-btn"
                      onClick={handleDeleteSelected}
                      disabled={deleting}
                    >
                      <i className="fas fa-trash-alt"></i>{' '}
                      {deleting ? 'Moving…' : `Delete selected (${selectedMessages.length})`}
                    </button>
                  </div>
                )}
                {listTab === 'trash' && (
                  <div className="contact-summary-actions contact-summary-actions--row">
                    <button
                      type="button"
                      className="contact-restore-btn contact-restore-btn--bulk"
                      onClick={handleRestoreSelected}
                      disabled={trashActionsBusy}
                    >
                      <i className="fas fa-undo"></i>{' '}
                      {restoring ? 'Restoring…' : `Restore selected (${selectedMessages.length})`}
                    </button>
                    <button
                      type="button"
                      className="contact-purge-btn contact-purge-btn--bulk"
                      onClick={handlePurgeSelected}
                      disabled={trashActionsBusy}
                    >
                      <i className="fas fa-ban"></i>{' '}
                      {purging ? 'Erasing…' : `Delete forever (${selectedMessages.length})`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {sortedMessages.length === 0 ? (
              <p className="contact-empty-hint">
                {messages.length === 0
                  ? listTab === 'trash'
                    ? 'No deleted messages.'
                    : 'No contact messages yet.'
                  : 'No messages match your search or filters.'}
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
                <table
                  className={`contact-messages-table${listTab === 'trash' ? ' contact-messages-table--trash' : ''}`}
                >
                  <thead>
                    <tr>
                      <th className="checkbox-cell">
                        <input
                          type="checkbox"
                          checked={
                            paginatedMessages.length > 0 &&
                            paginatedMessages.every((m) => isRowSelected(m._id))
                          }
                          onChange={toggleAllMessages}
                        />
                      </th>
                      <th className="sortable" onClick={() => handleSort('contact')}>
                        Contact {sortBy === 'contact' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                      </th>
                      <th className="sortable" onClick={() => handleSort('message')}>
                        Message {sortBy === 'message' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                      </th>
                      <th className="sortable" onClick={() => handleSort('status')}>
                        Status {sortBy === 'status' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                      </th>
                      {listTab === 'inbox' ? (
                        <th className="sortable" onClick={() => handleSort('submitted')}>
                          Submitted {sortBy === 'submitted' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                        </th>
                      ) : (
                        <>
                          <th className="sortable" onClick={() => handleSort('submitted')}>
                            Submitted {sortBy === 'submitted' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                          </th>
                          <th className="sortable" onClick={() => handleSort('deleted')}>
                            Deleted {sortBy === 'deleted' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                          </th>
                        </>
                      )}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMessages.map((m) => (
                      <tr key={m._id} className={isRowSelected(m._id) ? 'selected' : ''}>
                        <td className="checkbox-cell">
                          <input
                            type="checkbox"
                            checked={isRowSelected(m._id)}
                            onChange={() => toggleMessageSelection(m._id)}
                          />
                        </td>
                        <td>
                          <div className="contact-meta">
                            <strong>{m.name || 'Unknown'}</strong>
                            <span>{m.email || 'No email'}</span>
                            <span>{m.phone || 'No phone'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="message-cell">{m.message || '-'}</div>
                        </td>
                        <td>
                          <span className={`status-pill ${renderStatusClass(m.status)}`}>
                            {m.status || 'new'}
                          </span>
                        </td>
                        {listTab === 'inbox' ? (
                          <td>{new Date(m.createdAt).toLocaleString()}</td>
                        ) : (
                          <>
                            <td>{new Date(m.createdAt).toLocaleString()}</td>
                            <td>{m.deletedAt ? new Date(m.deletedAt).toLocaleString() : '—'}</td>
                          </>
                        )}
                        <td>
                          {listTab === 'inbox' ? (
                            <select
                              className="status-select"
                              value={m.status || 'new'}
                              onChange={(e) => handleStatusChange(m._id, e.target.value)}
                              disabled={updatingId === m._id}
                            >
                              <option value="new">new</option>
                              <option value="in-progress">in-progress</option>
                              <option value="resolved">resolved</option>
                            </select>
                          ) : (
                            <div className="contact-trash-actions">
                              <button
                                type="button"
                                className="contact-restore-btn"
                                onClick={() => handleRestoreOne(m._id)}
                                disabled={trashActionsBusy}
                              >
                                <i className="fas fa-undo"></i> Restore
                              </button>
                              <button
                                type="button"
                                className="contact-purge-btn"
                                onClick={() => handlePurgeOne(m._id)}
                                disabled={trashActionsBusy}
                              >
                                <i className="fas fa-ban"></i> Delete forever
                              </button>
                            </div>
                          )}
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
                  {sortedMessages.length} of {tabMessageCount} messages
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-value">{selectedMessages.length} selected</span>
              </div>
              <div className="summary-item">
                <span className="summary-value">Page {currentPage} of {totalPages}</span>
              </div>
            </div>
            {sortedMessages.length > ITEMS_PER_PAGE && (
              <div className="contact-pagination">
                <button
                  className="page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNumber) => (
                  <button
                    key={pageNumber}
                    className={`page-btn ${currentPage === pageNumber ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
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

export default ContactMessages;
