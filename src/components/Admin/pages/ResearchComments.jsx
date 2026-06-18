import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import { useAdminDialog } from '../AdminDialogContext';
import '../Admin.scss';

const ITEMS_PER_PAGE = 15;
const idKey = (id) => String(id);

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const ResearchComments = ({ embedded = false }) => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPost, setFilterPost] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const authHeaders = useCallback(() => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/admin/research-comments`, {
        headers: authHeaders(),
      });
      setComments(res.data?.comments || []);
      setSelectedIds([]);
    } catch (err) {
      showAlert(err.response?.data?.error || 'Failed to load comments', 'error');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, showAlert]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const postOptions = useMemo(() => {
    const map = new Map();
    comments.forEach((c) => {
      if (!map.has(c.postSlug)) {
        map.set(c.postSlug, c.postTitle || c.postSlug);
      }
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [comments]);

  const filteredComments = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return comments.filter((c) => {
      const matchesPost = filterPost === 'all' || c.postSlug === filterPost;
      if (!matchesPost) return false;
      if (!q) return true;
      return (
        String(c.authorName || '').toLowerCase().includes(q) ||
        String(c.authorEmail || '').toLowerCase().includes(q) ||
        String(c.text || '').toLowerCase().includes(q) ||
        String(c.postTitle || '').toLowerCase().includes(q)
      );
    });
  }, [comments, searchTerm, filterPost]);

  const totalPages = Math.max(1, Math.ceil(filteredComments.length / ITEMS_PER_PAGE));
  const pageComments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredComments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredComments, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPost]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const toggleSelect = (id) => {
    const key = idKey(id);
    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    );
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = pageComments.map((c) => idKey(c.id));
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const deleteComments = async (ids) => {
    if (!ids.length) return;
    setDeleting(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/admin/research-comments/bulk-delete`,
        { ids },
        { headers: authHeaders() }
      );
      const count = res.data?.deletedCount ?? ids.length;
      showAlert(`${count} comment${count === 1 ? '' : 's'} deleted permanently.`, 'success');
      await loadComments();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Failed to delete comments', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOne = async (comment) => {
    const ok = await showConfirm({
      message: `Delete this comment from "${comment.postTitle}" permanently? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      type: 'warning',
    });
    if (!ok) return;
    await deleteComments([comment.id]);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    const ok = await showConfirm({
      message: `Delete ${selectedIds.length} selected comment${selectedIds.length === 1 ? '' : 's'} permanently? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      type: 'warning',
    });
    if (!ok) return;
    await deleteComments(selectedIds);
  };

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return {
      total: comments.length,
      posts: postOptions.length,
      today: comments.filter((c) => new Date(c.date).toDateString() === now.toDateString()).length,
      week: comments.filter((c) => new Date(c.date) >= weekAgo).length,
    };
  }, [comments, postOptions.length]);

  return (
    <div className={embedded ? 'research-comments-embedded research-comments-page' : 'settings-page contact-messages-page research-comments-page'}>
      {!embedded ? (
        <div className="settings-header">
          <h1><i className="fas fa-comments"></i> Research Comments</h1>
          <p>Comments left on research papers. Deleting here removes them permanently from the database.</p>
        </div>
      ) : (
        <div className="lms-research-comments-intro">
          <h2>Reader comments</h2>
          <p>Comments left on published research papers. Deleting removes them permanently.</p>
        </div>
      )}

      <div className="contact-stats-grid">
        <div className="contact-stat-card">
          <div className="stat-icon total"><i className="fas fa-comments"></i></div>
          <div className="stat-text">
            <span>Total Comments</span>
            <strong>{stats.total}</strong>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon new"><i className="fas fa-calendar-day"></i></div>
          <div className="stat-text">
            <span>Today</span>
            <strong>{stats.today}</strong>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon in-progress"><i className="fas fa-calendar-week"></i></div>
          <div className="stat-text">
            <span>Last 7 Days</span>
            <strong>{stats.week}</strong>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon resolved"><i className="fas fa-file-alt"></i></div>
          <div className="stat-text">
            <span>Papers</span>
            <strong>{stats.posts}</strong>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading comments...</p>
      ) : (
        <div className="settings-card">
          <div className="card-body">
            <div className="contact-controls-bar">
              <div className="search-box">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search by name, email, paper, or comment..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-controls">
                <select value={filterPost} onChange={(e) => setFilterPost(e.target.value)}>
                  <option value="all">All papers</option>
                  {postOptions.map(([slug, title]) => (
                    <option key={slug} value={slug}>{title}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="contact-bulk-bar">
                <span>{selectedIds.length} selected</span>
                <button
                  type="button"
                  className="contact-purge-btn contact-purge-btn--bulk"
                  onClick={handleBulkDelete}
                  disabled={deleting}
                >
                  <i className="fas fa-trash-alt"></i>
                  {deleting ? 'Deleting...' : 'Delete forever'}
                </button>
              </div>
            )}

            <div className="contact-messages-table-wrap">
              <table className="contact-messages-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={
                          pageComments.length > 0 &&
                          pageComments.every((c) => selectedIds.includes(idKey(c.id)))
                        }
                        onChange={toggleSelectAllOnPage}
                      />
                    </th>
                    <th>Paper</th>
                    <th>Author</th>
                    <th>Comment</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageComments.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                        No comments found.
                      </td>
                    </tr>
                  ) : (
                    pageComments.map((comment) => (
                      <tr key={comment.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(idKey(comment.id))}
                            onChange={() => toggleSelect(comment.id)}
                            aria-label={`Select comment by ${comment.authorName}`}
                          />
                        </td>
                        <td>
                          <div className="contact-message-subject">{comment.postTitle}</div>
                          <div className="contact-message-meta">{comment.postSlug}</div>
                        </td>
                        <td>
                          <div>{comment.authorName}</div>
                          {comment.authorEmail ? (
                            <div className="contact-message-meta">{comment.authorEmail}</div>
                          ) : null}
                        </td>
                        <td className="research-comment-text">{comment.text}</td>
                        <td>{formatDateTime(comment.date)}</td>
                        <td>
                          <button
                            type="button"
                            className="contact-purge-btn"
                            onClick={() => handleDeleteOne(comment)}
                            disabled={deleting}
                            title="Delete forever"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="contact-pagination">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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

export default ResearchComments;
