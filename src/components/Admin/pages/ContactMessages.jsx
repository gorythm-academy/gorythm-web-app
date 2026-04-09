import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import '../Admin.scss';

const ContactMessages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [sortBy, setSortBy] = useState('submitted');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const fetchMessages = async () => {
    try {
      const token = getAuthToken();
      const response = await axios.get(`${API_BASE_URL}/api/contact/admin/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(response.data?.messages || []);
    } catch (error) {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'submitted' ? 'desc' : 'asc');
    }
  };

  const handleStatusChange = async (messageId, nextStatus) => {
    // Optimistic UI: update Status column immediately
    setMessages((prev) =>
      prev.map((message) => (message._id === messageId ? { ...message, status: nextStatus } : message))
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
      const q = searchTerm.toLowerCase();
      const matchesSearch = (
        (message.name || '').toLowerCase().includes(q) ||
        (message.email || '').toLowerCase().includes(q) ||
        (message.phone || '').toLowerCase().includes(q) ||
        (message.message || '').toLowerCase().includes(q)
      );

      const matchesStatus = filterStatus === 'all' || (message.status || 'new') === filterStatus;

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
  }, [messages, searchTerm, filterStatus, dateRange]);

  const sortedMessages = useMemo(() => {
    const mult = sortOrder === 'asc' ? 1 : -1;
    const data = [...filteredMessages];
    data.sort((a, b) => {
      const getValue = (item, key) => {
        if (key === 'contact') return `${item.name || ''} ${item.email || ''}`.toLowerCase();
        if (key === 'message') return (item.message || '').toLowerCase();
        if (key === 'status') return (item.status || 'new').toLowerCase();
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
    const normalized = (value) => value || 'new';
    return {
      newCount: messages.filter((m) => normalized(m.status) === 'new').length,
      inProgressCount: messages.filter((m) => normalized(m.status) === 'in-progress').length,
      resolvedCount: messages.filter((m) => normalized(m.status) === 'resolved').length,
      totalCount: messages.length
    };
  }, [messages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, dateRange, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedMessages.length / ITEMS_PER_PAGE));
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedMessages = sortedMessages.slice(pageStart, pageStart + ITEMS_PER_PAGE);

  const toggleMessageSelection = (messageId) => {
    setSelectedMessages((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    );
  };

  const toggleAllMessages = () => {
    const visibleIds = paginatedMessages.map((m) => m._id);
    if (visibleIds.length > 0 && selectedMessages.length === visibleIds.length) {
      setSelectedMessages([]);
    } else {
      setSelectedMessages(visibleIds);
    }
  };

  return (
    <div className="settings-page contact-messages-page">
      <div className="settings-header">
        <h1><i className="fas fa-envelope-open-text"></i> Contact Messages</h1>
        <p>Messages sent from the public contact form.</p>
      </div>
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
      {loading ? (
        <p>Loading messages...</p>
      ) : (
        <div className="settings-card">
          <div className="card-body">
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
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="new">New</option>
                  <option value="in-progress">In-progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                </select>
                <button className="refresh-btn" onClick={fetchMessages}>
                  <i className="fas fa-sync-alt"></i> Refresh
                </button>
              </div>
            </div>

            {messages.length === 0 ? (
              <p>No contact messages yet.</p>
            ) : (
              <div className="contact-messages-table-wrap">
                <table className="contact-messages-table">
                  <thead>
                    <tr>
                      <th className="checkbox-cell">
                        <input
                          type="checkbox"
                          checked={paginatedMessages.length > 0 && selectedMessages.length === paginatedMessages.length}
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
                      <th className="sortable" onClick={() => handleSort('submitted')}>
                        Submitted {sortBy === 'submitted' ? <i className={`fas fa-caret-${sortOrder === 'asc' ? 'up' : 'down'}`}></i> : <i className="fas fa-sort"></i>}
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMessages.map((m) => (
                      <tr key={m._id} className={selectedMessages.includes(m._id) ? 'selected' : ''}>
                        <td className="checkbox-cell">
                          <input
                            type="checkbox"
                            checked={selectedMessages.includes(m._id)}
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
                        <td>{new Date(m.createdAt).toLocaleString()}</td>
                        <td>
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="contact-summary-footer">
              <div className="summary-item">
                <span className="summary-value">{sortedMessages.length} of {messages.length} messages</span>
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
