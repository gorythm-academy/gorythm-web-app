import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApiDelete, adminApiGet, adminApiPatch, adminApiPost } from '../../../utils/adminApi';
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
  const [actionBusy, setActionBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPost, setFilterPost] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [replyEditId, setReplyEditId] = useState('');
  const [replyDraft, setReplyDraft] = useState('');

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApiGet('/research-comments');
      setComments(data?.comments || []);
      setSelectedIds([]);
    } catch (err) {
      showAlert(err.message || 'Failed to load queries & feedback', 'error');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

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
      const status = c.status || 'approved';
      const matchesStatus = filterStatus === 'all' || status === filterStatus;
      if (!matchesPost || !matchesStatus) return false;
      if (!q) return true;
      return (
        String(c.authorName || '').toLowerCase().includes(q) ||
        String(c.authorEmail || '').toLowerCase().includes(q) ||
        String(c.text || '').toLowerCase().includes(q) ||
        String(c.adminReply || '').toLowerCase().includes(q) ||
        String(c.postTitle || '').toLowerCase().includes(q)
      );
    });
  }, [comments, searchTerm, filterPost, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredComments.length / ITEMS_PER_PAGE));
  const pageComments = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredComments.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredComments, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPost, filterStatus]);

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
      const data = await adminApiPost('/research-comments/bulk-delete', { ids });
      const count = data?.deletedCount ?? ids.length;
      showAlert(`${count} item${count === 1 ? '' : 's'} deleted permanently.`, 'success');
      await loadComments();
    } catch (err) {
      showAlert(err.message || 'Failed to delete feedback', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleApprove = async (comment) => {
    setActionBusy(true);
    try {
      await adminApiPost(`/research-comments/${comment.id}/approve`);
      showAlert('Feedback approved and will appear on the website.', 'success');
      await loadComments();
    } catch (err) {
      showAlert(err.message || 'Failed to approve feedback', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async (comment) => {
    const ok = await showConfirm({
      message: 'Reject this feedback? It will be removed and will not appear on the website.',
      confirmLabel: 'Reject',
      type: 'warning',
    });
    if (!ok) return;
    setActionBusy(true);
    try {
      await adminApiPost(`/research-comments/${comment.id}/reject`);
      showAlert('Feedback rejected.', 'success');
      await loadComments();
    } catch (err) {
      showAlert(err.message || 'Failed to reject feedback', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const startReply = (comment) => {
    setReplyEditId(comment.id);
    setReplyDraft(comment.adminReply || '');
  };

  const cancelReply = () => {
    setReplyEditId('');
    setReplyDraft('');
  };

  const saveReply = async (commentId) => {
    const text = replyDraft.trim();
    if (!text) {
      showAlert('Enter a reply before saving.', 'error');
      return;
    }
    setActionBusy(true);
    try {
      await adminApiPatch(`/research-comments/${commentId}/reply`, { adminReply: text });
      showAlert('Reply saved.', 'success');
      cancelReply();
      await loadComments();
    } catch (err) {
      showAlert(err.message || 'Failed to save reply', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleClearReply = async (comment) => {
    const ok = await showConfirm({
      message: 'Remove the admin reply from this feedback?',
      confirmLabel: 'Remove reply',
      type: 'warning',
    });
    if (!ok) return;
    setActionBusy(true);
    try {
      await adminApiDelete(`/research-comments/${comment.id}/reply`);
      showAlert('Reply removed.', 'success');
      await loadComments();
    } catch (err) {
      showAlert(err.message || 'Failed to remove reply', 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteOne = async (comment) => {
    const ok = await showConfirm({
      message: `Delete this feedback from "${comment.postTitle}" permanently? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      type: 'warning',
    });
    if (!ok) return;
    await deleteComments([comment.id]);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    const ok = await showConfirm({
      message: `Delete ${selectedIds.length} selected item${selectedIds.length === 1 ? '' : 's'} permanently? This cannot be undone.`,
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
      pending: comments.filter((c) => c.status === 'pending').length,
      posts: postOptions.length,
      today: comments.filter((c) => new Date(c.date).toDateString() === now.toDateString()).length,
      week: comments.filter((c) => new Date(c.date) >= weekAgo).length,
    };
  }, [comments, postOptions.length]);

  const busy = deleting || actionBusy;

  return (
    <div className={embedded ? 'research-comments-embedded research-comments-page' : 'settings-page contact-messages-page research-comments-page'}>
      {!embedded ? (
        <div className="settings-header">
          <h1><i className="fas fa-comments"></i> Research Queries &amp; Feedback</h1>
          <p>Reader queries and feedback on research papers. Approve before they appear on the website.</p>
        </div>
      ) : (
        <div className="lms-research-comments-intro">
          <h2>Queries &amp; Feedback</h2>
          <p>Approve pending items before they appear on the website. You can reply or delete items here.</p>
        </div>
      )}

      <div className="contact-stats-grid">
        <div className="contact-stat-card">
          <div className="stat-icon total"><i className="fas fa-comments"></i></div>
          <div className="stat-text">
            <span>Total</span>
            <strong>{stats.total}</strong>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon new"><i className="fas fa-clock"></i></div>
          <div className="stat-text">
            <span>Pending</span>
            <strong>{stats.pending}</strong>
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
        <p>Loading queries &amp; feedback...</p>
      ) : (
        <div className="settings-card">
          <div className="card-body">
            <div className="contact-controls-bar">
              <div className="search-box">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search by name, email, paper, or feedback..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-controls">
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="status-filter">
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                </select>
                <select value={filterPost} onChange={(e) => setFilterPost(e.target.value)} className="status-filter">
                  <option value="all">All papers</option>
                  {postOptions.map(([slug, title]) => (
                    <option key={slug} value={slug}>{title}</option>
                  ))}
                </select>
                <button type="button" className="refresh-btn" onClick={loadComments} title="Refresh" aria-label="Refresh">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="contact-bulk-bar">
                <span>{selectedIds.length} selected</span>
                <button
                  type="button"
                  className="lms-btn-delete-forever"
                  onClick={handleBulkDelete}
                  disabled={busy}
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
                    <th>Feedback</th>
                    <th>Status</th>
                    <th>Response</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageComments.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                        No queries or feedback found.
                      </td>
                    </tr>
                  ) : (
                    pageComments.map((comment) => {
                      const status = comment.status || 'approved';
                      const isReplying = replyEditId === comment.id;
                      return (
                        <React.Fragment key={comment.id}>
                          <tr>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(idKey(comment.id))}
                                onChange={() => toggleSelect(comment.id)}
                                aria-label={`Select feedback by ${comment.authorName}`}
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
                            <td>{status === 'pending' ? 'Pending' : 'Approved'}</td>
                            <td className="research-comment-text">
                              {comment.adminReply ? comment.adminReply : '—'}
                            </td>
                            <td>{formatDateTime(comment.date)}</td>
                            <td className="lms-table-actions">
                              {status === 'pending' ? (
                                <>
                                  <button
                                    type="button"
                                    className="lms-schedule-action lms-schedule-action--approve"
                                    onClick={() => handleApprove(comment)}
                                    disabled={busy}
                                    title="Approve"
                                    aria-label="Approve"
                                  >
                                    <i className="fas fa-check" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    className="lms-schedule-action lms-schedule-action--delete"
                                    onClick={() => handleReject(comment)}
                                    disabled={busy}
                                    title="Reject"
                                    aria-label="Reject"
                                  >
                                    <i className="fas fa-times" aria-hidden />
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                className="lms-schedule-action lms-schedule-action--edit"
                                onClick={() => (isReplying ? cancelReply() : startReply(comment))}
                                disabled={busy}
                                title={comment.adminReply ? 'Edit reply' : 'Add reply'}
                                aria-label={comment.adminReply ? 'Edit reply' : 'Add reply'}
                              >
                                <i className="fas fa-reply" aria-hidden />
                              </button>
                              {comment.adminReply ? (
                                <button
                                  type="button"
                                  className="lms-schedule-action lms-schedule-action--delete"
                                  onClick={() => handleClearReply(comment)}
                                  disabled={busy}
                                  title="Remove reply"
                                  aria-label="Remove reply"
                                >
                                  <i className="fas fa-eraser" aria-hidden />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="lms-schedule-action lms-schedule-action--delete"
                                onClick={() => handleDeleteOne(comment)}
                                disabled={busy}
                                title="Delete forever"
                                aria-label="Delete forever"
                              >
                                <i className="fas fa-trash-alt" aria-hidden />
                              </button>
                            </td>
                          </tr>
                          {isReplying ? (
                            <tr>
                              <td colSpan={8}>
                                <label className="lms-field-label">
                                  <span>Admin Response</span>
                                  <textarea
                                    value={replyDraft}
                                    onChange={(e) => setReplyDraft(e.target.value)}
                                    rows={3}
                                    placeholder="Write a response to this feedback..."
                                  />
                                </label>
                                <div className="lms-form-actions">
                                  <button type="button" onClick={() => saveReply(comment.id)} disabled={busy}>
                                    Save reply
                                  </button>
                                  <button type="button" className="lms-btn-secondary" onClick={cancelReply} disabled={busy}>
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })
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
