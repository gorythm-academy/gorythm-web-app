import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getAuthToken } from '../../../utils/authStorage';
import '../Admin.scss';

const ContactMessages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const token = getAuthToken();
        const response = await axios.get('http://localhost:5000/api/contact/admin/messages', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(response.data?.messages || []);
      } catch (error) {
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, []);

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1><i className="fas fa-envelope-open-text"></i> Contact Messages</h1>
        <p>Messages sent from the public contact form.</p>
      </div>
      {loading ? (
        <p>Loading messages...</p>
      ) : (
        <div className="settings-card">
          <div className="card-body">
            {messages.length === 0 ? (
              <p>No contact messages yet.</p>
            ) : (
              <div className="activities-list">
                {messages.map((m) => (
                  <div key={m._id} className="activity-item">
                    <div className="activity-content">
                      <p><strong>{m.name}</strong> ({m.email})</p>
                      <p>{m.subject || 'No subject'} - {m.message}</p>
                      <span className="activity-time">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactMessages;
