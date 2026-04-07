import React from 'react';
import { SiTiktok } from 'react-icons/si';
import { FACEBOOK_URL, INSTAGRAM_URL, YOUTUBE_URL, TIKTOK_URL, CONTACT_PHONE, INFO_EMAIL, WHATSAPP_URL } from '../../config/constants';
import './SocialSidebar.scss';

const SocialSidebar = ({ isOpen, onClose }) => {
  const socialLinks = [
    { id: 'facebook', icon: 'fab fa-facebook-f', label: 'Facebook', url: FACEBOOK_URL, accent: 'facebook' },
    { id: 'instagram', icon: 'fab fa-instagram', label: 'Instagram', url: INSTAGRAM_URL, accent: 'instagram' },
    { id: 'youtube', icon: 'fab fa-youtube', label: 'YouTube', url: YOUTUBE_URL, accent: 'youtube' },
    {
      id: 'tiktok',
      label: 'TikTok',
      url: TIKTOK_URL,
      accent: 'tiktok',
      customIcon: (
        <SiTiktok className="social-tiktok-svg" color="#ffffff" size={26} aria-hidden focusable={false} />
      ),
    },
  ];

  return (
    <>
      <div className={`social-sidebar-panel ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Connect With Us</h3>
          <button
            className="close-sidebar"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            &times;
          </button>
        </div>

        <div className="sidebar-content-wrapper">
          {/* VERTICAL CENTERED ICONS WITH LABELS */}
          <div className="social-icons-vertical-center">
            {socialLinks.map((social) => (
              <a
                key={social.id}
                href={social.url}
                className={`social-icon-item ${social.id === 'tiktok' ? 'social-icon-item--tiktok' : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
              >
                <div className={`icon-container ${social.accent}-icon`}>
                  {social.customIcon ? social.customIcon : <i className={social.icon} />}
                </div>
                <span className="social-label">{social.label}</span>
              </a>
            ))}
          </div>

          {/* CONTACT INFO AT BOTTOM */}
          <div className="sidebar-contact-info">
            <div className="contact-item">
              <i className="fas fa-whatsapp contact-icon"></i>
              <div className="contact-details">
                <span className="contact-label">WhatsApp</span>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="contact-value">{CONTACT_PHONE}</a>
              </div>
            </div>
            <div className="contact-item">
              <i className="fas fa-envelope contact-icon"></i>
              <div className="contact-details">
                <span className="contact-label">Email Us</span>
                <a href={`mailto:${INFO_EMAIL}`} className="contact-value">{INFO_EMAIL}</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}
    </>
  );
};

export default SocialSidebar;