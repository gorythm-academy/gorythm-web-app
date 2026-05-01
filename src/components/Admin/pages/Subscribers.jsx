import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import { API_BASE_URL } from '../../../config/constants';
import '../Admin.scss';

const Subscribers = () => {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSubscribers = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await axios.get(`${API_BASE_URL}/api/subscribers/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubscribers(response.data?.subscribers || []);
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
    if (!q) return subscribers;
    return subscribers.filter((subscriber) => {
      const email = String(subscriber.email || '').toLowerCase();
      const source = String(subscriber.source || '').toLowerCase();
      return email.includes(q) || source.includes(q);
    });
  }, [subscribers, searchTerm]);

  return (
    <div className="settings-page subscribers-page">
      <div className="settings-header">
        <h1><i className="fas fa-user-plus"></i> Subscribers</h1>
        <p>Emails collected from Subscribe section and Newsletter popup.</p>
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
                <button type="button" className="refresh-btn" onClick={fetchSubscribers}>
                  <i className="fas fa-sync-alt"></i> Refresh
                </button>
              </div>
            </div>

            {filteredSubscribers.length === 0 ? (
              <p className="contact-empty-hint">
                {subscribers.length === 0
                  ? 'No subscriber emails yet.'
                  : 'No subscriber matches your search.'}
              </p>
            ) : (
              <div className="contact-messages-table-wrap">
                <table className="contact-messages-table subscribers-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Source</th>
                      <th>Subscribed</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubscribers.map((subscriber) => (
                      <tr key={subscriber._id}>
                        <td>{subscriber.email}</td>
                        <td>{subscriber.source || 'unknown'}</td>
                        <td>{new Date(subscriber.createdAt).toLocaleString()}</td>
                        <td>{new Date(subscriber.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscribers;
