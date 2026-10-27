import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { forceAdminLogout } from '../../../utils/adminAuthSession';
import { API_BASE_URL } from '../../../config/constants';
import { getAdminErrorMessage, joinAdminErrors } from '../../../utils/adminApi';
import { QUARANTINE_LABEL } from '../../../utils/adminListLabels';
import { useAdminDialog } from '../AdminDialogContext';
import AdminTablePagination from '../shared/AdminTablePagination';
import RequiredMark from '../../shared/RequiredMark';
import { useDialogKeyboard } from '../../../hooks/useDialogKeyboard';
import { requestAdminBadgeRefresh } from '../../../utils/portalNewItems';

const ITEMS_PER_PAGE = 15;

const idKey = (id) => String(id);

const bulkFailureText = (results, allFailedText, partialVerb) => {
  const failed = results.filter((result) => result.status === 'rejected');
  if (!failed.length) return '';
  const reason = joinAdminErrors(failed.map((result) => result.reason));
  if (failed.length === results.length) return reason || allFailedText;
  return `${failed.length} of ${results.length} requests could not be ${partialVerb}.${reason ? ` ${reason}` : ''}`;
};

const whatsAppHref = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
};

const TrialRequests = () => {
  const { showAlert, showConfirm } = useAdminDialog();
  const [listTab, setListTab] = useState('inbox');
  const [requests, setRequests] = useState([]);
  const [statusCounts, setStatusCounts] = useState(null);
  const [trashCount, setTrashCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [quarantining, setQuarantining] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [purging, setPurging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [replyTarget, setReplyTarget] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const replyFieldRef = useRef(null);

  const authHeaders = () => ({ Authorization: `Bearer ${getAuthToken()}` });

  const applyResponse = (data) => {
    setRequests(Array.isArray(data?.requests) ? data.requests : []);
    setStatusCounts(data?.statusCounts || null);
    if (typeof data?.trashCount === 'number') setTrashCount(data.trashCount);
    requestAdminBadgeRefresh();
  };

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    setSelectedIds([]);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/trials/admin/requests`, {
        headers: authHeaders(),
        params: listTab === 'trash' ? { trash: '1' } : {},
      });
      applyResponse(response.data);
    } catch (error) {
      if (error.response?.status === 401) {
        forceAdminLogout();
        return;
      }
      setRequests([]);
      setStatusCounts(null);
      setFetchError(getAdminErrorMessage(error, 'Failed to load trial requests.'));
    } finally {
      setLoading(false);
    }
  }, [listTab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, listTab]);

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return requests.filter((item) => {
      if (listTab === 'inbox' && filterStatus !== 'all' && item.status !== filterStatus) return false;
      if (!query) return true;
      const haystack = [item.name, item.email, item.phone, item.courseTitle, item.preferredTime, item.reply]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [requests, searchTerm, filterStatus, listTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const counts = statusCounts || {
    new: requests.filter((item) => item.status === 'new').length,
    contacted: requests.filter((item) => item.status === 'contacted').length,
    total: requests.length,
  };

  const updateStatus = async (id, status) => {
    setUpdatingId(id);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/trials/admin/requests/${id}/status`,
        { status },
        { headers: authHeaders() }
      );
      const current = requests.find((item) => item._id === id);
      if (current && current.status !== status) {
        setStatusCounts((counts) => {
          if (!counts) return counts;
          return {
            ...counts,
            [current.status]: Math.max(0, (counts[current.status] || 0) - 1),
            [status]: (counts[status] || 0) + 1,
          };
        });
      }
      setRequests((prev) => prev.map((item) => (item._id === id ? { ...item, status } : item)));
      requestAdminBadgeRefresh();
    } catch (error) {
      if (error.response?.status === 401) {
        forceAdminLogout();
        return;
      }
      showAlert(getAdminErrorMessage(error, 'Could not update this trial request.'), 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const isRowSelected = (id) => selectedIds.some((selected) => idKey(selected) === idKey(id));

  const toggleRow = (id) => {
    setSelectedIds((prev) => (
      prev.some((selected) => idKey(selected) === idKey(id))
        ? prev.filter((selected) => idKey(selected) !== idKey(id))
        : [...prev, id]
    ));
  };

  const togglePage = () => {
    const visibleIds = pageRows.map((item) => item._id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => isRowSelected(id));
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.some((visibleId) => idKey(visibleId) === idKey(id))));
      return;
    }
    setSelectedIds((prev) => {
      const merged = [...prev];
      visibleIds.forEach((visibleId) => {
        if (!merged.some((id) => idKey(id) === idKey(visibleId))) merged.push(visibleId);
      });
      return merged;
    });
  };

  const runBulk = async (ids, requestForId) => {
    const results = await Promise.allSettled(ids.map((id) => requestForId(id)));
    return results;
  };

  const quarantineIds = async (ids) => {
    if (listTab !== 'inbox' || ids.length === 0 || quarantining) return;
    const n = ids.length;
    const confirmed = await showConfirm({
      title: `Move to ${QUARANTINE_LABEL}?`,
      message: `Move ${n === 1 ? 'this trial request' : `${n} trial requests`} to ${QUARANTINE_LABEL}? You can restore them later.`,
      confirmLabel: `Move to ${QUARANTINE_LABEL}`,
    });
    if (!confirmed) return;
    setQuarantining(true);
    try {
      const results = await runBulk(ids, (id) => axios.delete(
        `${API_BASE_URL}/api/trials/admin/requests/${id}`,
        { headers: authHeaders() }
      ));
      const failureText = bulkFailureText(results, 'Could not quarantine the selected trial requests.', 'quarantined');
      setSelectedIds([]);
      await load();
      if (failureText) showAlert(failureText, 'error');
    } catch (error) {
      if (error.response?.status === 401) {
        forceAdminLogout();
        return;
      }
      showAlert(getAdminErrorMessage(error, 'Could not quarantine the selected trial requests.'), 'error');
    } finally {
      setQuarantining(false);
    }
  };

  const restoreIds = async (ids) => {
    if (listTab !== 'trash' || ids.length === 0 || restoring || purging) return;
    const n = ids.length;
    const confirmed = await showConfirm({
      title: 'Restore trial requests?',
      message: `Restore ${n === 1 ? 'this trial request' : `${n} trial requests`} to the active list?`,
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
    setRestoring(true);
    try {
      const results = await runBulk(ids, (id) => axios.post(
        `${API_BASE_URL}/api/trials/admin/requests/${id}/restore`,
        {},
        { headers: authHeaders() }
      ));
      const failureText = bulkFailureText(results, 'Could not restore the selected trial requests.', 'restored');
      setSelectedIds([]);
      await load();
      if (failureText) showAlert(failureText, 'error');
    } catch (error) {
      if (error.response?.status === 401) {
        forceAdminLogout();
        return;
      }
      showAlert(getAdminErrorMessage(error, 'Could not restore the selected trial requests.'), 'error');
    } finally {
      setRestoring(false);
    }
  };

  const purgeIds = async (ids) => {
    if (listTab !== 'trash' || ids.length === 0 || purging || restoring) return;
    const n = ids.length;
    const confirmed = await showConfirm({
      title: 'Delete forever?',
      message: `Permanently erase ${n === 1 ? 'this trial request' : `${n} trial requests`}? This cannot be undone.`,
      confirmLabel: 'Delete forever',
    });
    if (!confirmed) return;
    setPurging(true);
    try {
      const results = await runBulk(ids, (id) => axios.delete(
        `${API_BASE_URL}/api/trials/admin/requests/${id}/permanent`,
        { headers: authHeaders() }
      ));
      const failureText = bulkFailureText(results, 'Could not permanently delete the selected trial requests.', 'deleted');
      setSelectedIds([]);
      await load();
      if (failureText) showAlert(failureText, 'error');
    } catch (error) {
      if (error.response?.status === 401) {
        forceAdminLogout();
        return;
      }
      showAlert(getAdminErrorMessage(error, 'Could not permanently delete the selected trial requests.'), 'error');
    } finally {
      setPurging(false);
    }
  };

  const trashActionsBusy = restoring || purging;

  const closeReply = () => {
    if (replySending) return;
    setReplyTarget(null);
    setReplyBody('');
    setReplyError('');
  };

  const openReply = (item) => {
    if (!String(item?.email || '').trim()) return;
    setReplyTarget(item);
    setReplyBody('');
    setReplyError('');
  };

  const sendReply = async () => {
    const body = replyBody.trim();
    if (!replyTarget || !body || replySending) return;
    setReplySending(true);
    setReplyError('');
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/trials/admin/requests/${replyTarget._id}/reply`,
        { message: body },
        { headers: authHeaders() }
      );
      const saved = response.data?.request;
      const previousStatus = replyTarget.status || 'new';
      if (saved) {
        setRequests((prev) => prev.map((item) => (item._id === saved._id ? { ...item, ...saved } : item)));
        if (previousStatus !== 'contacted' && saved.status === 'contacted') {
          setStatusCounts((counts) => {
            if (!counts) return counts;
            return {
              ...counts,
              new: Math.max(0, (counts.new || 0) - 1),
              contacted: (counts.contacted || 0) + 1,
            };
          });
        }
      }
      const recipient = replyTarget.name || replyTarget.email;
      setReplySending(false);
      setReplyTarget(null);
      setReplyBody('');
      showAlert(`Reply emailed to ${recipient}.`, 'success');
      requestAdminBadgeRefresh();
    } catch (error) {
      if (error.response?.status === 401) {
        forceAdminLogout();
        return;
      }
      setReplyError(error.response?.data?.error || 'Could not send the reply email.');
      setReplySending(false);
    }
  };

  useDialogKeyboard({
    isOpen: Boolean(replyTarget),
    onClose: closeReply,
    blockEscape: replySending,
  });

  useEffect(() => {
    if (!replyTarget) return undefined;
    const frame = window.requestAnimationFrame(() => replyFieldRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [replyTarget]);

  return (
    <div className="settings-page contact-messages-page trial-requests-panel">
      {replyTarget ? (
        <div
          className="contact-reply-overlay"
          role="presentation"
          onClick={closeReply}
        >
          <div
            className="contact-reply-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-reply-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="contact-reply-dialog__header">
              <div>
                <h2 id="trial-reply-title">Reply by Email</h2>
                <p>
                  To {replyTarget.name || 'this person'}
                  {replyTarget.email ? ` · ${replyTarget.email}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="contact-reply-dialog__close"
                onClick={closeReply}
                disabled={replySending}
                aria-label="Close reply"
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </header>
            <div className="contact-reply-dialog__body">
              <div className="contact-reply-quote">
                <span>Their request</span>
                <p>
                  {replyTarget.courseTitle || 'Course not given'}
                  {replyTarget.preferredTime ? ` · ${replyTarget.preferredTime}` : ''}
                </p>
              </div>
              <label className="contact-reply-field" htmlFor="trial-reply-body">
                <span>Your Reply <RequiredMark /></span>
                <textarea
                  id="trial-reply-body"
                  ref={replyFieldRef}
                  rows={6}
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Write your reply. Include the class link if you are ready to send it."
                  maxLength={5000}
                  disabled={replySending}
                  required
                  aria-required="true"
                />
              </label>
              {replyError ? (
                <p className="contact-reply-error" role="alert">{replyError}</p>
              ) : null}
            </div>
            <footer className="contact-reply-dialog__footer">
              <button
                type="button"
                className="contact-reply-dialog__cancel"
                onClick={closeReply}
                disabled={replySending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="contact-reply-dialog__send"
                onClick={sendReply}
                disabled={replySending || !replyBody.trim()}
              >
                {replySending ? (
                  <>
                    <i className="fas fa-spinner fa-spin" aria-hidden="true" /> Sending…
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane" aria-hidden="true" /> Send email
                  </>
                )}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      <p className="trial-requests-note">
        These requests only save a name, email, WhatsApp number, course, and preferred time.
        Contact the person yourself and send the class link. Mark the row as contacted once you have reached them.
      </p>
      <div className="contact-stats-grid">
        <div className="contact-stat-card">
          <div className="stat-icon new"><i className="fas fa-user-clock" /></div>
          <div className="stat-info">
            <h3>{counts.new}</h3>
            <p>New</p>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon resolved"><i className="fas fa-check-circle" /></div>
          <div className="stat-info">
            <h3>{counts.contacted}</h3>
            <p>Contacted</p>
          </div>
        </div>
        <div className="contact-stat-card">
          <div className="stat-icon total"><i className="fas fa-list" /></div>
          <div className="stat-info">
            <h3>{counts.total}</h3>
            <p>Total</p>
          </div>
        </div>
      </div>

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
              <i className="fas fa-inbox" aria-hidden="true" /> Active
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listTab === 'trash'}
              className={`contact-list-tab ${listTab === 'trash' ? 'active' : ''}`}
              onClick={() => setListTab('trash')}
            >
              <i className="fas fa-archive" aria-hidden="true" /> {QUARANTINE_LABEL}
              {trashCount > 0 ? <span className="contact-tab-badge">{trashCount}</span> : null}
            </button>
          </div>
          <div className="contact-controls-bar">
            <div className="search-box">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search by name, email, phone, course, or time..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search trial requests"
              />
            </div>
            <div className="filter-controls">
              {listTab === 'inbox' ? (
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="status-filter"
                  aria-label="Filter by status"
                >
                  <option value="all">All Status</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                </select>
              ) : null}
              <button type="button" className="refresh-btn" onClick={load} title="Refresh" aria-label="Refresh">
                <i className="fas fa-sync-alt" />
              </button>
            </div>
          </div>

          {loading ? (
            <p>Loading trial requests...</p>
          ) : fetchError ? (
            <p className="contact-empty-hint" role="alert">{fetchError}</p>
          ) : (
            <>
              {selectedIds.length > 0 ? (
                <div className="contact-summary-footer contact-summary-footer--bulk-top">
                  {listTab === 'inbox' ? (
                    <div className="contact-summary-actions">
                      <button
                        type="button"
                        className="contact-quarantine-btn contact-quarantine-btn--bulk"
                        onClick={() => quarantineIds(selectedIds)}
                        disabled={quarantining}
                      >
                        <i className="fas fa-archive" aria-hidden="true" />{' '}
                        {quarantining ? 'Moving…' : `Quarantine selected (${selectedIds.length})`}
                      </button>
                    </div>
                  ) : (
                    <div className="contact-summary-actions contact-summary-actions--row">
                      <button
                        type="button"
                        className="contact-restore-btn contact-restore-btn--bulk"
                        onClick={() => restoreIds(selectedIds)}
                        disabled={trashActionsBusy}
                      >
                        <i className="fas fa-undo" aria-hidden="true" />{' '}
                        {restoring ? 'Restoring…' : `Restore selected (${selectedIds.length})`}
                      </button>
                      <button
                        type="button"
                        className="contact-purge-btn contact-purge-btn--bulk"
                        onClick={() => purgeIds(selectedIds)}
                        disabled={trashActionsBusy}
                      >
                        <i className="fas fa-ban" aria-hidden="true" />{' '}
                        {purging ? 'Erasing…' : `Delete forever (${selectedIds.length})`}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {pageRows.length === 0 ? (
                <p className="contact-empty-hint">
                  {requests.length === 0
                    ? (listTab === 'trash' ? 'No quarantined trial requests.' : 'No trial requests yet.')
                    : 'No trial requests match your search or filters.'}
                </p>
              ) : (
                <div className="contact-messages-table-wrap">
                  <table className={`contact-messages-table${listTab === 'trash' ? ' contact-messages-table--trash' : ''}`}>
                    <thead>
                      <tr>
                        <th className="checkbox-cell">
                          <input
                            type="checkbox"
                            checked={pageRows.length > 0 && pageRows.every((item) => isRowSelected(item._id))}
                            ref={(element) => {
                              if (!element) return;
                              const selectedOnPage = pageRows.filter((item) => isRowSelected(item._id)).length;
                              element.indeterminate = selectedOnPage > 0 && selectedOnPage < pageRows.length;
                            }}
                            onChange={togglePage}
                            aria-label="Select all trial requests on this page"
                          />
                        </th>
                        <th>Person</th>
                        <th>Course</th>
                        <th>Preferred time</th>
                        <th>Reply</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        {listTab === 'trash' ? <th>Quarantined</th> : null}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((item) => {
                        const wa = whatsAppHref(item.phone);
                        const person = item.name || 'this person';
                        return (
                          <tr key={item._id} className={isRowSelected(item._id) ? 'selected' : ''}>
                            <td className="checkbox-cell">
                              <input
                                type="checkbox"
                                checked={isRowSelected(item._id)}
                                onChange={() => toggleRow(item._id)}
                                aria-label={`Select ${person}`}
                              />
                            </td>
                            <td>
                              <div className="contact-meta">
                                <strong>{item.name || 'Unknown'}</strong>
                                {item.email ? (
                                  <a className="admin-email" href={`mailto:${item.email}`}>{item.email}</a>
                                ) : (
                                  <span className="admin-email">No email</span>
                                )}
                                {wa ? (
                                  <a href={wa} target="_blank" rel="noopener noreferrer">{item.phone}</a>
                                ) : (
                                  <span>{item.phone || 'No phone'}</span>
                                )}
                              </div>
                            </td>
                            <td>{item.courseTitle || '—'}</td>
                            <td>
                              <div className="message-cell">{item.preferredTime || '—'}</div>
                            </td>
                            <td>
                              <div className="message-cell">{item.reply || '—'}</div>
                            </td>
                            <td>
                              <span className={`status-pill ${item.status === 'contacted' ? 'contacted' : 'new'}`}>
                                {item.status === 'contacted' ? 'Contacted' : 'New'}
                              </span>
                            </td>
                            <td>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td>
                            {listTab === 'trash' ? (
                              <td>{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : '—'}</td>
                            ) : null}
                            <td>
                              {listTab === 'inbox' ? (
                                <div className="contact-row-actions">
                                  <button
                                    type="button"
                                    className="contact-reply-btn"
                                    onClick={() => openReply(item)}
                                    disabled={!String(item.email || '').trim() || updatingId === item._id || replySending || quarantining}
                                    title={item.email ? `Reply to ${item.email}` : 'No email address'}
                                  >
                                    <i className="fas fa-reply" aria-hidden="true" /> Reply
                                  </button>
                                  <select
                                    className="status-select"
                                    value={item.status || 'new'}
                                    onChange={(e) => updateStatus(item._id, e.target.value)}
                                    disabled={updatingId === item._id || quarantining}
                                    aria-label={`Status for ${person}`}
                                  >
                                    <option value="new">New</option>
                                    <option value="contacted">Contacted</option>
                                  </select>
                                  <button
                                    type="button"
                                    className="contact-quarantine-btn"
                                    onClick={() => quarantineIds([item._id])}
                                    disabled={quarantining || updatingId === item._id}
                                  >
                                    <i className="fas fa-archive" aria-hidden="true" /> Quarantine
                                  </button>
                                </div>
                              ) : (
                                <div className="contact-trash-actions">
                                  <button
                                    type="button"
                                    className="contact-restore-btn"
                                    onClick={() => restoreIds([item._id])}
                                    disabled={trashActionsBusy}
                                  >
                                    <i className="fas fa-undo" aria-hidden="true" /> Restore
                                  </button>
                                  <button
                                    type="button"
                                    className="contact-purge-btn"
                                    onClick={() => purgeIds([item._id])}
                                    disabled={trashActionsBusy}
                                  >
                                    <i className="fas fa-ban" aria-hidden="true" /> Delete forever
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filtered.length > ITEMS_PER_PAGE && (
                <AdminTablePagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrialRequests;
